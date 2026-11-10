import { writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { EXPECTED_APP_ID, detectImage, fetchAccessToken } from './venue-miniprogram-code.mjs'

const CAMPAIGN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const QR_CODE = /^[A-Za-z0-9]{8}$/
const ENV_VERSIONS = new Set(['develop', 'trial', 'release'])

export function validateInput(campaignId, qrCode, envVersion) {
  if (!CAMPAIGN_ID.test(campaignId)) throw new Error('Invalid campaign id')
  if (!QR_CODE.test(qrCode)) throw new Error('Invalid campaign QR code')
  if (!ENV_VERSIONS.has(envVersion)) throw new Error('env-version must be develop, trial, or release')
}

export function buildRequestBody(qrCode, envVersion, { allowUnpublishedPage = false, poster = false } = {}) {
  if (!QR_CODE.test(qrCode)) throw new Error('Invalid campaign QR code')
  if (!ENV_VERSIONS.has(envVersion)) throw new Error('Invalid environment version')
  // Keep qrCode stable after issuance. The page resolves current content from the DB.
  // Prepublished release codes become usable only once this page has been released.
  return {
    scene: poster ? `p_${qrCode}` : qrCode,
    page: 'pages/campaign/campaign',
    check_path: envVersion === 'release' && !allowUnpublishedPage,
    env_version: envVersion,
    width: 430,
  }
}

export async function generateCode(accessToken, qrCode, envVersion, options) {
  const response = await fetch(
    `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequestBody(qrCode, envVersion, options)),
      signal: AbortSignal.timeout(30000),
    },
  )
  const body = Buffer.from(await response.arrayBuffer())
  if (!response.ok) throw new Error(`WeChat code request failed: ${response.status}`)
  return { body, ...detectImage(body, response.headers.get('content-type') || '') }
}

async function main() {
  const [campaignId, rawQrCode, envVersion, imageOutput, reportOutput, ...flags] = process.argv.slice(2)
  const qrCode = String(rawQrCode || '')
  if (!campaignId || !rawQrCode || !envVersion || !imageOutput || !reportOutput
    || flags.some(flag => !['--allow-unpublished-page', '--poster'].includes(flag))) {
    throw new Error('Usage: campaign-miniprogram-code.mjs CAMPAIGN_ID QR_CODE develop|trial|release IMAGE_OUTPUT REPORT_OUTPUT [--allow-unpublished-page] [--poster]')
  }
  validateInput(campaignId, qrCode, envVersion)
  const options = { allowUnpublishedPage: flags.includes('--allow-unpublished-page'), poster: flags.includes('--poster') }
  const requestBody = buildRequestBody(qrCode, envVersion, options)
  const appId = process.env.WECHAT_MINIPROGRAM_APP_ID || EXPECTED_APP_ID
  const appSecret = process.env.WECHAT_MINIPROGRAM_APP_SECRET
  if (appId !== EXPECTED_APP_ID) throw new Error('Unexpected WeChat mini-program AppID')
  if (!appSecret) throw new Error('WECHAT_MINIPROGRAM_APP_SECRET is required')

  const accessToken = await fetchAccessToken(appId, appSecret)
  const generated = await generateCode(accessToken, qrCode, envVersion, options)
  await writeFile(imageOutput, generated.body, { mode: 0o600 })
  await writeFile(reportOutput, JSON.stringify({
    campaign_id: campaignId,
    qr_code: qrCode,
    scene: requestBody.scene,
    page: 'pages/campaign/campaign',
    env_version: envVersion,
    check_path: requestBody.check_path,
    content_type: generated.contentType,
    extension: generated.extension,
    bytes: generated.body.length,
    sha256: createHash('sha256').update(generated.body).digest('hex'),
    next_step: 'Upload this image as mini-program-code in WebAdmin; publishing stores its OSS URL in campaign_events.mini_program_code_url.',
  }, null, 2) + '\n', { mode: 0o600 })
  console.log(`Generated ${envVersion} campaign mini-program code for ${qrCode}: ${imageOutput}`)
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
