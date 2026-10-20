import { RequestError } from './errors.js'

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

async function readBody(request, maxBytes) {
  const declared = Number.parseInt(request.headers['content-length'] ?? '', 10)
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new RequestError(413, 'request_too_large', '图片请求过大')
  }

  const chunks = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > maxBytes) {
      throw new RequestError(413, 'request_too_large', '图片请求过大')
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function assertImage(mediaType, bytes, config) {
  if (!SUPPORTED_IMAGE_TYPES.has(mediaType)) {
    throw new RequestError(415, 'unsupported_image_type', '仅支持 JPEG、PNG 或 WebP 图片')
  }
  if (bytes.length === 0) {
    throw new RequestError(400, 'empty_image', '图片内容为空')
  }
  if (bytes.length > config.maxImageBytes) {
    throw new RequestError(413, 'image_too_large', '单张图片不能超过 5MB')
  }
  return { mediaType, bytes }
}

function decodeBase64(value) {
  if (typeof value !== 'string' || value.length === 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new RequestError(400, 'invalid_image_data', '图片编码无效')
  }
  return Buffer.from(value, 'base64')
}

export async function readImages(request, config) {
  const mediaType = String(request.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase()

  if (SUPPORTED_IMAGE_TYPES.has(mediaType)) {
    const bytes = await readBody(request, config.maxImageBytes)
    return [assertImage(mediaType, bytes, config)]
  }

  if (mediaType !== 'application/json') {
    throw new RequestError(415, 'unsupported_content_type', '请上传图片或 JSON 图片列表')
  }

  // Base64 adds roughly 33% overhead. Keep a small allowance for JSON keys.
  const requestLimit = Math.ceil(config.maxTotalImageBytes * 4 / 3) + 64 * 1024
  const raw = await readBody(request, requestLimit)
  let body
  try {
    body = JSON.parse(raw.toString('utf8'))
  } catch {
    throw new RequestError(400, 'invalid_json', '请求格式无效')
  }

  if (!Array.isArray(body?.images) || body.images.length === 0) {
    throw new RequestError(400, 'images_required', '请至少上传一张图片')
  }
  if (body.images.length > config.maxImages) {
    throw new RequestError(400, 'too_many_images', `一次最多上传 ${config.maxImages} 张图片`)
  }

  let total = 0
  return body.images.map((image) => {
    const itemType = typeof image?.mediaType === 'string' ? image.mediaType.toLowerCase() : ''
    const bytes = decodeBase64(image?.dataBase64)
    total += bytes.length
    if (total > config.maxTotalImageBytes) {
      throw new RequestError(413, 'images_too_large', '图片总大小超过限制')
    }
    return assertImage(itemType, bytes, config)
  })
}
