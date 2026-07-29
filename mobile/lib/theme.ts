// Single source of truth for the No Menu Tonight operator app.
// Editorial dark language shared with the consumer Tap List (see taplistTheme.ts).
import { TAPLIST_THEME } from './taplistTheme'

export const THEME = {
  ...TAPLIST_THEME,
  // On-gold foreground for filled buttons/chips.
  onGold: '#1A1206',
} as const

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const

export const FONT = {
  eyebrow: { fontSize: 12, letterSpacing: 2, fontWeight: '600' as const },
  title: { fontSize: 26, fontWeight: '800' as const },
  section: { fontSize: 13, letterSpacing: 1, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '500' as const },
  meta: { fontSize: 13, fontWeight: '500' as const },
} as const

/** Shared page chrome — keep tab screens visually aligned. */
export const LAYOUT = {
  pagePad: 20,
  heroPadTop: 8,
  heroPadBottom: 10,
  listPadBottom: 120,
} as const

export type ThemeColor = keyof typeof THEME

export interface StatusVisual {
  fg: string
  bg: string
  border: string
}

// Warm editorial palette for POS order lifecycle badges, mirroring the tone
// of the consumer taplist status chips.
export function orderStatusVisual(status: string): StatusVisual {
  switch (status) {
    case 'active':
      return { fg: THEME.gold, bg: THEME.goldFill, border: THEME.goldBorder }
    case 'checked_out':
    case 'finished': // legacy → same as checked_out
      return { fg: THEME.success, bg: 'rgba(123,216,143,0.12)', border: 'rgba(123,216,143,0.32)' }
    default:
      return { fg: THEME.muted, bg: THEME.surfaceMuted, border: THEME.borderFaint }
  }
}
