#!/usr/bin/env node
/**
 * Seed drink_products from reviewed product CSV.
 *
 * Usage:
 *   node scripts/seed_drink_products.mjs --dry-run
 *   node scripts/seed_drink_products.mjs
 *   node scripts/seed_drink_products.mjs --write-sql
 *   node scripts/seed_drink_products.mjs --write-sql --sql-out supabase/seed_drink_products_from_verified_csv.sql
 *
 * Requires (for direct write):
 *   SUPABASE_SERVICE_ROLE_KEY
 *   EXPO_PUBLIC_SUPABASE_URL | NEXT_PUBLIC_SUPABASE_URL | SUPABASE_URL
 *
 * Prerequisite: drink_companies seeded first (company_id subqueries need rows).
 *
 * Default CSV:
 *   taplist-mobile/tools/product-pool-audit/beer_products_web_verified.csv
 */

import { readFileSync, existsSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const DEFAULT_CSV = resolve(root, 'taplist-mobile/tools/product-pool-audit/beer_products_web_verified.csv')
const DEFAULT_COMPANY_SEED = resolve(root, 'supabase/seed_drink_companies_from_verified_csv.sql')

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
    companySeed: DEFAULT_COMPANY_SEED,
    sqlOut: resolve(root, 'supabase/seed_drink_products_from_verified_csv.sql'),
  }
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--write-sql') args.writeSql = true
    else if (arg === '--csv') {
      args.csv = resolve(argv[i + 1] ?? '')
      i += 1
    } else if (arg === '--company-seed') {
      args.companySeed = resolve(argv[i + 1] ?? '')
      i += 1
    } else if (arg === '--sql-out') {
      args.sqlOut = resolve(argv[i + 1] ?? '')
      i += 1
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: node scripts/seed_drink_products.mjs [--dry-run] [--write-sql] [--csv path] [--sql-out path]'
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

function splitVariants(value) {
  if (!value) return []
  return value
    .split(/[|/]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function parseNumber(value) {
  const v = clean(value)
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function parseIntOrNull(value) {
  const n = parseNumber(value)
  if (n == null) return null
  return Math.round(n)
}

function isSkippableRow(row) {
  return (
    clean(row.brewery_verification_status) === 'data_issue' ||
    clean(row.beer_verification_status) === 'data_issue'
  )
}

function rowRichnessScore(row) {
  let score = 0
  if (clean(row.verified_beer_name_zh)) score += 20
  if (clean(row.verified_beer_name_en)) score += 10
  if (clean(row.verified_beer_style)) score += 8
  if (clean(row.verified_beer_abv)) score += 5
  if (clean(row.verified_beer_ibu)) score += 3
  if (clean(row.image_url)) score += 6
  if (clean(row.description)) score += 4
  if (clean(row.verified_brewery_name_zh)) score += 5
  score += Number.parseInt(row.source_drink_count ?? '0', 10)
  if (clean(row.beer_verification_status) === 'verified_exact') score += 15
  if (clean(row.beer_verification_status) === 'corrected') score += 12
  return score
}

function mapReviewStatus(row) {
  const beerStatus = clean(row.beer_verification_status)
  if (beerStatus === 'verified_exact' || beerStatus === 'corrected') return 'reviewed'
  return 'pending'
}

function buildReviewNote(row) {
  const parts = [
    clean(row.beer_verification_note),
    clean(row.uncertainty_flag),
    clean(row.field_conflicts),
    clean(row.review_note),
  ].filter(Boolean)
  return parts.length ? parts.join(' | ') : null
}

function buildAliases(row, canonicalName) {
  const aliases = new Set()
  for (const source of [row.source_names, row.aliases]) {
    for (const part of splitVariants(source)) {
      if (part && part !== canonicalName) aliases.add(part)
    }
  }
  if (clean(row.name) && clean(row.name) !== canonicalName) {
    aliases.add(clean(row.name))
  }
  return [...aliases]
}

function loadCompanyIndex(companySeedPath) {
  if (!existsSync(companySeedPath)) {
    throw new Error(`Company seed file not found: ${companySeedPath}`)
  }
  const seed = readFileSync(companySeedPath, 'utf8')
  const companies = []
  for (const line of seed.split('\n')) {
    const m = line.match(/^\s*\('([^']+)',\s*'((?:''|[^'])*)',\s*'((?:''|[^'])*)',\s*'((?:''|[^'])*)'/)
    if (m) {
      companies.push({
        key: m[1].replace(/''/g, "'"),
        canonical: m[2].replace(/''/g, "'"),
        display: m[4].replace(/''/g, "'"),
      })
    }
  }

  const aliases = []
  for (const line of seed.split('\n')) {
    const m = line.match(
      /^\s*\('([^']+)',\s*'((?:''|[^'])*)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'\),?/
    )
    if (m && ['zh', 'en', 'mixed', 'unknown'].includes(m[3])) {
      aliases.push({ key: m[1], alias: m[2].replace(/''/g, "'") })
    }
  }

  const keyMap = new Map(companies.map((c) => [normalizeKey(c.key), c]))
  const canonMap = new Map(companies.map((c) => [normalizeKey(c.canonical), c]))
  const displayMap = new Map(companies.map((c) => [normalizeKey(c.display), c]))
  const aliasMap = new Map()
  for (const a of aliases) {
    const n = normalizeKey(a.alias)
    if (!aliasMap.has(n)) aliasMap.set(n, new Set())
    aliasMap.get(n).add(normalizeKey(a.key))
  }

  return { companies, keyMap, canonMap, displayMap, aliasMap }
}

function resolveCompany(row, index) {
  const candidates = [
    clean(row.verified_brewery_name_zh),
    clean(row.brand_name),
    clean(row.brewery),
    ...splitVariants(row.source_brand_names),
    ...splitVariants(row.source_breweries),
  ]

  const seen = new Set()
  for (const raw of candidates) {
    const n = normalizeKey(raw)
    if (!n || seen.has(n)) continue
    seen.add(n)

    if (index.keyMap.has(n)) {
      const c = index.keyMap.get(n)
      return { via: 'normalized_key', companyKey: c.key, company: c, raw }
    }
    if (index.canonMap.has(n)) {
      const c = index.canonMap.get(n)
      return { via: 'canonical_name', companyKey: c.key, company: c, raw }
    }
    if (index.displayMap.has(n)) {
      const c = index.displayMap.get(n)
      return { via: 'display_name', companyKey: c.key, company: c, raw }
    }
    const hits = index.aliasMap.get(n)
    if (hits?.size === 1) {
      const companyKey = [...hits][0]
      const c = index.keyMap.get(companyKey) ?? index.companies.find((x) => normalizeKey(x.key) === companyKey)
      return { via: 'alias', companyKey: c?.key ?? companyKey, company: c, raw }
    }
    if (hits?.size > 1) {
      return { via: 'alias_collision', companyKey: null, company: null, raw }
    }
  }

  return { via: 'unmatched', companyKey: null, company: null, raw: clean(row.brand_name) ?? clean(row.brewery) }
}

function buildProduct(row, companyIndex) {
  const companyMatch = resolveCompany(row, companyIndex)
  const name = clean(row.verified_beer_name_zh) ?? clean(row.name)
  if (!name) return null

  const brandKey = companyMatch.companyKey ?? clean(row.brand_name) ?? clean(row.brewery) ?? 'unknown'
  const normalizedKey = `${normalizeKey(brandKey)}|${normalizeKey(name)}`

  const brandName =
    companyMatch.company?.display ??
    clean(row.verified_brewery_name_zh) ??
    clean(row.brand_name) ??
    null
  const brewery =
    companyMatch.company?.canonical ??
    clean(row.verified_brewery_name_zh) ??
    clean(row.brewery) ??
    null

  return {
    candidate_id: clean(row.candidate_id),
    name,
    name_en: clean(row.verified_beer_name_en) ?? clean(row.name_en),
    aliases: buildAliases(row, name),
    brand_name: brandName,
    brewery,
    beer_style: clean(row.verified_beer_style) ?? clean(row.beer_style),
    abv: parseNumber(clean(row.verified_beer_abv) ?? row.abv),
    ibu: parseIntOrNull(clean(row.verified_beer_ibu) ?? row.ibu),
    country: clean(row.verified_brewery_country) ?? clean(row.country),
    origin_region: clean(row.verified_brewery_city) ?? clean(row.origin_region),
    image_url: clean(row.image_url),
    description: clean(row.description),
    tasting_note: clean(row.tasting_note) ?? clean(row.description),
    status: clean(row.status) === 'archived' ? 'archived' : 'active',
    source: `beer_products_web_verified.csv:${clean(row.candidate_id) ?? clean(row.name) ?? 'unknown'}`,
    company_key: companyMatch.companyKey,
    company_match_via: companyMatch.via,
    normalized_key: normalizedKey,
    review_status: mapReviewStatus(row),
    review_note: buildReviewNote(row),
    beer_verification_status: clean(row.beer_verification_status),
    brewery_verification_status: clean(row.brewery_verification_status),
    source_drink_ids: splitVariants(row.source_drink_ids),
  }
}

function dedupeProducts(rows, companyIndex) {
  const grouped = new Map()
  for (const row of rows) {
    if (isSkippableRow(row)) continue
    const product = buildProduct(row, companyIndex)
    if (!product) continue
    const key = product.normalized_key
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push({ row, product })
  }

  const products = []
  for (const group of grouped.values()) {
    const sorted = [...group].sort((a, b) => rowRichnessScore(b.row) - rowRichnessScore(a.row))
    const primary = sorted[0].product
    const aliasSet = new Set(primary.aliases)
    const sourceIds = new Set([primary.source])
    for (const { row, product } of sorted.slice(1)) {
      for (const alias of product.aliases) aliasSet.add(alias)
      if (product.source) sourceIds.add(product.source)
      if (!primary.image_url && product.image_url) primary.image_url = product.image_url
      if (!primary.description && product.description) primary.description = product.description
      if (!primary.beer_style && product.beer_style) primary.beer_style = product.beer_style
      if (primary.abv == null && product.abv != null) primary.abv = product.abv
      if (primary.ibu == null && product.ibu != null) primary.ibu = product.ibu
      if (primary.review_status === 'pending' && product.review_status === 'reviewed') {
        primary.review_status = product.review_status
      }
      if (rowRichnessScore(row) > 0 && product.review_note) {
        primary.review_note = [primary.review_note, product.review_note].filter(Boolean).join(' | ')
      }
    }
    primary.aliases = [...aliasSet]
    if (sourceIds.size > 1) {
      primary.source = [...sourceIds].sort().join('; ')
    }
    products.push(primary)
  }

  products.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  return products
}

function sqlQuote(value) {
  if (value == null) return 'NULL'
  return `'${String(value).replace(/'/g, "''")}'`
}

function sqlTextArray(values) {
  if (!values?.length) return "ARRAY[]::text[]"
  return `ARRAY[${values.map((value) => sqlQuote(value)).join(', ')}]::text[]`
}

function buildSql(products, csvPath) {
  const keyCounts = new Map()
  for (const p of products) {
    keyCounts.set(p.normalized_key, (keyCounts.get(p.normalized_key) || 0) + 1)
  }
  const dupKeys = [...keyCounts.entries()].filter(([, c]) => c > 1)
  if (dupKeys.length) {
    throw new Error(`Duplicate normalized_key in seed output: ${dupKeys.map(([k]) => k).join(', ')}`)
  }

  const withCompany = products.filter((p) => p.company_key).length
  const pendingReview = products.filter((p) => p.review_status === 'pending').length

  const values = products
    .map((p) => {
      const companyIdExpr = p.company_key
        ? `(SELECT id FROM public.drink_companies WHERE normalized_key = ${sqlQuote(p.company_key)} LIMIT 1)`
        : 'NULL'

      return `  (${[
        sqlQuote(p.name),
        sqlQuote(p.name_en),
        sqlTextArray(p.aliases),
        sqlQuote(p.brand_name),
        sqlQuote(p.brewery),
        sqlQuote(p.beer_style),
        p.abv == null ? 'NULL' : String(p.abv),
        p.ibu == null ? 'NULL' : String(p.ibu),
        sqlQuote(p.country),
        sqlQuote(p.origin_region),
        sqlQuote(p.image_url),
        sqlQuote(p.description),
        sqlQuote(p.tasting_note),
        companyIdExpr,
        sqlQuote(p.normalized_key),
        sqlQuote(p.review_status),
        sqlQuote(p.review_note),
        sqlQuote(p.beer_verification_status),
        sqlQuote(p.brewery_verification_status),
        sqlQuote(p.status),
        sqlQuote(p.source),
      ].join(', ')})`
    })
    .join(',\n')

  return `-- Seed drink_products from reviewed product CSV.
-- Generated by: node scripts/seed_drink_products.mjs --write-sql
-- Source CSV: ${csvPath}
-- Generated at: ${new Date().toISOString()}
--
-- PREREQUISITE: run supabase/seed_drink_companies_from_verified_csv.sql first.
--
-- Expected counts after run:
--   products:        ${products.length}
--   with company_id: ${withCompany}
--   pending review:  ${pendingReview}
--
-- Skipped CSV rows:
--   brewery_verification_status = data_issue
--   beer_verification_status = data_issue
--
-- Duplicate brand+name groups deduped (richest row kept).
-- Does NOT link drinks.product_id (products-only seed).
--
-- Idempotent: safe to re-run on normalized_key conflict.

BEGIN;

INSERT INTO public.drink_products (
  name,
  name_en,
  aliases,
  brand_name,
  brewery,
  beer_style,
  abv,
  ibu,
  country,
  origin_region,
  image_url,
  description,
  tasting_note,
  company_id,
  normalized_key,
  review_status,
  review_note,
  beer_verification_status,
  brewery_verification_status,
  status,
  source
)
VALUES
${values}
ON CONFLICT (normalized_key) DO UPDATE SET
  name = EXCLUDED.name,
  name_en = EXCLUDED.name_en,
  aliases = EXCLUDED.aliases,
  brand_name = EXCLUDED.brand_name,
  brewery = EXCLUDED.brewery,
  beer_style = EXCLUDED.beer_style,
  abv = EXCLUDED.abv,
  ibu = EXCLUDED.ibu,
  country = EXCLUDED.country,
  origin_region = EXCLUDED.origin_region,
  image_url = EXCLUDED.image_url,
  description = EXCLUDED.description,
  tasting_note = EXCLUDED.tasting_note,
  company_id = EXCLUDED.company_id,
  review_status = EXCLUDED.review_status,
  review_note = EXCLUDED.review_note,
  beer_verification_status = EXCLUDED.beer_verification_status,
  brewery_verification_status = EXCLUDED.brewery_verification_status,
  status = EXCLUDED.status,
  source = EXCLUDED.source,
  updated_at = now();

COMMIT;

-- Verify:
-- SELECT count(*), count(company_id) FROM public.drink_products;
-- SELECT review_status, count(*) FROM public.drink_products GROUP BY 1 ORDER BY 1;
`
}

async function writeToSupabase(products) {
  const url =
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing SUPABASE URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  let inserted = 0
  for (const p of products) {
    let companyId = null
    if (p.company_key) {
      const res = await fetch(
        `${url}/rest/v1/drink_companies?normalized_key=eq.${encodeURIComponent(p.company_key)}&select=id&limit=1`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      )
      const rows = await res.json()
      companyId = rows?.[0]?.id ?? null
    }

    const body = {
      name: p.name,
      name_en: p.name_en,
      aliases: p.aliases,
      brand_name: p.brand_name,
      brewery: p.brewery,
      beer_style: p.beer_style,
      abv: p.abv,
      ibu: p.ibu,
      country: p.country,
      origin_region: p.origin_region,
      image_url: p.image_url,
      description: p.description,
      tasting_note: p.tasting_note,
      company_id: companyId,
      normalized_key: p.normalized_key,
      review_status: p.review_status,
      review_note: p.review_note,
      beer_verification_status: p.beer_verification_status,
      brewery_verification_status: p.brewery_verification_status,
      status: p.status,
      source: p.source,
    }

    const res = await fetch(`${url}/rest/v1/drink_products?on_conflict=normalized_key`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Upsert failed for ${p.normalized_key}: ${res.status} ${text}`)
    }
    inserted += 1
  }
  return inserted
}

function printReport(products, rawRows, skipped) {
  const matchStats = {}
  const unmatched = new Map()
  for (const p of products) {
    matchStats[p.company_match_via] = (matchStats[p.company_match_via] || 0) + 1
    if (!p.company_key && p.brand_name) {
      unmatched.set(p.brand_name, (unmatched.get(p.brand_name) || 0) + 1)
    }
  }

  console.log(
    JSON.stringify(
      {
        csv_rows: rawRows.length,
        skipped_data_issue: skipped,
        products_after_dedup: products.length,
        company_match: matchStats,
        with_company_key: products.filter((p) => p.company_key).length,
        without_company_key: products.filter((p) => !p.company_key).length,
        pending_review: products.filter((p) => p.review_status === 'pending').length,
        reviewed: products.filter((p) => p.review_status === 'reviewed').length,
        with_image: products.filter((p) => p.image_url).length,
        top_unmatched_brands: [...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15),
      },
      null,
      2
    )
  )
}

async function main() {
  loadEnvFile(resolve(root, '.env.local'))
  loadEnvFile(resolve(root, '.env'))

  const args = parseArgs(process.argv)
  if (!existsSync(args.csv)) {
    throw new Error(`CSV not found: ${args.csv}`)
  }

  const rawRows = parseCsv(readFileSync(args.csv, 'utf8'))
  const skipped = rawRows.filter(isSkippableRow).length
  const companyIndex = loadCompanyIndex(args.companySeed)
  const products = dedupeProducts(rawRows, companyIndex)

  printReport(products, rawRows, skipped)

  if (args.writeSql) {
    const sql = buildSql(products, args.csv)
    writeFileSync(args.sqlOut, sql, 'utf8')
    console.log(`\nWrote SQL: ${args.sqlOut}`)
    return
  }

  if (args.dryRun) {
    console.log('\nDry run complete. Use --write-sql or run without --dry-run to write.')
    return
  }

  const count = await writeToSupabase(products)
  console.log(`\nUpserted ${count} products via Supabase REST.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
