// Executable contract oracle, NOT production persistence/authentication code.
export const MINUTE = 60_000
export const DAY = 24 * 60 * MINUTE
export const ms = value => Date.parse(value)
export const iso = value => new Date(value).toISOString()
export function fail(code, status = 400) {
  throw Object.assign(new Error(code), { code, status })
}
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}'
  }
  return JSON.stringify(value)
}
export function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
export function assertEventTime(event, now) {
  const time = ms(event.occurred_at)
  const start = ms(event.session_started_at)
  if (![time, start].every(Number.isFinite) || time < start || time < now - 7 * DAY || time > now + 5 * MINUTE) {
    fail('INVALID_EVENT_TIME')
  }
}
