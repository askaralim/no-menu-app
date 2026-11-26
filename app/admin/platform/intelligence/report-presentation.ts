// Presentation-only aggregation: never add distinct devices/accounts across rows.
export type ReportRow = Record<string, any>
export const channelLabel = (value: string) => ({ consumer_web: '消费者网页', miniprogram: '小程序', taplist: 'Taplist', ios: 'iOS（历史标识）', unknown: '未知渠道' }[value] || value || '未知渠道')
export const modeLabel = (value: string) => ({ for_you: '适合你的', latest: '全部上新' }[value] || value || '未知模式')
export const surfaceLabel = (value: string) => ({ home: '首页', feed_page: '完整列表' }[value] || value || '未知位置')
export const identityLabel = (value: string) => ({ resolved: '已关联账号', unresolved: '未关联账号（含匿名）', ambiguous: '归属有歧义' }[value] || value)
export const sourceLabel = (value: string) => ({ home: '首页', feed_page: '上新完整列表', bar_taplist: '门店酒单', search_discovery: '搜索 / 探索', direct: '直接进入', qr: '二维码', unknown: '未记录入口' }[value] || value || '未记录入口')
export const displayVenue = (value: string) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value) ? '历史门店（当前目录无名称）' : value
export function entryPresentation(row: ReportRow) {
  const known = (value: string) => value && value !== 'unknown'
  return { ...row,
    venue: row.tenant_slug || (row.tenant_id ? `${row.tenant_id}（slug 暂不可用）` : '未记录门店'),
    placement_label: known(row.placement) ? (({ venue: '门店通用码', table: '桌面', counter: '吧台', poster: '海报' } as Record<string, string>)[row.placement] || row.placement) : row.source === 'qr' ? '未记录' : '未记录（无物料上下文）',
    browser_label: row.channel !== 'consumer_web' ? '不适用' : known(row.browser) ? (({ wechat: '微信内', safari: 'Safari', chrome: 'Chrome', other: '其他浏览器' } as Record<string, string>)[row.browser] || row.browser) : '未记录',
  }
}
export const sumField = (rows: ReportRow[], key: string) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0)
export const clickRate = (row: ReportRow) => row.impressions > 0 ? `${(100 * row.opened_after_impression / row.impressions).toFixed(1)}%` : '—'
export const englishSessionRate = (row: ReportRow) => row.sessions > 0 ? `${(100 * Number(row.english_sessions || 0) / row.sessions).toFixed(1)}%` : '—'

export function feedComparison(rows: ReportRow[]) {
  const grouped = new Map<string, ReportRow>()
  for (const row of rows) {
    // Each immutable instance has one mode/surface/version. These counts are additive;
    // recompute the ratio from counts, never average row percentages.
    const key = JSON.stringify([row.mode, row.surface])
    const current = grouped.get(key) ?? { mode: row.mode, surface: row.surface, impressions: 0, opened_items: 0, opened_after_impression: 0 }
    for (const field of ['impressions', 'opened_items', 'opened_after_impression']) current[field] += Number(row[field] ?? 0)
    grouped.set(key, current)
  }
  return Array.from(grouped.values()).sort((a,b) => String(a.surface).localeCompare(String(b.surface)) || String(a.mode).localeCompare(String(b.mode))).map(row => ({
    ...row, mode_name: modeLabel(row.mode), surface_name: surfaceLabel(row.surface), ctr: clickRate(row),
  }))
}

export function dailyPresentation(rows: ReportRow[], from: string, until: string) {
  return rows.map(row => {
    const start = Date.parse(`${row.day}T00:00:00+08:00`)
    const partial = start < Date.parse(from) || start + 86400000 > Date.parse(until)
    return { ...row, day: row.day, day_label: `${row.day}${partial ? '（非完整日）' : ''}`, detail_opens: Number(row.beer_opens) + Number(row.bar_opens) }
  })
}

// Missing days mean no received visits, not verified zero activity.
export function visitDays(rows: ReportRow[], from: string, until: string) {
  const byDay = new Map(rows.map(row => [row.day, row]))
  const result: ReportRow[] = []
  for (let at=Date.parse(from); at<Date.parse(until); at+=86400000) {
    const day=new Date(at+28800000).toISOString().slice(0,10)
    result.push({ day, visitors:null, accounts:null, sessions:null, ...byDay.get(day),
      day_label:day+(at+86400000>Date.parse(until)?'（截至当前）':'') })
  }
  return result
}
