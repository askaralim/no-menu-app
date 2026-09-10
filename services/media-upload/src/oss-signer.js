import CredentialsPackage from '@alicloud/credentials'
import OSS from 'ali-oss'
import { randomUUID } from 'node:crypto'
import { RequestError } from './upload-request.js'

// @alicloud/credentials is CommonJS; native Node ESM exposes its default export here.
const Credential = CredentialsPackage.default

export function createOssSigner(config) {
  const credential = new Credential({
    type: 'ecs_ram_role',
    roleName: config.ossRamRoleName,
    disableIMDSv1: true,
  })

  return async function signPutUrl({ objectPath, contentType }) {
    const temporary = await credential.getCredential()
    const client = new OSS({
      accessKeyId: temporary.accessKeyId,
      accessKeySecret: temporary.accessKeySecret,
      stsToken: temporary.securityToken,
      bucket: config.ossBucket,
      region: config.ossRegion,
      secure: true,
      authorizationV4: true,
    })

    return client.signatureUrlV4(
      'PUT',
      config.uploadUrlTtlSeconds,
      { headers: { 'content-type': contentType } },
      objectPath,
    )
  }
}

const ALLOWED_IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const SAFE_FILE = '[A-Za-z0-9_-][A-Za-z0-9._-]{0,119}'
const CANONICAL_TENANT_DRINK = new RegExp(
  `^prod/tenants/${UUID}/drinks/${UUID}/${SAFE_FILE}$`,
  'i',
)
const LEGACY_TENANT_DRINK = new RegExp(`^${UUID}/drinks/${UUID}/${SAFE_FILE}$`, 'i')
const LEGACY_TENANT_COVER = new RegExp(`^${UUID}/cover/${SAFE_FILE}$`, 'i')

function ossClient(config, temporary) {
  return new OSS({
    accessKeyId: temporary.accessKeyId,
    accessKeySecret: temporary.accessKeySecret,
    stsToken: temporary.securityToken,
    bucket: config.ossBucket,
    region: config.ossRegion,
    secure: true,
    authorizationV4: true,
  })
}

function header(headers, name) {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

function validatedImage(contentType, contentLength) {
  const mime = String(contentType || '').split(';', 1)[0].trim().toLowerCase()
  const length = Number(contentLength)
  if (!ALLOWED_IMAGE_TYPES.has(mime)) {
    throw new RequestError(400, 'invalid_source_image', '商品图片必须是 JPEG、PNG 或 WebP')
  }
  if (!Number.isFinite(length) || length <= 0 || length > MAX_IMAGE_BYTES) {
    throw new RequestError(400, 'invalid_source_image', '商品图片不能超过 2MB')
  }
  return { mime, extension: ALLOWED_IMAGE_TYPES.get(mime) }
}

export function createProductImagePromoter(config, fetchImpl = fetch) {
  const credential = new Credential({
    type: 'ecs_ram_role',
    roleName: config.ossRamRoleName,
    disableIMDSv1: true,
  })
  const supabaseHost = new URL(config.supabaseUrl).hostname
  const ossCdnHost = new URL(config.ossCdnBaseUrl).hostname

  return async function promoteProductImage({ productId, sourceImageUrl }) {
    let sourceUrl
    try {
      sourceUrl = new URL(sourceImageUrl)
    } catch {
      throw new RequestError(400, 'invalid_source_image', '图片地址无效')
    }
    const temporary = await credential.getCredential()
    const client = ossClient(config, temporary)
    let image
    let sourceKey = null
    let body = null

    if (sourceUrl.hostname === ossCdnHost) {
      sourceKey = sourceUrl.pathname.split('/').filter(Boolean).map(decodeURIComponent).join('/')
      if (!CANONICAL_TENANT_DRINK.test(sourceKey) && !LEGACY_TENANT_DRINK.test(sourceKey)) {
        throw new RequestError(400, 'invalid_source_image', '只能归档商家酒款图片')
      }
      const head = await client.head(sourceKey)
      image = validatedImage(header(head.res?.headers, 'content-type'), header(head.res?.headers, 'content-length'))
    } else if (
      sourceUrl.hostname === supabaseHost &&
      sourceUrl.pathname.startsWith('/storage/v1/object/public/taplist-media/')
    ) {
      const legacySourceKey = decodeURIComponent(
        sourceUrl.pathname.slice('/storage/v1/object/public/taplist-media/'.length),
      )
      if (!LEGACY_TENANT_DRINK.test(legacySourceKey)) {
        throw new RequestError(400, 'invalid_source_image', '只能归档商家酒款图片')
      }
      const response = await fetchImpl(sourceUrl, {
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) throw new RequestError(400, 'source_image_unavailable', '无法读取原商品图片')
      image = validatedImage(response.headers.get('content-type'), response.headers.get('content-length'))
      body = Buffer.from(await response.arrayBuffer())
      if (body.length > MAX_IMAGE_BYTES) {
        throw new RequestError(400, 'invalid_source_image', '商品图片不能超过 2MB')
      }
    } else {
      throw new RequestError(400, 'invalid_source_image', '图片来源不受支持')
    }

    const objectPath = `prod/products/${productId}/${randomUUID()}.${image.extension}`
    if (sourceKey) {
      await client.copy(objectPath, sourceKey)
    } else {
      await client.put(objectPath, body, { headers: { 'Content-Type': image.mime } })
    }
    return {
      objectPath,
      cdnUrl: `${config.ossCdnBaseUrl}/${objectPath}`,
    }
  }
}

export function createTenantCoverPromoter(config, fetchImpl = fetch) {
  const credential = new Credential({
    type: 'ecs_ram_role',
    roleName: config.ossRamRoleName,
    disableIMDSv1: true,
  })
  const supabaseHost = new URL(config.supabaseUrl).hostname

  return async function promoteTenantCover({ tenantId, sourceImageUrl }) {
    let sourceUrl
    try {
      sourceUrl = new URL(sourceImageUrl)
    } catch {
      throw new RequestError(400, 'invalid_source_image', '图片地址无效')
    }
    if (
      sourceUrl.hostname !== supabaseHost
      || !sourceUrl.pathname.startsWith('/storage/v1/object/public/taplist-media/')
    ) {
      throw new RequestError(400, 'invalid_source_image', '只能迁移 Supabase 店铺封面')
    }
    const sourceKey = decodeURIComponent(
      sourceUrl.pathname.slice('/storage/v1/object/public/taplist-media/'.length),
    )
    if (!LEGACY_TENANT_COVER.test(sourceKey) || !sourceKey.toLowerCase().startsWith(`${tenantId}/`)) {
      throw new RequestError(400, 'invalid_source_image', '店铺封面路径无效')
    }
    const response = await fetchImpl(sourceUrl, { redirect: 'error', signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new RequestError(400, 'source_image_unavailable', '无法读取原店铺封面')
    const image = validatedImage(response.headers.get('content-type'), response.headers.get('content-length'))
    const body = Buffer.from(await response.arrayBuffer())
    if (body.length > MAX_IMAGE_BYTES) throw new RequestError(400, 'invalid_source_image', '店铺封面不能超过 2MB')

    const objectPath = `prod/tenants/${tenantId}/covers/${randomUUID()}.${image.extension}`
    const temporary = await credential.getCredential()
    await ossClient(config, temporary).put(objectPath, body, { headers: { 'Content-Type': image.mime } })
    return { objectPath, cdnUrl: `${config.ossCdnBaseUrl}/${objectPath}` }
  }
}
