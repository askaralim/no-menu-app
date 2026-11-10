import { randomUUID } from 'node:crypto'
export const config = { windowDays: 14, requiredTapCount: 5, followMultiplier: 1.15, modelVersion: 'rules-v1',
  userKeySecret: 'test-user-key-secret-0000000000000000', cursorSecret: 'test-cursor-secret-00000000000000000',
  corsOrigins: new Set(), requestsPerMinute: 10000 }
export function sourceData(now = Date.now()) {
  const user = randomUUID(), tenant = randomUUID()
  const cities = ['shanghai', 'qingdao', 'beijing'].map(code => ({ city_code: code, source_city: code === 'shanghai' ? 'Shanghai' : code === 'qingdao' ? 'Qingdao' : 'Beijing', display_name: code, timezone: 'Asia/Shanghai' }))
  const active_cycles = Array.from({ length: 25 }, (_, i) => ({ session_id: randomUUID(), city_code: 'qingdao', tenant_id: tenant,
    tenant_slug: 'test-bar', tenant_name: '测试酒吧', tenant_name_en: 'Test Bar', source_drink_id: randomUUID(), product_id: randomUUID(),
    beer_name: `测试酒款 ${i}`, beer_name_en: `Beer ${i}`, brewery: '测试酒厂', brewery_en: 'Test brewery',
    style: i === 24 ? 'unknown style' : i === 23 ? 'sour' : 'IPA', style_en: i === 24 ? null : i === 23 ? 'Sour' : 'IPA', image_url: null,
    current_cycle_started_at: new Date(now - (i + 1) * 3600000).toISOString(), ended_at: null, accuracy: 'exact', canceled: false,
    public_tenant: true, public_category: true, public_drink: true, tap_assigned: true, public_status: 'available' }))
  const user_beers = Array.from({ length: 5 }, (_, i) => ({ id: randomUUID(), user_id: user, product_id: randomUUID(), provisional_drink_id: null, style: i === 4 ? 'sour' : 'IPA' }))
  const wrap = (scope, data) => ({ schema_version: 1, export_id: randomUUID(), scope, source_as_of: new Date(now).toISOString(), complete: true,
    counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])), ...data })
  return { user, tenant, catalog: wrap('catalog', { cities, active_cycles }), consumer: wrap('consumer', { user_beers, venue_experiences: [], follows: [], consumer_profiles: [{ user_id: user, home_city_code: 'shanghai' }] }) }
}
export function event(now, session, name = 'bar_opened', extra = {}) {
  return { event_id: randomUUID(), event_name: name, schema_version: 1, occurred_at: new Date(now).toISOString(),
    session_id: session, session_started_at: new Date(now - 10000).toISOString(), source: 'search', selected_city_code: 'qingdao', tenant_id: randomUUID(), ...extra }
}
export const batch = (installation, events) => ({ batch_id: randomUUID(), installation_id: installation, client: { application: 'taplist', platform: 'web', app_version: 'test-1' }, events })
