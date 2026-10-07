import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

export const EXPECTED_APP_ID = 'wx77bf342612bb4605'
const TENANT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const QR_CODE = /^[A-Z2-7]{8}$/
const ENV_VERSIONS = new Set(['develop', 'trial', 'release'])

export function validateInput(tenantId, qrCode, envVersion) {
  if (!TENANT_ID.test(tenantId)) throw new Error('Invalid tenant id')
  if (!QR_CODE.test(qrCode)) throw new Error('Invalid permanent QR code')
  if (!ENV_VERSIONS.has(envVersion)) throw new Error('env-version must be develop, trial, or release')
}

export function buildRequestBody(qrCode, envVersion) {
  if (!QR_CODE.test(qrCode)) throw new Error('Invalid permanent QR code')
  if (!ENV_VERSIONS.has(envVersion)) throw new Error('Invalid environment version')
  return {
    scene: qrCode,
    page: 'pages/bar/bar',
    check_path: envVersion === 'release',
    env_version: envVersion,
    width: 430,
  }
}

export function detectImage(body, contentType = '') {
  const type = contentType.split(';')[0].trim().toLowerCase()
  if (body.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return { extension: 'png', contentType: 'image/png' }
  }
  if (body.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) {
    return { extension: 'jpg', contentType: 'image/jpeg' }
  }
  let detail = ''
  if (type === 'application/json' || body[0] === 0x7b) {
    try {
      const payload = JSON.parse(body.toString('utf8'))
      detail = `: ${payload.errcode || 'unknown'} ${payload.errmsg || 'WeChat API error'}`
    } catch {}
  }
  throw new Error(`WeChat did not return a supported image${detail}`)
}

export function objectPath({ tenantId, qrCode, envVersion, version = 1, extension }) {
  validateInput(tenantId, qrCode, envVersion)
  if (!Number.isInteger(version) || version < 1) throw new Error('Invalid asset version')
  if (!['png', 'jpg'].includes(extension)) throw new Error('Invalid image extension')
  return `prod/tenants/${tenantId}/qr/weapp/${envVersion}/no-menu-weapp-v${version}-${qrCode}.${extension}`
}

const sha256 = body => createHash('sha256').update(body).digest('hex')

export async function fetchAccessToken(appId, appSecret) {
  const url = new URL('https://api.weixin.qq.com/cgi-bin/token')
  url.searchParams.set('grant_type', 'client_credential')
  url.searchParams.set('appid', appId)
  url.searchParams.set('secret', appSecret)
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
  const payload = await response.json()
  if (!response.ok || !payload.access_token) {
    throw new Error(`Unable to get WeChat access token: ${payload.errcode || response.status} ${payload.errmsg || ''}`)
  }
  return payload.access_token
}

export async function generateCode(accessToken, qrCode, envVersion) {
  const response = await fetch(
    `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequestBody(qrCode, envVersion)),
      signal: AbortSignal.timeout(30000),
    },
  )
  const body = Buffer.from(await response.arrayBuffer())
  if (!response.ok) throw new Error(`WeChat code request failed: ${response.status}`)
  return { body, ...detectImage(body, response.headers.get('content-type') || '') }
}

async function uploadToOss(body, path, contentType) {
  const require = createRequire(
    process.env.NOMENU_MEDIA_UPLOAD_PACKAGE_JSON
      || new URL('../../services/media-upload/package.json', import.meta.url),
  )
  const Credential = require('@alicloud/credentials').default
  const OSS = require('ali-oss')
  const roleName = process.env.OSS_RAM_ROLE_NAME
  const bucket = process.env.OSS_BUCKET
  const region = process.env.OSS_REGION
  const cdn = String(process.env.OSS_CDN_BASE_URL || '').replace(/\/+$/, '')
  if (!roleName || !bucket || !region || cdn !== 'https://img.nomenuapp.com') {
    throw new Error('OSS_RAM_ROLE_NAME, OSS_BUCKET, OSS_REGION and the expected OSS_CDN_BASE_URL are required')
  }
  const credential = new Credential({ type: 'ecs_ram_role', roleName, disableIMDSv1: true })
  const temporary = await credential.getCredential()
  const client = new OSS({
    accessKeyId: temporary.accessKeyId,
    accessKeySecret: temporary.accessKeySecret,
    stsToken: temporary.securityToken,
    bucket,
    region,
    secure: true,
    authorizationV4: true,
  })
  try {
    const existing = await client.get(path)
    if (sha256(existing.content) !== sha256(body)) throw new Error(`Conflicting OSS object: ${path}`)
  } catch (error) {
    if (error.code !== 'NoSuchKey') throw error
    await client.put(path, body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'x-oss-forbid-overwrite': 'true',
      },
    })
  }
  const stored = await client.get(path)
  if (sha256(stored.content) !== sha256(body)) throw new Error('OSS verification failed')
  return `${cdn}/${path}`
}

async function main() {
  const [tenantId, rawQrCode, envVersion, imageOutput, reportOutput, mode] = process.argv.slice(2)
  const qrCode = String(rawQrCode || '').toUpperCase()
  if (!tenantId || !rawQrCode || !envVersion || !imageOutput || !reportOutput || (mode && mode !== '--upload')) {
    throw new Error('Usage: venue-miniprogram-code.mjs TENANT_ID QR_CODE develop|trial|release IMAGE_OUTPUT REPORT_OUTPUT [--upload]')
  }
  validateInput(tenantId, qrCode, envVersion)
  const appId = process.env.WECHAT_MINIPROGRAM_APP_ID || EXPECTED_APP_ID
  const appSecret = process.env.WECHAT_MINIPROGRAM_APP_SECRET
  if (appId !== EXPECTED_APP_ID) throw new Error('Unexpected WeChat mini-program AppID')
  if (!appSecret) throw new Error('WECHAT_MINIPROGRAM_APP_SECRET is required')

  const accessToken = await fetchAccessToken(appId, appSecret)
  const generated = await generateCode(accessToken, qrCode, envVersion)
  const path = objectPath({ tenantId, qrCode, envVersion, version: 1, extension: generated.extension })
  await writeFile(imageOutput, generated.body, { mode: 0o600 })
  const imageUrl = mode === '--upload'
    ? await uploadToOss(generated.body, path, generated.contentType)
    : null
  const report = {
    tenant_id: tenantId,
    qr_code: qrCode,
    scene: qrCode,
    page: 'pages/bar/bar',
    env_version: envVersion,
    object_path: path,
    image_url: imageUrl,
    content_type: generated.contentType,
    bytes: generated.body.length,
    sha256: sha256(generated.body),
    database_ready: envVersion === 'release' && Boolean(imageUrl),
  }
  await writeFile(reportOutput, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  console.log(`Generated ${envVersion} mini-program code for ${qrCode}: ${imageOutput}`)
  if (imageUrl) console.log(`Verified OSS asset: ${imageUrl}`)
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
