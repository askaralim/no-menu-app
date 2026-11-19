const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const ts = require('typescript')

const source = readFileSync(resolve(__dirname, '../app/admin/platform/intelligence/report-presentation.ts'), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } })
const compiled = { exports: {} }
new Function('module', 'exports', outputText)(compiled, compiled.exports)
const { feedComparison, clickRate, dailyPresentation, displayVenue, visitDays, englishSessionRate } = compiled.exports

test('Feed comparison weights counts across versions and keeps positions separate', () => {
  const rows = [
    { mode: 'for_you', surface: 'home', ranking_version: 'v1', impressions: 10, opened_items: 3, opened_after_impression: 2, installations: 5 },
    { mode: 'for_you', surface: 'home', ranking_version: 'v2', impressions: 90, opened_items: 12, opened_after_impression: 9, installations: 5 },
    { mode: 'for_you', surface: 'feed_page', impressions: 20, opened_items: 1, opened_after_impression: 1 },
    { mode: 'latest', surface: 'home', impressions: 30, opened_items: 6, opened_after_impression: 3 },
  ]
  const before = JSON.stringify(rows)
  const result = feedComparison(rows)
  const home = result.find(row => row.mode === 'for_you' && row.surface === 'home')
  assert.equal(result.length, 3)
  assert.equal(home.impressions, 100)
  assert.equal(home.opened_items, 15)
  assert.equal(home.opened_after_impression, 11)
  assert.equal(home.ctr, '11.0%')
  assert.equal(home.installations, undefined, 'distinct installations must not be added')
  assert.equal(JSON.stringify(rows), before)
})

test('No exposure has no measurable click rate, rather than a false zero', () => {
  assert.equal(clickRate({ impressions: 0, opened_after_impression: 0 }), '—')
  assert.equal(clickRate({ impressions: 0, opened_after_impression: 1 }), '—')
  assert.equal(clickRate({ impressions: 10, opened_after_impression: 0 }), '0.0%')
  assert.deepEqual(feedComparison([]), [])
})

test('Daily trend uses detail opens, labels Beijing partial days, and preserves raw counts', () => {
  const rows = ['2026-11-06', '2026-11-07', '2026-11-13'].map(day => ({ day, events: 1311, beer_opens: 13, bar_opens: 10 }))
  const result = dailyPresentation(rows, '2026-11-05T21:00:00Z', '2026-11-12T21:00:00Z')
  assert.equal(result[0].detail_opens, 23)
  assert.equal(result[0].events, 1311)
  assert.equal(result[0].day_label, '2026-11-06（非完整日）')
  assert.equal(result[1].day_label, '2026-11-07')
  assert.equal(result[2].day_label, '2026-11-13（非完整日）')
  assert.equal(dailyPresentation([rows[0]], '2026-11-05T16:00:00Z', '2026-11-06T16:00:00Z')[0].day_label, '2026-11-06')
})

test('Historical venue IDs are explicitly unknown names, not fabricated venue names', () => {
  assert.equal(displayVenue('12345678-1234-1234-1234-123456789abc'), '历史门店（当前目录无名称）')
  assert.equal(displayVenue('2062'), '2062')
})

test('visit days preserve gaps as unknown and mark only today partial, never add accounts',()=>{
  const rows=[{day:'2026-11-18',visitors:3,accounts:1,sessions:5}]
  const result=visitDays(rows,'2026-11-16T16:00:00Z','2026-11-18T04:00:00Z')
  assert.equal(result.length,2);assert.equal(result[0].visitors,null)
  assert.equal(result[0].day_label,'2026-11-17')
  assert.equal(result[1].day_label,'2026-11-18（截至当前）')
  assert.equal(result[1].accounts,1);assert.equal(rows.length,1)
})

test('English session rate uses distinct session counts and keeps empty coverage unknown',()=>{
  assert.equal(englishSessionRate({sessions:10,english_sessions:3}),'30.0%')
  assert.equal(englishSessionRate({sessions:0,english_sessions:0}),'—')
  assert.equal(englishSessionRate({sessions:4}), '0.0%')
})
