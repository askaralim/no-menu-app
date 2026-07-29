export const COLORS = {
  background: '#060913',
  card: '#1E2336',
  gold: '#D4AF37',
  text: '#FFFFFF',
  muted: '#888888',
  danger: '#ff3b30',
  border: '#2A3148',
  statusActive: { bg: '#dbeafe', text: '#1e40af' },
  statusCheckedOut: { bg: '#fef3c7', text: '#92400e' },
  statusFinished: { bg: '#fef3c7', text: '#92400e' }, // legacy alias → same as checked_out
} as const

/** Operator-facing labels. Legacy `finished` displays as 已结账. */
export const STATUS_LABELS: Record<string, string> = {
  active: '进行中',
  checked_out: '已结账',
  finished: '已结账',
}

/** Settled terminal states (paid). `finished` is legacy, treated as checked_out. */
export function isOrderSettled(status: string | null | undefined): boolean {
  return status === 'checked_out' || status === 'finished'
}

export function orderStatusLabel(status: string | null | undefined): string {
  if (!status) return '—'
  return STATUS_LABELS[status] || status
}

// In v1 inventory we track stock in ml.
export const LOW_STOCK_THRESHOLD = 2000
