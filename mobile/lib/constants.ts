export const CUSTOMER_NAME_MAP: Record<string, string> = {
  '阿尔法': '阿尔法, 凯瑟琳',
  '凯瑟琳': '阿尔法, 凯瑟琳',
  '阿尔法凯瑟琳': '阿尔法, 凯瑟琳',
  'Arafat': '阿尔法, 凯瑟琳',
  'kamil': '卡门',
  '尼加提': 'nijat',
}

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
  statusFinished: { bg: '#e5e7eb', text: '#374151' },
} as const

export const STATUS_LABELS: Record<string, string> = {
  active: '进行中',
  checked_out: '已结账',
  finished: '已完成',
}

// In v1 inventory we track stock in ml.
export const LOW_STOCK_THRESHOLD = 2000
