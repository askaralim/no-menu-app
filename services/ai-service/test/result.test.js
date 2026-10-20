import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeBeerLabelResult, toPublicBeerLabelResults } from '../src/result.js'

test('normalizes numeric fields and empty values without inventing data', () => {
  const result = normalizeBeerLabelResult({
    items: [{
      image_order: '1',
      title: ' Fresh Orange 阳光砂糖橘 ',
      subtitle: '',
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
  assert.equal(result.items[0].title, 'Fresh Orange 阳光砂糖橘')
  assert.equal(result.items[0].subtitle, null)
  assert.equal(result.items[0].series_code, '#010')
  assert.equal(result.items[0].volume_ml, null)
  assert.deepEqual(result.items[0].collaboration, [])
})

test('maps the internal model result to the stable product draft fields', () => {
  const results = toPublicBeerLabelResults([{
    image_order: 1,
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
    beerStyle: '过桶野菌柏林酸小麦',
    abv: 3.6,
    brewery: '彼岸酿造',
    collabBreweries: ['寒武纪', '班利山谷蒸馏所', '第三个'],
  }])
})
