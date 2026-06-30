#!/usr/bin/env node
/**
 * Seed drink_companies + drink_company_aliases from reviewed brewery/brand CSV.
 *
 * Usage:
 *   node scripts/seed_drink_companies.mjs --dry-run
 *   node scripts/seed_drink_companies.mjs
 *   node scripts/seed_drink_companies.mjs --write-sql
 *   node scripts/seed_drink_companies.mjs --write-sql --sql-out supabase/seed_drink_companies_from_verified_csv.sql
 *
 * Requires:
 *   SUPABASE_SERVICE_ROLE_KEY
 *   EXPO_PUBLIC_SUPABASE_URL | NEXT_PUBLIC_SUPABASE_URL | SUPABASE_URL
 *
 * Default CSV:
 *   taplist-mobile/tools/product-pool-audit/brewery_brand_web_verified.csv
 */

import { readFileSync, existsSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const DEFAULT_CSV = resolve(root, 'taplist-mobile/tools/product-pool-audit/brewery_brand_web_verified.csv')

const VERIFICATION_SCORE = {
  verified: 50,
  verified_historical: 48,
  corrected: 45,
  partially_verified: 30,
  unverified: 10,
  data_issue: 0,
}

const CONFIDENCE_SCORE = { high: 3, medium: 2, low: 1 }

const COUNTRY_BY_CODE = {
  CN: 'China',
  US: 'United States',
  BE: 'Belgium',
  SE: 'Sweden',
  DE: 'Germany',
  GB: 'United Kingdom',
  UK: 'United Kingdom',
  JP: 'Japan',
  HK: 'Hong Kong',
  FR: 'France',
  IT: 'Italy',
  AU: 'Australia',
  NZ: 'New Zealand',
  CA: 'Canada',
  NL: 'Netherlands',
  DK: 'Denmark',
  NO: 'Norway',
  ES: 'Spain',
  CZ: 'Czech Republic',
  AT: 'Austria',
  IE: 'Ireland',
}

const COUNTRY_ZH_TO_EN = {
  中国: 'China',
  美国: 'United States',
  比利时: 'Belgium',
  瑞典: 'Sweden',
  德国: 'Germany',
  英国: 'United Kingdom',
  日本: 'Japan',
  香港: 'Hong Kong',
  中国香港: 'Hong Kong',
  法国: 'France',
  意大利: 'Italy',
  澳大利亚: 'Australia',
  新西兰: 'New Zealand',
  加拿大: 'Canada',
  荷兰: 'Netherlands',
  丹麦: 'Denmark',
  挪威: 'Norway',
  西班牙: 'Spain',
  捷克: 'Czech Republic',
  奥地利: 'Austria',
  爱尔兰: 'Ireland',
}

function loadEnvFile(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m || process.env[m[1]]) continue
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    writeSql: false,
    csv: DEFAULT_CSV,
    sqlOut: resolve(root, 'supabase/seed_drink_companies_from_verified_csv.sql'),
  }
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--write-sql') args.writeSql = true
    else if (arg === '--csv') {
      args.csv = resolve(argv[i + 1] ?? '')
      i += 1
    } else if (arg === '--sql-out') {
      args.sqlOut = resolve(argv[i + 1] ?? '')
      i += 1
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        `Usage: node scripts/seed_drink_companies.mjs [--dry-run] [--write-sql] [--csv path] [--sql-out path]`
      )
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return args
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"'
        i += 1
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      field = ''
      if (row.some((cell) => cell.trim() !== '')) rows.push(row)
      row = []
    } else if (ch !== '\r') {
      field += ch
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    if (row.some((cell) => cell.trim() !== '')) rows.push(row)
  }

  const [header, ...body] = rows
  return body.map((cells) =>
    Object.fromEntries(header.map((key, idx) => [key, (cells[idx] ?? '').trim()]))
  )
}

function clean(value) {
  const v = (value ?? '').trim()
  return v || null
}

