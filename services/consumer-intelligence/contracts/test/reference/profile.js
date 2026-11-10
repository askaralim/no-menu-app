import { fail } from './core.js'
import { validate } from '../validation.js'

export function patchProfile(current, patch, { cities, taken = new Set(), contentType = 'application/merge-patch+json' }) {
  if (contentType !== 'application/merge-patch+json') fail('UNSUPPORTED_MEDIA_TYPE', 415)
  if (!validate('consumer/profile-patch.schema.json', patch).ok) fail('INVALID_PROFILE_PATCH')
  if (patch.home_city_code != null && !cities.has(patch.home_city_code)) fail('UNKNOWN_CITY')
  if (patch.consumer_username !== undefined) {
    const normalized = patch.consumer_username.toLowerCase()
    if (['admin', 'administrator', 'official', 'support', 'system', 'nomenu', '官方', '客服', '管理员', '系统'].includes(normalized)) fail('USERNAME_RESERVED')
    if (taken.has(normalized) && normalized !== current.consumer_username.toLowerCase()) fail('USERNAME_TAKEN', 409)
  }
  // No mutation before all fields pass. Empty patch must not trigger persistence.
  if (Object.keys(patch).length === 0) return { profile: structuredClone(current), wrote: false }
  const result = { ...current, ...patch }
  if (patch.consumer_username !== undefined) result.is_default = false
  return { profile: result, wrote: true }
}
