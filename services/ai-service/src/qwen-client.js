import { BEER_LABEL_PROMPT } from './beer-label-prompt.js'
import { RequestError } from './errors.js'
import { normalizeBeerLabelResult } from './result.js'

async function safeJson(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function imageContent(images) {
  return images.map(({ mediaType, bytes }) => ({
    type: 'image_url',
    image_url: { url: `data:${mediaType};base64,${bytes.toString('base64')}` },
  }))
}

export function createQwenBeerLabelRecognizer(config, fetchImpl = fetch) {
  return async function recognizeBeerLabels(images) {
    let response
    try {
      response = await fetchImpl(`${config.dashscopeBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.dashscopeApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.dashscopeModel,
          enable_thinking: false,
          temperature: 0,
          max_completion_tokens: 4096,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: BEER_LABEL_PROMPT },
                ...imageContent(images),
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(config.modelTimeoutMs),
      })
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new RequestError(504, 'model_timeout', '图片识别超时，请稍后重试')
      }
      throw new RequestError(502, 'model_unavailable', '图片识别服务暂时不可用')
    }

    const payload = await safeJson(response)
    if (!response.ok) {
      const details = {
        providerStatus: response.status,
        providerCode: payload?.error?.code || payload?.code || null,
      }
      if (response.status === 429) {
        throw new RequestError(429, 'model_rate_limited', '识别请求较多，请稍后重试', details)
      }
      throw new RequestError(502, 'model_error', '图片识别服务返回异常', details)
    }

    const content = payload?.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      throw new RequestError(422, 'invalid_model_result', '模型未返回有效的识别结果')
    }

    let parsed
    try {
      parsed = JSON.parse(content)
    } catch {
      throw new RequestError(422, 'invalid_model_result', '模型返回的识别结果格式无效')
    }

    try {
      return {
        ...normalizeBeerLabelResult(parsed, images.length),
        model: payload.model || config.dashscopeModel,
        usage: payload.usage || null,
        providerRequestId: payload.id || null,
      }
    } catch (error) {
      if (error instanceof RequestError) {
        error.details = { ...error.details, providerRequestId: payload.id || null }
      }
      throw error
    }
  }
}
