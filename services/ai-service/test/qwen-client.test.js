import assert from 'node:assert/strict'
import test from 'node:test'
import { createQwenBeerLabelRecognizer } from '../src/qwen-client.js'

const config = {
  dashscopeBaseUrl: 'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
  dashscopeApiKey: 'test-key',
  dashscopeModel: 'qwen3.8-flash',
  modelTimeoutMs: 5_000,
}

test('calls Qwen 3.8 Flash in non-thinking JSON mode', async () => {
  let request
  const recognize = createQwenBeerLabelRecognizer(config, async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) }
    return new Response(JSON.stringify({
      id: 'model-request-1',
      model: 'qwen3.8-flash',
      choices: [{
        message: {
          content: JSON.stringify({
            items: [{
              image_order: 1,
              title: '漫長的季節',
              subtitle: 'One Year Later',
              series_code: null,
              style_en: 'Berliner Weisse',
              style_cn: '过桶野菌柏林酸小麦',
              abv: { value: 3.6, qualifier: 'exact', raw: 'ABV: 3.6%' },
              volume_ml: null,
              volume_raw: null,
              brewery: '彼岸酿造 The Other Shore Brew',
              collaboration: ['寒武纪 CAMBREW'],
              price: null,
              currency: null,
              notes: null,
              warning: null,
            }],
          }),
        },
      }],
      usage: { total_tokens: 100 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })

  const result = await recognize([{ mediaType: 'image/png', bytes: Buffer.from('image') }])

  assert.equal(request.url, `${config.dashscopeBaseUrl}/chat/completions`)
  assert.equal(request.body.model, 'qwen3.8-flash')
  assert.equal(request.body.enable_thinking, false)
  assert.deepEqual(request.body.response_format, { type: 'json_object' })
  assert.match(request.body.messages[0].content[0].text, /简体中文/)
  assert.match(request.body.messages[0].content[1].image_url.url, /^data:image\/png;base64,/)
  assert.equal(result.items[0].abv.value, 3.6)
  assert.equal(result.items[0].collaboration[0], '寒武纪 CAMBREW')
})

test('rejects malformed model JSON', async () => {
  const recognize = createQwenBeerLabelRecognizer(config, async () => new Response(JSON.stringify({
    choices: [{ message: { content: 'not-json' } }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

  await assert.rejects(
    () => recognize([{ mediaType: 'image/jpeg', bytes: Buffer.from('image') }]),
    (error) => error.code === 'invalid_model_result' && error.status === 422,
  )
})

test('keeps provider status and code for server-side diagnostics', async () => {
  const recognize = createQwenBeerLabelRecognizer(config, async () => new Response(JSON.stringify({
    error: { code: 'Arrearage' },
  }), { status: 400, headers: { 'Content-Type': 'application/json' } }))

  await assert.rejects(
    () => recognize([{ mediaType: 'image/jpeg', bytes: Buffer.from('image') }]),
    (error) => error.code === 'model_error'
      && error.details.providerStatus === 400
      && error.details.providerCode === 'Arrearage',
  )
})
