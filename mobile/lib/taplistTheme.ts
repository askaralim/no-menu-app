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
  muted: 'rgba(245,238,225,0.64)',
  faint: 'rgba(245,238,225,0.48)',
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
  coming_soon: '即将上新',
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
        fg: '#B7955A',
        bg: 'rgba(183,149,90,0.14)',
        border: 'rgba(183,149,90,0.40)',
      }
    case 'sold_out':
      return {
        label: PUBLIC_STATUS_LABELS.sold_out,
        fg: '#77736F',
        bg: 'rgba(119,115,111,0.10)',
        border: 'rgba(119,115,111,0.28)',
      }
    case 'low':
      return {
        label: PUBLIC_STATUS_LABELS.low,
        fg: '#A87B55',
        bg: 'rgba(168,123,85,0.13)',
        border: 'rgba(168,123,85,0.36)',
      }
    case 'coming_soon':
      return {
        label: PUBLIC_STATUS_LABELS.coming_soon,
        fg: '#7E8FA3',
        bg: 'rgba(126,143,163,0.12)',
        border: 'rgba(126,143,163,0.35)',
      }
    case 'available':
    default:
      return {
        label: PUBLIC_STATUS_LABELS.available,
        fg: '#7F9B86',
        bg: 'rgba(127,155,134,0.12)',
        border: 'rgba(127,155,134,0.35)',
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