function normalizeKey(value) {
  if (!value) return null
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function splitNameVariants(value) {
  if (!value) return []
  return value
    .split(/[/|]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function parseRawCountryValues(value) {
  if (!value) return []
  return [...new Set(
    value
      .split('|')
      .map((part) => part.split(':')[0]?.trim())
      .filter(Boolean)
  )]
}

function detectLanguage(text) {
  if (!text) return null
  const hasCjk = /[\u4e00-\u9fff]/.test(text)
  const hasLatin = /[A-Za-z]/.test(text)
  if (hasCjk && hasLatin) return 'mixed'
  if (hasCjk) return 'zh'
  if (hasLatin) return 'en'
  return 'unknown'
}

function mapEntityType(value) {
  const v = clean(value)
  if (!v || v === 'test_data') return null
  if (v === 'cider_producer') return 'cidery'
  if (
    v === 'brewery' ||
    v === 'brand' ||
    v === 'brewery_brand' ||
    v === 'cidery' ||
    v === 'meadery' ||
    v === 'distillery' ||
    v === 'importer' ||
    v === 'other'
  ) {
    return v
  }
  return 'other'
}

function mapReviewStatus(value) {
  const v = clean(value)
  if (!v || v === 'data_issue') return 'pending'
  if (v === 'verified' || v === 'verified_historical' || v === 'corrected') return 'reviewed'
  if (v === 'partially_verified' || v === 'unverified') return 'pending'
  return 'pending'
}

function mapConfidence(value) {
  const v = clean(value)
  if (v === 'high' || v === 'medium' || v === 'low') return v
  return 'medium'
}

function mapCountry(verifiedCountry, countryCode) {
  const code = clean(countryCode)?.toUpperCase()
  if (code && COUNTRY_BY_CODE[code]) return COUNTRY_BY_CODE[code]
  const zh = clean(verifiedCountry)
  if (zh && COUNTRY_ZH_TO_EN[zh]) return COUNTRY_ZH_TO_EN[zh]
  return zh
}

function rowScore(row) {
  const status = clean(row.verification_status) ?? 'unverified'
  const confidence = clean(row.confidence) ?? 'medium'
  let score = (VERIFICATION_SCORE[status] ?? 0) + (CONFIDENCE_SCORE[confidence] ?? 0)
  if (clean(row.verified_name_zh)) score += 5
  if (clean(row.verified_name_en)) score += 3
  if (clean(row.verified_city)) score += 2
  if (clean(row.country_code)) score += 2
  if (Number.parseInt(row.drink_count ?? '0', 10) > 0) score += 1
  return score
}

function groupKey(row) {
  return clean(row.canonical_group) ?? clean(row.verified_name_zh) ?? clean(row.source_name)
}

function isSkippableRow(row) {
  const status = clean(row.verification_status)
  const entityType = clean(row.verified_entity_type)
  if (status === 'data_issue' || entityType === 'test_data') return true
  return !groupKey(row)
}

function buildSourceNote(row) {
  const parts = [
    clean(row.verification_note),
    clean(row.uncertainty_flag),
    clean(row.original_review_note),
    clean(row.operational_status) === 'closed' ? 'operational_status: closed' : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' | ') : null
}

function collectAliases(rows, canonicalName, canonicalNameEn) {
  const aliases = new Map()

  const add = (text, aliasType = 'source_value', source = 'brewery_brand_web_verified.csv') => {
    for (const variant of splitNameVariants(text)) {
      const normalized = normalizeKey(variant)
      if (!normalized) continue
      if (normalized === normalizeKey(canonicalName) || normalized === normalizeKey(canonicalNameEn)) {
        continue
      }
      if (!aliases.has(normalized)) {
        aliases.set(normalized, {
          alias: variant,
          alias_language: detectLanguage(variant),
          alias_type: aliasType,
          source,
        })
      }
    }
  }

  for (const row of rows) {
    add(row.source_name, 'source_value')
    add(row.original_candidate_zh, 'source_value')
    add(row.original_candidate_en, 'source_value')
    add(row.canonical_group, 'name')
    if (clean(row.verified_name_zh) && normalizeKey(row.verified_name_zh) !== normalizeKey(canonicalName)) {
      add(row.verified_name_zh, 'name')
    }
    if (
      clean(row.verified_name_en) &&
      normalizeKey(row.verified_name_en) !== normalizeKey(canonicalNameEn)
    ) {
      add(row.verified_name_en, 'translation')
    }
  }

  return [...aliases.values()]
}

function buildCompanies(rows) {
  const grouped = new Map()

  for (const row of rows) {
    if (isSkippableRow(row)) continue
    const key = groupKey(row)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(row)
  }

  const companies = []

  for (const [groupLabel, groupRows] of grouped.entries()) {
    const primary = [...groupRows].sort((a, b) => rowScore(b) - rowScore(a))[0]
    const entityType = mapEntityType(primary.verified_entity_type)
    if (!entityType) continue

    const canonicalName =
      clean(primary.verified_name_zh) ??
      splitNameVariants(clean(primary.canonical_group)).find((part) => /[\u4e00-\u9fff]/.test(part)) ??
      clean(primary.source_name) ??
      groupLabel

    const canonicalNameEn =
      clean(primary.verified_name_en) ??
      splitNameVariants(clean(primary.canonical_group)).find((part) => /[A-Za-z]/.test(part)) ??
      clean(primary.original_candidate_en)

    const displayName = canonicalName
    const normalizedKey =
      normalizeKey(clean(primary.canonical_group)) ??
      normalizeKey(canonicalName) ??
      normalizeKey(groupLabel)

    if (!normalizedKey) continue

    const rawCountryValues = [
      ...new Set(
        groupRows.flatMap((row) => [
          ...parseRawCountryValues(row.raw_country_values),
          ...(clean(row.verified_city) ? [clean(row.verified_city)] : []),
          ...(clean(row.original_suggested_country) ? [clean(row.original_suggested_country)] : []),
        ])
      ),
    ]

    const sourceUrls = [
      ...new Set(
        groupRows
          .flatMap((row) => (clean(row.source_urls) ?? '').split('|').map((part) => part.trim()))
          .filter(Boolean)
      ),
    ]

    const sourceNotes = [...new Set(groupRows.map(buildSourceNote).filter(Boolean))]

    companies.push({
      normalized_key: normalizedKey,
      canonical_name: canonicalName,
      canonical_name_en: canonicalNameEn,
      display_name: displayName,
      entity_type: entityType,
      country: mapCountry(primary.verified_country, primary.country_code),
      country_code: clean(primary.country_code)?.toUpperCase() ?? null,
      origin_region: clean(primary.verified_city),
      raw_country_values: rawCountryValues,
      confidence: mapConfidence(primary.confidence),
      review_status: mapReviewStatus(primary.verification_status),
      source: sourceUrls.length ? sourceUrls.join(' | ') : 'brewery_brand_web_verified.csv',
      source_note: sourceNotes.length ? sourceNotes.join(' || ') : null,
      status: groupRows.some((row) => clean(row.operational_status) === 'closed') ? 'archived' : 'active',
      aliases: collectAliases(groupRows, canonicalName, canonicalNameEn),
      _meta: {
        group_label: groupLabel,
        source_rows: groupRows.map((row) => clean(row.source_name)).filter(Boolean),
        verification_status: clean(primary.verification_status),
      },
    })
  }

  companies.sort((a, b) => a.display_name.localeCompare(b.display_name, 'zh-CN'))
  return mergeDuplicateCompanies(companies)
}

function dedupeAliases(aliases) {
  const map = new Map()
  for (const alias of aliases) {
    const key = normalizeKey(alias.alias)
    if (!key || map.has(key)) continue
    map.set(key, alias)
  }
  return [...map.values()]
}

function mergeDuplicateCompanies(companies) {
  const merged = new Map()

  for (const company of companies) {
    const mergeKey = [
      normalizeKey(company.canonical_name),
      company.country_code ?? '',
      normalizeKey(company.origin_region ?? ''),
    ].join('|')

    if (!merged.has(mergeKey)) {
      merged.set(mergeKey, company)
      continue
    }

    const existing = merged.get(mergeKey)
    existing.aliases = dedupeAliases([...existing.aliases, ...company.aliases])
    existing.raw_country_values = [
      ...new Set([...existing.raw_country_values, ...company.raw_country_values]),
    ]
    existing._meta.source_rows = [
      ...new Set([...existing._meta.source_rows, ...company._meta.source_rows]),
    ]
    if (!existing.canonical_name_en && company.canonical_name_en) {
      existing.canonical_name_en = company.canonical_name_en
    }
    if (!existing.source_note && company.source_note) {
      existing.source_note = company.source_note
    } else if (existing.source_note && company.source_note && !existing.source_note.includes(company.source_note)) {
      existing.source_note = `${existing.source_note} || ${company.source_note}`
    }
    if (existing.review_status === 'reviewed' && company.review_status === 'pending') {
      existing.review_status = 'pending'
    }
  }

  return [...merged.values()].sort((a, b) => a.display_name.localeCompare(b.display_name, 'zh-CN'))
}

function sqlQuote(value) {
  if (value == null) return 'NULL'
  return `'${String(value).replace(/'/g, "''")}'`
}

function sqlTextArray(values) {
  if (!values?.length) return "ARRAY[]::text[]"
  return `ARRAY[${values.map((value) => sqlQuote(value)).join(', ')}]::text[]`
}

function buildSql(companies, csvPath) {
  const aliasCount = companies.reduce((sum, company) => sum + company.aliases.length, 0)
  const pendingReview = companies.filter((company) => company.review_status === 'pending').length
  const archived = companies.filter((company) => company.status === 'archived').length

  const companyValues = companies
    .map((company) => {
      return `  (${[
        sqlQuote(company.normalized_key),
        sqlQuote(company.canonical_name),
        sqlQuote(company.canonical_name_en),
        sqlQuote(company.display_name),
        sqlQuote(company.entity_type),
        sqlQuote(company.country),
        sqlQuote(company.country_code),
        sqlQuote(company.origin_region),
        sqlTextArray(company.raw_country_values),
        sqlQuote(company.confidence),
        sqlQuote(company.review_status),
        sqlQuote(company.source),
        sqlQuote(company.source_note),
        sqlQuote(company.status),
      ].join(', ')})`
    })
    .join(',\n')

  const aliasRows = []
  for (const company of companies) {
    for (const alias of company.aliases) {
      aliasRows.push(
        `  (${[
          sqlQuote(company.normalized_key),
          sqlQuote(alias.alias),
          sqlQuote(alias.alias_language),
          sqlQuote(alias.alias_type),
          sqlQuote(alias.source),
        ].join(', ')})`
      )
    }
  }

  const aliasValues = aliasRows.length ? aliasRows.join(',\n') : null

  return `-- Seed drink_companies + drink_company_aliases from reviewed brewery/brand CSV.
-- Generated by: node scripts/seed_drink_companies.mjs --write-sql
-- Source CSV: ${csvPath}
-- Generated at: ${new Date().toISOString()}
--
-- Expected counts after run:
--   companies: ${companies.length}
--   aliases:   ${aliasCount}
--   pending review: ${pendingReview}
--   archived:       ${archived}
--
-- CSV -> table mapping (drink_companies):
--   canonical_group / verified_name_zh / source_name -> normalized_key (deduped group key, lowercased)
--   verified_name_zh                               -> canonical_name, display_name
--   verified_name_en                               -> canonical_name_en
--   verified_entity_type                           -> entity_type (cider_producer -> cidery)
--   verified_country + country_code                -> country, country_code
--   verified_city                                  -> origin_region
--   raw_country_values (+ city/country hints)        -> raw_country_values text[]
--   confidence                                     -> confidence
--   verification_status                            -> review_status
--   source_urls                                    -> source
--   verification_note / flags / review notes       -> source_note
--   operational_status = closed                    -> status = archived
--
-- CSV -> table mapping (drink_company_aliases):
--   source_name, original_candidate_zh/en, group variants -> alias
--   heuristic script label                               -> alias_language
--   variant kind                                         -> alias_type
--
-- Skipped CSV rows:
--   verification_status = data_issue
--   verified_entity_type = test_data
--   blank source/group/name rows
--
-- Idempotent: safe to re-run. normalized_key is not updated on conflict.

BEGIN;

INSERT INTO public.drink_companies (
  normalized_key,
  canonical_name,
  canonical_name_en,
  display_name,
  entity_type,
  country,
  country_code,
  origin_region,
  raw_country_values,
  confidence,
  review_status,
  source,
  source_note,
  status
)
VALUES
${companyValues}
ON CONFLICT (normalized_key) DO UPDATE SET
  canonical_name = EXCLUDED.canonical_name,
  canonical_name_en = EXCLUDED.canonical_name_en,
  display_name = EXCLUDED.display_name,
  entity_type = EXCLUDED.entity_type,
  country = EXCLUDED.country,
  country_code = EXCLUDED.country_code,
  origin_region = EXCLUDED.origin_region,
  raw_country_values = EXCLUDED.raw_country_values,
  confidence = EXCLUDED.confidence,
  review_status = EXCLUDED.review_status,
  source = EXCLUDED.source,
  source_note = EXCLUDED.source_note,
  status = EXCLUDED.status,
  updated_at = now();

${
  aliasValues
    ? `
INSERT INTO public.drink_company_aliases (
  company_id,
  alias,
  alias_language,
  alias_type,
  source
)
SELECT
  c.id,
  v.alias,
  v.alias_language,
  v.alias_type,
  v.source
FROM (
  VALUES
${aliasValues}
) AS v(normalized_key, alias, alias_language, alias_type, source)
JOIN public.drink_companies c
  ON c.normalized_key = v.normalized_key
ON CONFLICT (company_id, alias_normalized) DO UPDATE SET
  alias = EXCLUDED.alias,
  alias_language = EXCLUDED.alias_language,
  alias_type = EXCLUDED.alias_type,
  source = EXCLUDED.source;
`
    : '-- No alias rows generated from CSV.\n'
}

COMMIT;

-- Post-run checks (run separately if desired):
-- SELECT count(*) FROM public.drink_companies;
-- SELECT count(*) FROM public.drink_company_aliases;
-- SELECT review_status, count(*) FROM public.drink_companies GROUP BY 1 ORDER BY 1;
-- SELECT normalized_key, display_name, country, review_status FROM public.drink_companies ORDER BY display_name;
-- SELECT a.alias, c.display_name, count(*) OVER (PARTITION BY a.alias_normalized) AS global_hits
-- FROM public.drink_company_aliases a
-- JOIN public.drink_companies c ON c.id = a.company_id
-- ORDER BY global_hits DESC, a.alias;
`
}

async function rest(url, path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: headers.apikey,
      Authorization: headers.authorization,
      'Content-Type': 'application/json',
      ...headers.extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} HTTP ${res.status}: ${text}`)
  }
  return data
}

async function upsertCompany(url, serviceKey, company) {
  const payload = {
    normalized_key: company.normalized_key,
    canonical_name: company.canonical_name,
    canonical_name_en: company.canonical_name_en,
    display_name: company.display_name,
    entity_type: company.entity_type,
    country: company.country,
    country_code: company.country_code,
    origin_region: company.origin_region,
    raw_country_values: company.raw_country_values,
    confidence: company.confidence,
    review_status: company.review_status,
    source: company.source,
    source_note: company.source_note,
    status: company.status,
  }

  const data = await rest(url, 'drink_companies?on_conflict=normalized_key', {
    method: 'POST',
    body: payload,
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      extra: { Prefer: 'resolution=merge-duplicates,return=representation' },
    },
  })

  return Array.isArray(data) ? data[0] : data
}

async function upsertAlias(url, serviceKey, companyId, alias) {
  const payload = {
    company_id: companyId,
    alias: alias.alias,
    alias_language: alias.alias_language,
    alias_type: alias.alias_type,
    source: alias.source,
  }

  await rest(url, 'drink_company_aliases?on_conflict=company_id,alias_normalized', {
    method: 'POST',
    body: payload,
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      extra: { Prefer: 'resolution=merge-duplicates' },
    },
  })
}

async function main() {
  loadEnvFile(resolve(root, '.env.local'))
  loadEnvFile(resolve(root, '.env'))
  loadEnvFile(resolve(root, 'taplist-mobile/.env'))

  const args = parseArgs(process.argv)
  if (!existsSync(args.csv)) {
    console.error(`CSV not found: ${args.csv}`)
    process.exit(1)
  }

  const url =
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const csvText = readFileSync(args.csv, 'utf8').replace(/^\uFEFF/, '')
  const rows = parseCsv(csvText)
  const companies = buildCompanies(rows)

  const report = {
    generated_at: new Date().toISOString(),
    csv: args.csv,
    company_count: companies.length,
    alias_count: companies.reduce((sum, company) => sum + company.aliases.length, 0),
    pending_review: companies.filter((company) => company.review_status === 'pending').length,
    archived: companies.filter((company) => company.status === 'archived').length,
    companies: companies.map(({ _meta, aliases, ...company }) => ({
      ...company,
      alias_count: aliases.length,
      meta: _meta,
    })),
  }

  const reportPath = resolve(root, 'taplist-mobile/tools/product-pool-audit/brewery-brand-seed-report.json')
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  console.log(`Parsed ${rows.length} CSV rows -> ${companies.length} companies`)
  console.log(`Aliases to upsert: ${report.alias_count}`)
  console.log(`Pending review: ${report.pending_review}; archived: ${report.archived}`)
  console.log(`Dry run report: ${reportPath}`)

  if (args.writeSql) {
    const sql = buildSql(companies, args.csv)
    writeFileSync(args.sqlOut, sql)
    console.log(`SQL seed written: ${args.sqlOut}`)
    console.log(`Review the file, then run it in Supabase SQL Editor on production.`)
    return
  }

  if (args.dryRun) {
    console.log('Dry run only; no database writes.')
    return
  }

  if (!url || !serviceKey) {
    console.error('Missing SUPABASE URL or SUPABASE_SERVICE_ROLE_KEY for import.')
    process.exit(1)
  }

  let aliasUpserts = 0
  for (const company of companies) {
    const saved = await upsertCompany(url, serviceKey, company)
    for (const alias of company.aliases) {
      await upsertAlias(url, serviceKey, saved.id, alias)
      aliasUpserts += 1
    }
    console.log(
      `Upserted ${company.display_name} (${company.normalized_key}) + ${company.aliases.length} aliases`
    )
  }

  console.log(`Done. ${companies.length} companies, ${aliasUpserts} alias upserts.`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
