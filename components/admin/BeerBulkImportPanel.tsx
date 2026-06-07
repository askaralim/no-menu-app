'use client'

import { useMemo, useState } from 'react'

import { supabase } from '@/lib/supabaseClient'
import {
  adminBeerImportRowsToRpcPayload,
  parseAdminBeerImportPaste,
  type AdminBeerImportRow,
} from '@/lib/adminBeerImport'

type ImportResult = {
  inserted: number
  skipped: number
  results: Array<{
    brewery?: string
    name?: string
    status?: string
    message?: string
    drink_id?: string
  }>
}

type Props = {
  tenantId: string
  onImported: () => void
}

const PLACEHOLDER = `所在地,品牌,酒名,品类,酒精度
上海&石家庄,2062&独墨,日暮里/Nippori,红色艾尔,5.0%
西安,Fever,折射,美式IPA,6.1%`

export function BeerBulkImportPanel({ tenantId, onImported }: Props) {
  const [paste, setPaste] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const parsed = useMemo(() => parseAdminBeerImportPaste(paste), [paste])

  const handleImport = async () => {
    if (parsed.rows.length === 0) return
    setImporting(true)
    setImportError(null)
    setImportResult(null)

    try {
      const payload = adminBeerImportRowsToRpcPayload(parsed.rows)
      const { data, error } = await supabase.rpc('admin_upsert_beers', {
        p_tenant_id: tenantId,
        p_rows: payload,
      })

      if (error) throw error

      const result = (data ?? {}) as ImportResult & { ok?: boolean }
      setImportResult({
        inserted: result.inserted ?? 0,
        skipped: result.skipped ?? 0,
        results: result.results ?? [],
      })
      onImported()
    } catch (err) {
      console.error('admin_upsert_beers failed', err)
      setImportError(err instanceof Error ? err.message : '导入失败')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="admin-section">
      <h2>批量导入酒款</h2>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
        粘贴表格（CSV 或 Markdown）。必填列：品牌、酒名、品类；可选：所在地、酒精度、编号。
        导入后可在下方编辑图片、规格与公开状态。
      </p>

      <textarea
        className="admin-input"
        rows={8}
        placeholder={PLACEHOLDER}
        value={paste}
        onChange={(e) => {
          setPaste(e.target.value)
          setImportResult(null)
          setImportError(null)
        }}
        style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}
      />

      {parsed.errors.length > 0 ? (
        <div style={{ marginTop: 12, color: '#b45309', fontSize: 14 }}>
          {parsed.errors.map((error) => (
            <div key={error}>{error}</div>
          ))}
        </div>
      ) : null}

      {parsed.rows.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>预览（{parsed.rows.length} 款）</h3>
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>品牌</th>
                  <th>酒名</th>
                  <th>品类</th>
                  <th>所在地</th>
                  <th>ABV</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.map((row: AdminBeerImportRow, index) => (
                  <tr key={`${row.brewery}-${row.name}-${index}`}>
                    <td>{row.sort_order ?? index + 1}</td>
                    <td>{row.brewery}</td>
                    <td>{row.name}</td>
                    <td>{row.beer_style}</td>
                    <td>{row.country ?? '—'}</td>
                    <td>{row.abv ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            className="admin-button admin-button-primary"
            style={{ marginTop: 12 }}
            disabled={importing || parsed.errors.length > 0}
            onClick={() => void handleImport()}>
            {importing ? '导入中…' : '导入酒款'}
          </button>
        </div>
      ) : null}

      {importError ? (
        <p style={{ marginTop: 12, color: '#b91c1c', fontSize: 14 }}>{importError}</p>
      ) : null}

      {importResult ? (
        <div style={{ marginTop: 12, fontSize: 14, color: '#374151' }}>
          <p>
            完成：新增 <strong>{importResult.inserted}</strong> 款，跳过{' '}
            <strong>{importResult.skipped}</strong> 款（已存在）。
          </p>
          {importResult.results.length > 0 ? (
            <ul style={{ marginTop: 8, paddingLeft: 18 }}>
              {importResult.results.map((item, index) => (
                <li key={`${item.name}-${index}`}>
                  {item.brewery} · {item.name} — {item.status}
                  {item.message ? ` (${item.message})` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
