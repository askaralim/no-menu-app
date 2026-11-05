'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { supabase } from '@/lib/supabaseClient'
import {
  uploadCampaignImage,
  type CampaignAssetRole,
} from '@/lib/taplistStorage'

type TenantOption = { id: string; name: string; slug: string | null }
type DrinkOption = {
  id: string
  tenant_id: string
  name: string
  display_name: string | null
  public_status: string
  enabled: boolean
  is_public_visible: boolean
}
type CampaignStop = {
  id?: string
  campaign_id?: string
  tenant_id: string
  drink_id: string
  brewery_label: string
  sort_order: number
}
type CampaignRow = {
  id: string
  slug: string
  qr_code: string
  city: string
  title: string
  subtitle: string | null
  description: string | null
  badge_label: string
  card_image_url: string | null
  detail_image_urls: string[] | null
  purchase_qr_url: string | null
  purchase_short_link: string | null
  mini_program_code_url: string | null
  start_at: string
  end_at: string
  status: 'scheduled' | 'cancelled'
  is_public_visible: boolean
  sort_order: number
}
type CampaignForm = {
  id: string
  slug: string
  qr_code: string
  city: string
  title: string
  subtitle: string
  description: string
  badge_label: string
  card_image_url: string
  detail_image_1: string
  detail_image_2: string
  purchase_qr_url: string
  purchase_short_link: string
  mini_program_code_url: string
  start_at: string
  end_at: string
  status: 'scheduled' | 'cancelled'
  is_public_visible: boolean
  sort_order: number
  stops: CampaignStop[]
}

const emptyStops = () => Array.from({ length: 6 }, (_, index) => ({
  tenant_id: '',
  drink_id: '',
  brewery_label: '',
  sort_order: index + 1,
}))

function shortCode() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
}

function blankForm(): CampaignForm {
  return {
    id: crypto.randomUUID(),
    slug: 'shanghai-6x6-2026',
    qr_code: shortCode(),
    city: 'Shanghai',
    title: '上海六乘六精酿巡游',
    subtitle: '6家酒吧 × 6家酒厂 × 6款联名酒',
    description: '',
    badge_label: '6×6限定',
    card_image_url: '',
    detail_image_1: '',
    detail_image_2: '',
    purchase_qr_url: '',
    purchase_short_link: '#小程序://快团团/pqcSzp0XmnRV6Tj',
    mini_program_code_url: '',
    start_at: '2026-11-13T00:00',
    end_at: '2026-11-26T23:59',
    status: 'scheduled',
    is_public_visible: false,
    sort_order: 0,
    stops: emptyStops(),
  }
}

