import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeBeerLabelResult, toPublicBeerLabelResults } from '../src/result.js'

test('normalizes numeric fields and empty values without inventing data', () => {
  const result = normalizeBeerLabelResult({
    items: [{
      image_order: '1',
      name_cn: ' 阳光砂糖橘 ',
      name_en: ' Fresh Orange ',
      series_code: ' #010 ',
      abv: { value: '2.5', qualifier: 'gte', raw: '≥2.5%vol' },
      volume_ml: '',
      collaboration: null,
      price: null,
    }],
  }, 1)

  assert.deepEqual(result.items[0].abv, {
    value: 2.5,
    qualifier: 'gte',
    raw: '≥2.5%vol',
  })
  assert.equal(result.items[0].title, '阳光砂糖橘')
  assert.equal(result.items[0].name_cn, '阳光砂糖橘')
  assert.equal(result.items[0].name_en, 'Fresh Orange')
  assert.equal(result.items[0].subtitle, null)
  assert.equal(result.items[0].series_code, '#010')
  assert.equal(result.items[0].volume_ml, null)
  assert.deepEqual(result.items[0].collaboration, [])
})

test('maps the internal model result to the stable product draft fields', () => {
  const results = toPublicBeerLabelResults([{
    image_order: 1,
    name_cn: '漫长的季节',
    name_en: 'One Year Later',
    title: '漫长的季节',
    style_cn: '过桶野菌柏林酸小麦',
    style_en: 'Berliner Weisse',
    abv: { value: 3.6 },
    brewery: '彼岸酿造',
    collaboration: ['寒武纪', '班利山谷蒸馏所', '第三个', '不会返回的第四个'],
  }])

  assert.deepEqual(results, [{
    imageOrder: 1,
    name: '漫长的季节',
    nameCn: '漫长的季节',
    nameEn: 'One Year Later',
    beerStyle: '过桶野菌柏林酸小麦',
    abv: 3.6,
    brewery: '彼岸酿造',
    collabBreweries: ['寒武纪', '班利山谷蒸馏所', '第三个'],
  }])
})

test('rejects results without a usable beer name', () => {
  assert.throws(
    () => normalizeBeerLabelResult({
      items: [{
        image_order: 1,
        name_cn: null,
        name_en: null,
        title: null,
        style_cn: null,
        style_en: null,
        abv: { value: null, qualifier: 'unknown', raw: null },
        brewery: null,
        collaboration: [],
      }],
    }, 1),
    (error) => error.code === 'invalid_model_result'
      && error.status === 422
      && error.details.reason === 'missing_name',
  )
})

test('keeps named results when another image has no recognizable beer', () => {
  const result = normalizeBeerLabelResult({
    items: [
      { image_order: 1, name_cn: null, name_en: null, title: null, collaboration: [] },
      { image_order: 2, name_en: 'GREENHOUSE', collaboration: [] },
    ],
  }, 2)

  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].image_order, 2)
  assert.equal(result.items[0].title, 'GREENHOUSE')
})
