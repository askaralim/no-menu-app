// Editorial dark palette mirrored from the taplist-mobile consumer app
// (taplist-mobile/constants/Colors.ts + screen styles). Kept separate from the
// POS `COLORS` in constants.ts so the 酒单 tab reads as the public Tap List.
import type { PublicStatus } from './types'

export const TAPLIST_THEME = {
  background: '#080808',
  surface: 'rgba(17,17,17,0.72)',
  surfaceSolid: '#111111',
  surfaceMuted: 'rgba(21,21,21,0.55)',
  card: 'rgba(17,17,17,0.92)',
  text: '#F5F1E6',
  textSoft: 'rgba(245,241,232,0.86)',
  muted: 'rgba(245,238,225,0.52)',
  faint: 'rgba(245,238,225,0.32)',
  gold: '#D39A45',
  goldSoft: '#C6A875',
  border: 'rgba(245,241,230,0.14)',
  borderFaint: 'rgba(245,241,232,0.08)',
  goldBorder: 'rgba(211,154,69,0.46)',
  goldFill: 'rgba(184,138,61,0.14)',
  danger: '#ff6b5e',
  success: '#7bd88f',
} as const

export const PUBLIC_STATUS_LABELS: Record<PublicStatus, string> = {
  new: '上新',
  available: '在售',
  low: '少量',
  sold_out: '售罄',
  coming_soon: '即将上枪',
}

// Primary chips owners/staff toggle during service on the tonight list.
export const PRIMARY_STATUSES: PublicStatus[] = ['new', 'available', 'sold_out']

// Status chips in create/edit / join sheets (售罄 is list-only).
export const EDITOR_STATUSES: PublicStatus[] = ['new', 'available', 'coming_soon']

export interface StatusVisual {
  label: string
  fg: string
  bg: string
  border: string
}

export function statusVisual(status: PublicStatus): StatusVisual {
  switch (status) {
    case 'new':
      return {
        label: PUBLIC_STATUS_LABELS.new,
        fg: '#F3E4C4',
        bg: 'rgba(184,138,61,0.18)',
        border: 'rgba(211,154,69,0.52)',
      }
    case 'sold_out':
      return {
        label: PUBLIC_STATUS_LABELS.sold_out,
        fg: 'rgba(245,238,225,0.62)',
        bg: 'rgba(117,111,101,0.14)',
        border: 'rgba(117,111,101,0.32)',
      }
    case 'low':
      return {
        label: PUBLIC_STATUS_LABELS.low,
        fg: '#F3E4C4',
        bg: 'rgba(159,122,61,0.14)',
        border: 'rgba(159,122,61,0.30)',
      }
    case 'coming_soon':
      return {
        label: PUBLIC_STATUS_LABELS.coming_soon,
        fg: 'rgba(245,241,232,0.72)',
        bg: 'rgba(21,21,21,0.55)',
        border: 'rgba(245,241,230,0.14)',
      }
    case 'available':
    default:
      return {
        label: PUBLIC_STATUS_LABELS.available,
        fg: 'rgba(245,241,232,0.86)',
        bg: 'rgba(21,21,21,0.42)',
        border: 'rgba(245,241,230,0.14)',
      }
  }
}

export const SERVING_TYPE_LABELS: Record<string, string> = {
  draft: '生啤',
  can: '罐装',
  bottle: '瓶装',
  flight: '品鉴',
  other: '其他',
}
