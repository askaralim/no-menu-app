import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  EXPECTED_APP_ID,
  fetchAccessToken,
  generateCode,
  objectPath,
  validateInput,
} from './venue-miniprogram-code.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SLUG = /^[a-z0-9][a-z0-9-]*$/
const sha256 = body => createHash('sha256').update(body).digest('hex')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'))
}

async function main() {
  const [manifestPath, outputDir, reportPath] = process.argv.slice(2)
  if (!manifestPath || !outputDir || !reportPath) {
    throw new Error('Usage: venue-miniprogram-code-batch.mjs MANIFEST OUTPUT_DIR REPORT')
  }

  const manifest = await readJson(manifestPath)
  const venues = Array.isArray(manifest.venues) ? manifest.venues : []
  if (manifest.environment !== 'release' || manifest.count !== venues.length || venues.length === 0) {
    throw new Error('Invalid release manifest')
  }
  const seenCodes = new Set()
  for (const venue of venues) {
    validateInput(venue.tenant_id, venue.qr_code, 'release')
    if (!UUID.test(venue.tenant_id) || !SLUG.test(venue.slug) || venue.version !== 1 || seenCodes.has(venue.qr_code)) {
      throw new Error(`Invalid manifest row: ${venue.slug || 'unknown'}`)
    }
    seenCodes.add(venue.qr_code)
  }

  const appId = process.env.WECHAT_MINIPROGRAM_APP_ID || EXPECTED_APP_ID
  const appSecret = process.env.WECHAT_MINIPROGRAM_APP_SECRET
  if (appId !== EXPECTED_APP_ID) throw new Error('Unexpected WeChat mini-program AppID')
  if (!appSecret) throw new Error('WECHAT_MINIPROGRAM_APP_SECRET is required')

  await mkdir(outputDir, { recursive: true })
  let report = { environment: 'release', expected: venues.length, completed: 0, items: [] }
  try {
    report = await readJson(reportPath)
  } catch {}
  const prior = new Map((report.items || []).map(item => [item.qr_code, item]))
  const items = []
  const accessToken = await fetchAccessToken(appId, appSecret)

  for (const [index, venue] of venues.entries()) {
    const existing = prior.get(venue.qr_code)
    if (existing) {
      const body = await readFile(existing.local_path)
      if (existing.tenant_id !== venue.tenant_id || existing.sha256 !== sha256(body)) {
        throw new Error(`Resume verification failed: ${venue.qr_code}`)
      }
      items.push(existing)
      console.log(`[${index + 1}/${venues.length}] reused ${venue.slug} ${venue.qr_code}`)
      continue
    }

    const generated = await generateCode(accessToken, venue.qr_code, 'release')
    const localPath = path.join(outputDir, `${venue.slug}-${venue.qr_code}.${generated.extension}`)
    await writeFile(localPath, generated.body, { mode: 0o600 })
    const item = {
      ...venue,
      env_version: 'release',
      content_type: generated.contentType,
      bytes: generated.body.length,
      sha256: sha256(generated.body),
      local_path: localPath,
      object_path: objectPath({
        tenantId: venue.tenant_id,
        qrCode: venue.qr_code,
        envVersion: 'release',
        version: venue.version,
        extension: generated.extension,
      }),
    }
    items.push(item)
    report = { environment: 'release', expected: venues.length, completed: items.length, items }
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
    console.log(`[${index + 1}/${venues.length}] generated ${venue.slug} ${venue.qr_code}`)
    if (index + 1 < venues.length) await pause(150)
  }

  report = { environment: 'release', expected: venues.length, completed: items.length, items }
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  console.log(`Generated ${items.length}/${venues.length} release mini-program codes`)
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
