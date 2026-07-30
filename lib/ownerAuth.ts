/** Mainland China mobile helpers for POS owner login (no SMS). */

export const OWNER_LOGIN_EMAIL_DOMAIN = 'owners.nomenu.app'

/** Normalize user input to E.164 (+86…). Returns null if invalid. */
export function normalizeChinaMobile(input: string): string | null {
  const digits = (input || '').replace(/\D/g, '')
  if (!digits) return null

  let national = digits
  if (national.startsWith('86') && national.length === 13) {
    national = national.slice(2)
  } else if (national.startsWith('086') && national.length === 14) {
    national = national.slice(3)
  } else if (national.startsWith('0') && national.length === 12) {
    national = national.slice(1)
  }

  if (!/^1[3-9]\d{9}$/.test(national)) return null
  return `+86${national}`
}

/** 11-digit China mobile without country code. */
export function toNationalMobile(input: string | null | undefined): string {
  if (!input) return ''
  const e164 = normalizeChinaMobile(input)
  if (e164) return e164.slice(3)
  const d = input.replace(/\D/g, '')
  if (d.startsWith('86') && d.length === 13) return d.slice(2)
  return d
}

/** Digits with country code, no plus (8613…). */
export function toInviteMobileKey(input: string): string | null {
  const e164 = normalizeChinaMobile(input)
  if (!e164) return null
  return e164.replace(/\D/g, '')
}

/**
 * Login identity for password auth without SMS.
 * Example: 13800138000 → 13800138000@owners.nomenu.app
 */
export function mobileToLoginEmail(input: string): string | null {
  const national = toNationalMobile(input)
  if (!/^1[3-9]\d{9}$/.test(national)) return null
  return `${national}@${OWNER_LOGIN_EMAIL_DOMAIN}`
}

/**
 * Temp password for WeChat handoff (owner changes on first login).
 * Letters + digits only — no punctuation (WeChat copy/paste often drops `!`).
 * Example: Nm95953742
 */
export function generateTempOwnerPassword(mobileInput: string): string {
  const national = toNationalMobile(mobileInput) || '0000'
  const tail = national.slice(-4)
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `Nm${tail}${rand}`
}