function toLocal(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function toIso(value: string) {
  return new Date(value).toISOString()
}

function rowToForm(row: CampaignRow, stops: CampaignStop[]): CampaignForm {
  const ordered = [...stops].sort((a, b) => a.sort_order - b.sort_order)
  return {
    id: row.id,
    slug: row.slug,
    qr_code: row.qr_code,
    city: row.city,
    title: row.title,
    subtitle: row.subtitle || '',
    description: row.description || '',
    badge_label: row.badge_label || '6×6限定',
    card_image_url: row.card_image_url || '',
    detail_image_1: row.detail_image_urls?.[0] || '',
    detail_image_2: row.detail_image_urls?.[1] || '',
    purchase_qr_url: row.purchase_qr_url || '',
    purchase_short_link: row.purchase_short_link || '',
    mini_program_code_url: row.mini_program_code_url || '',
    start_at: toLocal(row.start_at),
    end_at: toLocal(row.end_at),
    status: row.status,
    is_public_visible: row.is_public_visible,
    sort_order: row.sort_order || 0,
    stops: Array.from({ length: 6 }, (_, index) => ordered[index] || {
      tenant_id: '',
      drink_id: '',
      brewery_label: '',
      sort_order: index + 1,
    }).map((stop, index) => ({ ...stop, sort_order: index + 1 })),
  }
}

export default function CampaignsAdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [drinksByTenant, setDrinksByTenant] = useState<Record<string, DrinkOption[]>>({})
  const [campaigns, setCampaigns] = useState<Array<CampaignRow & { stops: CampaignStop[] }>>([])
  const [form, setForm] = useState<CampaignForm>(() => blankForm())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<CampaignAssetRole | null>(null)

  const loadCampaigns = useCallback(async () => {
    const [{ data: rows, error }, { data: stops, error: stopError }] = await Promise.all([
      supabase.from('campaign_events').select('*').order('start_at', { ascending: false }),
      supabase.from('campaign_stops').select('*').order('sort_order'),
    ])
    if (error) throw error
    if (stopError) throw stopError
    setCampaigns(((rows || []) as CampaignRow[]).map((row) => ({
      ...row,
      stops: ((stops || []) as CampaignStop[]).filter((stop) => stop.campaign_id === row.id),
    })))
  }, [])

  const loadDrinks = useCallback(async (tenantId: string) => {
    if (!tenantId || drinksByTenant[tenantId]) return
    const { data, error } = await supabase
      .from('drinks')
      .select('id,tenant_id,name,display_name,public_status,enabled,is_public_visible')
      .eq('tenant_id', tenantId)
      .order('public_sort_order', { ascending: true, nullsFirst: false })
      .order('name')
    if (error) throw error
    setDrinksByTenant((current) => ({ ...current, [tenantId]: (data || []) as DrinkOption[] }))
  }, [drinksByTenant])

  useEffect(() => {
    void (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return setAuthorized(false)
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
        if (!(roles || []).some((row) => row.role === 'super_admin')) {
          return setAuthorized(false)
        }
        setAuthorized(true)
        const { data: tenantRows, error } = await supabase.rpc('admin_list_tenants')
        if (error) throw error
        setTenants(((tenantRows || []) as TenantOption[]).filter((row) => row.slug !== '__platform__'))
        await loadCampaigns()
      } catch (error) {
        console.error(error)
        alert('联合活动管理加载失败，请确认数据库迁移已部署。')
      } finally {
        setLoading(false)
      }
    })()
  }, [loadCampaigns])

  const selectedTenantIds = useMemo(
    () => form.stops.map((stop) => stop.tenant_id).filter(Boolean),
    [form.stops],
  )

  const updateStop = (index: number, patch: Partial<CampaignStop>) => {
    setForm((current) => ({
      ...current,
      stops: current.stops.map((stop, stopIndex) => (
        stopIndex === index ? { ...stop, ...patch, sort_order: index + 1 } : stop
      )),
    }))
  }

  const selectTenant = (index: number, tenantId: string) => {
    updateStop(index, { tenant_id: tenantId, drink_id: '' })
    void loadDrinks(tenantId).catch((error) => {
      console.error(error)
      alert('加载该门店酒款失败')
    })
  }

  const editCampaign = (campaign: CampaignRow & { stops: CampaignStop[] }) => {
    const next = rowToForm(campaign, campaign.stops)
    setForm(next)
    next.stops.forEach((stop) => {
      if (stop.tenant_id) void loadDrinks(stop.tenant_id)
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleUpload = async (assetRole: CampaignAssetRole, file: File) => {
    setUploading(assetRole)
    try {
      const url = await uploadCampaignImage(supabase, form.id, assetRole, file)
      setForm((current) => {
        if (assetRole === 'card') return { ...current, card_image_url: url }
        if (assetRole === 'detail-1') return { ...current, detail_image_1: url }
        if (assetRole === 'detail-2') return { ...current, detail_image_2: url }
        if (assetRole === 'purchase-qr') return { ...current, purchase_qr_url: url }
        return { ...current, mini_program_code_url: url }
      })
    } catch (error) {
      alert(error instanceof Error ? error.message : '素材上传失败')
    } finally {
      setUploading(null)
    }
  }

  const validate = () => {
    if (form.purchase_short_link.trim() && !/^#小程序:\/\/[^/\s]+\/\S+$/.test(form.purchase_short_link.trim())) {
      alert('请粘贴微信复制的小程序链接，以 #小程序:// 开头；也可以留空只使用二维码')
      return false
    }
    if (!form.title.trim() || !form.slug.trim() || !form.qr_code.trim()) {
      alert('请填写标题、slug 和8位活动码')
      return false
    }
    if (!form.start_at || !form.end_at || new Date(form.end_at) <= new Date(form.start_at)) {
      alert('请填写有效的开始和结束时间')
      return false
    }
    if (form.is_public_visible) {
      if (form.stops.some((stop) => !stop.tenant_id || !stop.drink_id || !stop.brewery_label.trim())) {
        alert('公开前必须完整配置六家门店、联名酒和合作酒厂')
        return false
      }
      if (new Set(form.stops.map((stop) => stop.tenant_id)).size !== 6
        || new Set(form.stops.map((stop) => stop.drink_id)).size !== 6) {
        alert('六家门店和六款联名酒均不得重复')
        return false
      }
      if (!form.card_image_url
        || !form.purchase_qr_url || !form.mini_program_code_url) {
        alert('公开前需要活动主图、快团团二维码和活动小程序码；详情图可不填')
        return false
      }
    }
    return true
  }

  const saveCampaign = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!validate()) return
    setSaving(true)
    try {
      const publishAfterSave = form.is_public_visible
      const detailImages = [form.detail_image_1, form.detail_image_2]
        .map((value) => value.trim())
        .filter(Boolean)
      const payload = {
        id: form.id,
        slug: form.slug.trim().toLowerCase(),
        qr_code: form.qr_code.trim(),
        city: form.city.trim() || 'Shanghai',
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        description: form.description.trim() || null,
        badge_label: form.badge_label.trim() || '6×6限定',
        card_image_url: form.card_image_url.trim() || null,
        detail_image_urls: detailImages,
        purchase_qr_url: form.purchase_qr_url.trim() || null,
        purchase_short_link: form.purchase_short_link.trim() || null,
        mini_program_code_url: form.mini_program_code_url.trim() || null,
        start_at: toIso(form.start_at),
        end_at: toIso(form.end_at),
        status: form.status,
        is_public_visible: false,
        sort_order: form.sort_order,
      }
      const { error } = await supabase.from('campaign_events').upsert(payload, { onConflict: 'id' })
      if (error) throw error

      const { error: deleteError } = await supabase
        .from('campaign_stops')
        .delete()
        .eq('campaign_id', form.id)
      if (deleteError) throw deleteError

      const stops = form.stops
        .filter((stop) => stop.tenant_id && stop.drink_id && stop.brewery_label.trim())
        .map((stop, index) => ({
          campaign_id: form.id,
          tenant_id: stop.tenant_id,
          drink_id: stop.drink_id,
          brewery_label: stop.brewery_label.trim(),
          sort_order: index + 1,
        }))
      if (stops.length) {
        const { error: stopError } = await supabase.from('campaign_stops').insert(stops)
        if (stopError) throw stopError
      }

      if (publishAfterSave) {
        const { data: readiness, error: readinessError } = await supabase
          .rpc('validate_campaign_for_publication', { p_campaign_id: form.id })
        if (readinessError) throw readinessError
        if (!readiness?.ok) throw new Error(`公开校验失败：${readiness?.code || 'UNKNOWN'}`)
        const { error: publishError } = await supabase
          .from('campaign_events')
          .update({ is_public_visible: true })
          .eq('id', form.id)
        if (publishError) throw publishError
      }

      alert(publishAfterSave ? '联合活动已保存并公开' : '联合活动草稿已保存')
      await loadCampaigns()
      setForm(blankForm())
    } catch (error) {
      console.error(error)
      alert(error instanceof Error ? error.message : '保存失败；活动已保持隐藏状态')
    } finally {
      setSaving(false)
    }
  }

  const hideCampaign = async (campaign: CampaignRow) => {
    if (!confirm(`隐藏联合活动「${campaign.title}」？`)) return
    const { error } = await supabase
      .from('campaign_events')
      .update({ is_public_visible: false })
      .eq('id', campaign.id)
    if (error) return alert(error.message)
    await loadCampaigns()
  }

  if (loading || authorized === null) {
    return <div className="admin-container"><p>加载中…</p></div>
  }
  if (!authorized) {
    return <div className="admin-container"><h1>联合活动</h1><p>仅超级管理员可管理。</p></div>
  }

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>联合活动</h1>
        <p style={{ color: '#6b7280', marginTop: 8 }}>
          独立于单店活动；保存失败时保持隐藏，不影响普通活动、酒单或POS。
        </p>
      </div>

      <div className="admin-section" style={{ marginBottom: 24 }}>
        <h2>{campaigns.some((item) => item.id === form.id) ? '编辑联合活动' : '新建联合活动'}</h2>
        <form className="admin-form" onSubmit={saveCampaign}>
          <div className="taplist-panel-grid">
            <Field label="标题" value={form.title} onChange={(title) => setForm({ ...form, title })} span />
            <Field label="副标题" value={form.subtitle} onChange={(subtitle) => setForm({ ...form, subtitle })} span />
            <Field label="slug" value={form.slug} onChange={(slug) => setForm({ ...form, slug })} />
            <Field label="8位活动码" value={form.qr_code} onChange={(qr_code) => setForm({ ...form, qr_code })} />
            <Field label="开始时间" value={form.start_at} onChange={(start_at) => setForm({ ...form, start_at })} type="datetime-local" />
            <Field label="结束时间" value={form.end_at} onChange={(end_at) => setForm({ ...form, end_at })} type="datetime-local" />
            <Field label="活动标签" value={form.badge_label} onChange={(badge_label) => setForm({ ...form, badge_label })} />
            <Field label="排序" value={String(form.sort_order)} onChange={(value) => setForm({ ...form, sort_order: Number(value) || 0 })} type="number" />
            <div className="taplist-field taplist-field-span-2">
              <label>活动介绍</label>
              <textarea className="admin-input" rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </div>
          </div>

          <h3 style={{ marginTop: 20 }}>活动素材</h3>
          <Field label="快团团小程序链接（可选，点击购买时直接打开）" value={form.purchase_short_link} onChange={(purchase_short_link) => setForm({ ...form, purchase_short_link })} />
          <div className="taplist-panel-grid">
            <AssetField label="活动主图（支持长图，仅此一张即可）" role="card" value={form.card_image_url} busy={uploading} onUpload={handleUpload} onChange={(card_image_url) => setForm({ ...form, card_image_url })} />
            <AssetField label="详情图1（可选）" role="detail-1" value={form.detail_image_1} busy={uploading} onUpload={handleUpload} onChange={(detail_image_1) => setForm({ ...form, detail_image_1 })} />
            <AssetField label="详情图2（可选）" role="detail-2" value={form.detail_image_2} busy={uploading} onUpload={handleUpload} onChange={(detail_image_2) => setForm({ ...form, detail_image_2 })} />
            <AssetField label="快团团二维码" role="purchase-qr" value={form.purchase_qr_url} busy={uploading} onUpload={handleUpload} onChange={(purchase_qr_url) => setForm({ ...form, purchase_qr_url })} />
            <AssetField label="活动小程序码" role="mini-code" value={form.mini_program_code_url} busy={uploading} onUpload={handleUpload} onChange={(mini_program_code_url) => setForm({ ...form, mini_program_code_url })} />
          </div>

          <h3 style={{ marginTop: 20 }}>六家门店与联名酒</h3>
          <p style={{ color: '#6b7280', marginBottom: 12 }}>发布前必须恰好六站；同一门店和酒款均不能重复。</p>
          <div style={{ display: 'grid', gap: 12 }}>
            {form.stops.map((stop, index) => {
              const drinks = drinksByTenant[stop.tenant_id] || []
              return (
                <div key={index} className="taplist-panel-grid" style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 10 }}>
                  <div className="taplist-field">
                    <label>第 {index + 1} 站 · 酒吧</label>
                    <select className="admin-input" value={stop.tenant_id} onChange={(event) => selectTenant(index, event.target.value)}>
                      <option value="">请选择</option>
                      {tenants.map((tenant) => (
                        <option key={tenant.id} value={tenant.id} disabled={selectedTenantIds.includes(tenant.id) && stop.tenant_id !== tenant.id}>
                          {tenant.name} {tenant.slug ? `(${tenant.slug})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="taplist-field">
                    <label>联名酒</label>
                    <select className="admin-input" value={stop.drink_id} disabled={!stop.tenant_id} onChange={(event) => updateStop(index, { drink_id: event.target.value })}>
                      <option value="">请选择</option>
                      {drinks.map((drink) => (
                        <option key={drink.id} value={drink.id}>
                          {drink.display_name || drink.name} · {drink.public_status}{drink.enabled && drink.is_public_visible ? '' : '（未公开）'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="taplist-field taplist-field-span-2">
                    <label>合作酒厂官方展示名</label>
                    <input className="admin-input" value={stop.brewery_label} onChange={(event) => updateStop(index, { brewery_label: event.target.value })} />
                  </div>
                </div>
              )
            })}
          </div>

          <label className="admin-label admin-label-checkbox" style={{ marginTop: 18 }}>
            <input type="checkbox" checked={form.is_public_visible} onChange={(event) => setForm({ ...form, is_public_visible: event.target.checked })} />
            <span>通过完整校验后公开</span>
          </label>
          <div className="taplist-panel-actions">
            <button className="admin-button admin-button-primary" type="submit" disabled={saving || Boolean(uploading)}>
              {saving ? '保存中…' : form.is_public_visible ? '保存并公开' : '保存草稿'}
            </button>
            <button className="admin-button admin-button-secondary" type="button" onClick={() => setForm(blankForm())}>新建空白活动</button>
          </div>
        </form>
      </div>

      <div className="admin-section">
        <h2>联合活动列表</h2>
        {campaigns.length === 0 ? <p>暂无联合活动。</p> : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead><tr><th>状态</th><th>标题</th><th>日期</th><th>站点</th><th>操作</th></tr></thead>
              <tbody>{campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td>{campaign.status === 'cancelled' ? '已取消' : campaign.is_public_visible ? '公开' : '隐藏'}</td>
                  <td className="name-cell">{campaign.title}</td>
                  <td>{toLocal(campaign.start_at).slice(0, 10)} — {toLocal(campaign.end_at).slice(0, 10)}</td>
                  <td>{campaign.stops.length}/6</td>
                  <td><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="admin-button admin-button-secondary" type="button" onClick={() => editCampaign(campaign)}>编辑</button>
                    {campaign.is_public_visible ? <button className="admin-button admin-button-secondary" type="button" onClick={() => void hideCampaign(campaign)}>紧急隐藏</button> : null}
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', span = false }: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  span?: boolean
}) {
  return <div className={`taplist-field${span ? ' taplist-field-span-2' : ''}`}>
    <label>{label}</label>
    <input className="admin-input" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
  </div>
}

function AssetField({ label, role, value, busy, onUpload, onChange }: {
  label: string
  role: CampaignAssetRole
  value: string
  busy: CampaignAssetRole | null
  onUpload: (role: CampaignAssetRole, file: File) => Promise<void>
  onChange: (value: string) => void
}) {
  return <div className="taplist-field">
    <label>{label}</label>
    {value ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={value} alt="" style={{ width: '100%', maxHeight: 150, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }} />
    ) : null}
    <input className="admin-input" value={value} placeholder="图片 URL" onChange={(event) => onChange(event.target.value)} />
    <input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)} onChange={(event) => {
      const file = event.target.files?.[0]
      if (file) void onUpload(role, file)
      event.currentTarget.value = ''
    }} />
    {busy === role ? <small>上传中…</small> : null}
  </div>
}
