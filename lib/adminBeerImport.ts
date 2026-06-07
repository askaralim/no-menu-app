export type AdminBeerImportRow = {
  brewery: string
  name: string
  beer_style: string
  country?: string | null
  abv?: number | null
  sort_order?: number | null
  public_status?: string | null
}

export type AdminBeerImportParseResult = {
  rows: AdminBeerImportRow[]
  errors: string[]
}

type ColumnKey = 'sort_order' | 'country' | 'brewery' | 'name' | 'beer_style' | 'abv'

const HEADER_ALIASES: Record<ColumnKey, string[]> = {
  sort_order: ['#', 'no', 'num', 'number', '序号', '编号'],
  country: ['place', 'country', '所在地', '产地'],
  brewery: ['brewery', 'brand', 'brewery / brand', 'brewery/brand', '品牌', '酒厂'],
  name: ['name', 'beer name', 'beer', '酒名', '酒款'],
  beer_style: ['type', 'style', 'beer_style', '品类', '风格', '类型'],
  abv: ['abv', '酒精度', '酒精'],
}

function normalizeHeader(cell: string): string {
  return cell
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function detectColumnMap(headers: string[]): Partial<Record<ColumnKey, number>> {
  const map: Partial<Record<ColumnKey, number>> = {}

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header)
    for (const key of Object.keys(HEADER_ALIASES) as ColumnKey[]) {
      if (HEADER_ALIASES[key].some((alias) => normalized === alias.toLowerCase())) {
        map[key] = index
      }
    }
  })

  return map
}

function splitTableLine(line: string): string[] {
  const trimmed = line.trim()
  if (!trimmed) return []

  if (trimmed.includes('|')) {
    const parts = trimmed.split('|').map((part) => part.trim())
    if (parts[0] === '') parts.shift()
    if (parts[parts.length - 1] === '') parts.pop()
    return parts
  }

  if (trimmed.includes('\t')) {
    return trimmed.split('\t').map((part) => part.trim())
  }

  return trimmed.split(',').map((part) => part.trim())
}

function isSeparatorLine(line: string): boolean {
  const cells = splitTableLine(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell))
}

function parseAbv(raw: string | undefined): number | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed || trimmed === '-' || trimmed === '—' || trimmed === '–') return null
  const numeric = trimmed.replace(/[^0-9.]+/g, '')
  if (!numeric) return null
  const value = Number(numeric)
  return Number.isFinite(value) ? value : null
}

function parseCountry(raw: string | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed || trimmed === '-' || trimmed === '—' || trimmed === '–') return null
  return trimmed
}

function parseSortOrder(raw: string | undefined): number | null {
  if (!raw) return null
  const trimmed = raw.trim().replace(/[^\d]/g, '')
  if (!trimmed) return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

function requiredColumnsPresent(map: Partial<Record<ColumnKey, number>>): string[] {
  const missing: string[] = []
  if (map.brewery === undefined) missing.push('品牌/brewery')
  if (map.name === undefined) missing.push('酒名/name')
  if (map.beer_style === undefined) missing.push('品类/type')
  return missing
}

export function parseAdminBeerImportPaste(raw: string): AdminBeerImportParseResult {
  const errors: string[] = []
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return { rows: [], errors: ['粘贴内容为空'] }
  }

  let headerIndex = -1
  let columnMap: Partial<Record<ColumnKey, number>> = {}

  for (let i = 0; i < lines.length; i += 1) {
    const cells = splitTableLine(lines[i])
    if (cells.length < 3) continue
    const candidateMap = detectColumnMap(cells)
    if (requiredColumnsPresent(candidateMap).length === 0) {
      headerIndex = i
      columnMap = candidateMap
      break
    }
  }

  if (headerIndex < 0) {
    return {
      rows: [],
      errors: ['未识别表头，请包含 品牌/brewery、酒名/name、品类/type 列'],
    }
  }

  const rows: AdminBeerImportRow[] = []
  const getCell = (cells: string[], key: ColumnKey): string | undefined => {
    const index = columnMap[key]
    return index === undefined ? undefined : cells[index]
  }

  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (isSeparatorLine(line)) continue

    const cells = splitTableLine(line)
    if (cells.length === 0) continue

    const brewery = getCell(cells, 'brewery')?.trim() ?? ''
    const name = getCell(cells, 'name')?.trim() ?? ''
    const beerStyle = getCell(cells, 'beer_style')?.trim() ?? ''

    if (!brewery && !name && !beerStyle) continue

    const rowNumber = i - headerIndex
    if (!brewery || !name || !beerStyle) {
      errors.push(`第 ${rowNumber} 行缺少必填字段（品牌、酒名、品类）`)
      continue
    }

    rows.push({
      brewery,
      name,
      beer_style: beerStyle,
      country: parseCountry(getCell(cells, 'country')),
      abv: parseAbv(getCell(cells, 'abv')),
      sort_order: parseSortOrder(getCell(cells, 'sort_order')),
    })
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push('未解析到有效酒款行')
  }

  return { rows, errors }
}

export function adminBeerImportRowsToRpcPayload(rows: AdminBeerImportRow[]): Record<string, unknown>[] {
  return rows.map((row) => ({
    brewery: row.brewery,
    name: row.name,
    beer_style: row.beer_style,
    country: row.country ?? null,
    abv: row.abv ?? null,
    sort_order: row.sort_order ?? null,
    public_status: row.public_status ?? 'available',
  }))
}
