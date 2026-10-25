import { RequestError } from './errors.js'

const nullableString = (value) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

const nullableNumber = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const nullableInteger = (value) => {
  const parsed = nullableNumber(value)
  return parsed === null ? null : Math.round(parsed)
}

const ABV_QUALIFIERS = new Set(['exact', 'gte', 'lte', 'approx', 'unknown'])

function normalizeItem(item, index, imageCount) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new RequestError(422, 'invalid_model_result', '模型返回了无效的酒款数据')
  }

  const requestedImageOrder = nullableInteger(item.image_order)
  const imageOrder = requestedImageOrder && requestedImageOrder >= 1 && requestedImageOrder <= imageCount
    ? requestedImageOrder
    : Math.min(index + 1, imageCount)
  const qualifier = ABV_QUALIFIERS.has(item.abv?.qualifier) ? item.abv.qualifier : 'unknown'
  const collaborations = Array.isArray(item.collaboration)
    ? item.collaboration.map(nullableString).filter(Boolean)
    : []

  return {
    image_order: imageOrder,
    name_cn: nullableString(item.name_cn),
    name_en: nullableString(item.name_en),
    title: nullableString(item.name_cn) || nullableString(item.name_en) || nullableString(item.title),
    subtitle: nullableString(item.subtitle),
    series_code: nullableString(item.series_code),
    style_en: nullableString(item.style_en),
    style_cn: nullableString(item.style_cn),
    abv: {
      value: nullableNumber(item.abv?.value),
      qualifier,
      raw: nullableString(item.abv?.raw),
    },
    volume_ml: nullableInteger(item.volume_ml),
    volume_raw: nullableString(item.volume_raw),
    brewery: nullableString(item.brewery),
    collaboration: collaborations,
    price: nullableNumber(item.price),
    currency: nullableString(item.currency),
    notes: nullableString(item.notes),
    warning: nullableString(item.warning),
  }
}

export function normalizeBeerLabelResult(value, imageCount) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.items)) {
    throw new RequestError(422, 'invalid_model_result', '模型未返回有效的识别结果', { reason: 'invalid_shape' })
  }
  if (value.items.length > 100) {
    throw new RequestError(422, 'invalid_model_result', '模型返回的酒款数量异常', { reason: 'too_many_items' })
  }
  const items = value.items
    .map((item, index) => normalizeItem(item, index, imageCount))
    .filter((item) => item.title)
  if (!items.length) {
    throw new RequestError(422, 'invalid_model_result', '没有识别到可用的酒款名称，请换一张图片', { reason: 'missing_name' })
  }
  return { items }
}

export function toPublicBeerLabelResults(items) {
  return items.map((item) => ({
    imageOrder: item.image_order,
    name: item.name_cn || item.name_en || item.title,
    nameCn: item.name_cn,
    nameEn: item.name_en,
    beerStyle: item.style_cn || item.style_en,
    abv: item.abv.value,
    brewery: item.brewery,
    collabBreweries: item.collaboration.slice(0, 3),
  }))
}
