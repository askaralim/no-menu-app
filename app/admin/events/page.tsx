'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { supabase } from '@/lib/supabaseClient'
import { uploadTaplistEventImage } from '@/lib/taplistStorage'

type UserRole = 'owner' | 'staff' | 'super_admin' | null

type BarOption = {
  id: string
  name: string
  slug: string
}

type EventStatus = 'scheduled' | 'cancelled'

type BarEventRow = {
  id: string
  tenant_id: string
  title: string
  subtitle: string | null
  description: string | null
  event_type: string
  image_url: string | null
  start_at: string | null
  end_at: string | null
  visible_until_at: string | null
  date_label: string | null
  time_label: string | null
  status: EventStatus
  is_public_visible: boolean
  sort_order: number
  created_at?: string
  updated_at?: string
}

type EventForm = {
  id: string
  title: string
  subtitle: string
  description: string
  event_type: string
  image_url: string
  start_at: string
  end_at: string
  visible_until_at: string
  date_label: string
  time_label: string
  status: EventStatus
  is_public_visible: boolean
  sort_order: number
}

const PLATFORM_SLUG = '__platform__'

const EVENT_TYPES = [
  { value: 'new_tap', label: '新酒上架' },
  { value: 'tap_takeover', label: 'Tap Takeover' },
  { value: 'guest_shift', label: 'Guest Shift' },
  { value: 'tasting', label: '品鉴' },
  { value: 'dj', label: 'DJ / 音乐' },
  { value: 'live_music', label: 'Live Music' },
  { value: 'quiz', label: 'Quiz Night' },
  { value: 'party', label: '派对' },
  { value: 'happy_hour', label: 'Happy Hour / 欢乐时段' },
  { value: 'other', label: '其他活动' },
]

function blankEventForm(): EventForm {
  return {
    id: crypto.randomUUID(),
    title: '',
    subtitle: '',
    description: '',
    event_type: 'other',
    image_url: '',
    start_at: '',
    end_at: '',
    visible_until_at: '',
    date_label: '',
    time_label: '',
    status: 'scheduled',
    is_public_visible: false,
    sort_order: 0,
  }
}

function rowToForm(row: BarEventRow): EventForm {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle ?? '',
    description: row.description ?? '',
    event_type: row.event_type || 'other',
    image_url: row.image_url ?? '',
    start_at: toDatetimeLocal(row.start_at),
    end_at: toDatetimeLocal(row.end_at),
    visible_until_at: toDatetimeLocal(row.visible_until_at),
    date_label: row.date_label ?? '',
    time_label: row.time_label ?? '',
    status: row.status,
    is_public_visible: row.is_public_visible,
    sort_order: row.sort_order ?? 0,
  }
}

function toDatetimeLocal(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function fromDatetimeLocal(value: string) {
  if (!value) return null
  return new Date(value).toISOString()
}

function eventTypeLabel(value: string) {
  return EVENT_TYPES.find((item) => item.value === value)?.label ?? '其他活动'
}

function EventsAdminPageInner() {
  const [role, setRole] = useState<UserRole>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [barOptions, setBarOptions] = useState<BarOption[]>([])
  const [events, setEvents] = useState<BarEventRow[]>([])
  const [form, setForm] = useState<EventForm>(() => blankEventForm())
  const [loading, setLoading] = useState(true)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const eventFileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const searchParams = useSearchParams()

  const isOwner = role === 'owner' || role === 'super_admin'
  const isSuperAdmin = role === 'super_admin'
  const currentBar = barOptions.find((bar) => bar.id === tenantId) ?? null

  const loadRoleAndTenant = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: roles } = await supabase.from('user_roles').select('role, tenant_id').eq('user_id', user.id)
    const list = roles ?? []
    const urlTenant = searchParams.get('tenant')
    let nextTenantId: string | null = null

    if (list.some((row) => row.role === 'super_admin')) {
      setRole('super_admin')
      type AdminTenantRow = { id: string; slug: string | null; name: string }
      const { data: tenants, error } = await supabase.rpc('admin_list_tenants')
      if (error) console.error(error)
      const bars = ((tenants ?? []) as AdminTenantRow[]).filter(
        (tenant) => tenant.slug != null && tenant.slug !== PLATFORM_SLUG
      )
      setBarOptions(bars.map((bar) => ({ id: bar.id, name: bar.name, slug: bar.slug! })))
      if (urlTenant && bars.some((bar) => bar.id === urlTenant)) nextTenantId = urlTenant
      else if (bars.length > 0) nextTenantId = bars[0].id
    } else {
      const ownerRows = list.filter((row) => row.role === 'owner')
      if (ownerRows.length > 0) {
        setRole('owner')
        const allowed = ownerRows.map((row) => row.tenant_id)
        const { data: ownerBars } = await supabase
          .from('tenants')
          .select('id, name, slug')
          .in('id', allowed)
        const options = (ownerBars ?? [])
          .filter((bar) => bar.slug !== PLATFORM_SLUG)
          .map((bar) => ({ id: bar.id, name: bar.name, slug: bar.slug }))
        setBarOptions(options)
        if (urlTenant && allowed.includes(urlTenant)) nextTenantId = urlTenant
        else nextTenantId = ownerRows[0].tenant_id
      } else if (list[0]) {
        setRole(list[0].role as UserRole)
        nextTenantId = list[0].tenant_id
      }
    }

    setTenantId(nextTenantId)
  }, [searchParams])

  const loadEvents = useCallback(async (tid: string) => {
    setEventsLoading(true)
    try {
      const { data, error } = await supabase
        .from('bar_events')
        .select('*')
        .eq('tenant_id', tid)
        .order('start_at', { ascending: true, nullsFirst: false })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
      if (error) throw error
      setEvents((data ?? []) as BarEventRow[])
    } catch (err) {
      console.error(err)
      alert('加载活动失败。请确认已执行 bar_events 迁移。')
    } finally {
      setEventsLoading(false)
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      await loadRoleAndTenant()
      setLoading(false)
    })()
  }, [loadRoleAndTenant])

  useEffect(() => {
    if (!tenantId || !isOwner) return
    setForm(blankEventForm())
    void loadEvents(tenantId)
  }, [tenantId, isOwner, loadEvents])

  const switchTenant = (id: string) => {
    router.push(`/admin/events?tenant=${id}`)
  }

  const validateForm = () => {
    if (!form.title.trim()) {
      alert('请填写活动标题')
      return false
    }
    if (form.is_public_visible) {
      const hasBound =
        Boolean(form.start_at) || Boolean(form.end_at) || Boolean(form.visible_until_at)
      // Evergreen: no time bounds — public toggle only (POS long-running board).
      if (!hasBound) return true

      const hasDisplayTime = form.start_at || form.date_label.trim() || form.time_label.trim()
      if (!hasDisplayTime) {
        alert('有时间边界的公开活动需要填写结构化时间，或至少填写日期/时间展示文案')
        return false
      }
    }
    return true
  }

  const saveEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId || !validateForm()) return

    setSaving(true)
    try {
      const payload = {
        id: form.id,
        tenant_id: tenantId,
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        description: form.description.trim() || null,
        event_type: form.event_type,
        image_url: form.image_url.trim() || null,
        start_at: fromDatetimeLocal(form.start_at),
        end_at: fromDatetimeLocal(form.end_at),
        visible_until_at: fromDatetimeLocal(form.visible_until_at),
        date_label: form.date_label.trim() || null,
        time_label: form.time_label.trim() || null,
        status: form.status,
        is_public_visible: form.is_public_visible,
        sort_order: form.sort_order,
      }
      const { error } = await supabase.from('bar_events').upsert(payload, { onConflict: 'id' })
      if (error) throw error
      alert('活动已保存')
      await loadEvents(tenantId)
      setForm(blankEventForm())
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : '保存活动失败')
    } finally {
      setSaving(false)
    }
  }

  const hideEvent = async (event: BarEventRow) => {
    if (!tenantId) return
    if (!confirm(`隐藏活动「${event.title}」？`)) return
    const { error } = await supabase.from('bar_events').update({ is_public_visible: false }).eq('id', event.id)
    if (error) {
      console.error(error)
      alert('隐藏活动失败')
      return
    }
    await loadEvents(tenantId)
    if (form.id === event.id) setForm((prev) => ({ ...prev, is_public_visible: false }))
  }

  const cancelEvent = async (event: BarEventRow) => {
    if (!tenantId) return
    if (!confirm(`取消活动「${event.title}」？`)) return
    const { error } = await supabase.from('bar_events').update({ status: 'cancelled', is_public_visible: false }).eq('id', event.id)
    if (error) {
      console.error(error)
      alert('取消活动失败')
      return
    }
    await loadEvents(tenantId)
    if (form.id === event.id) setForm((prev) => ({ ...prev, status: 'cancelled', is_public_visible: false }))
  }

  const handleEventImageFile = async (file: File) => {
    if (!tenantId) return
    setUploading(true)
    try {
      const publicUrl = await uploadTaplistEventImage(supabase, tenantId, form.id, file)
      setForm((prev) => ({ ...prev, image_url: publicUrl }))
      alert('活动图片已上传。保存活动后消费者可见。')
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : '活动图片上传失败')
    } finally {
      setUploading(false)
      if (eventFileRef.current) eventFileRef.current.value = ''
    }
  }

  if (loading) {
    return (
      <div className="admin-container">
        <p>加载中...</p>
      </div>
    )
  }

  if (!isOwner) {
    return (
      <div className="admin-container">
        <div className="admin-header">
          <h1>活动管理</h1>
        </div>
        <p>仅店主可管理活动。员工权限会在后续版本单独开放。</p>
      </div>
    )
  }

  if (!tenantId) {
    return (
      <div className="admin-container">
        <div className="admin-header">
          <h1>活动管理</h1>
        </div>
        <p>
          当前账号未绑定门店。超级管理员请先在 <a href="/admin/platform">平台管理</a> 创建酒吧。
        </p>
      </div>
    )
  }

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>活动管理</h1>
        <p style={{ color: '#4b5563', marginTop: '0.5rem' }}>
          当前编辑门店：<strong>{currentBar?.name ?? tenantId}</strong>
          {currentBar ? <code style={{ marginLeft: 8, fontSize: '0.9rem' }}>{currentBar.slug}</code> : null}
        </p>
        {barOptions.length > 1 ? (
          <div style={{ marginTop: '0.75rem' }}>
            <label className="admin-label" htmlFor="tenant-picker">
              切换门店
            </label>
            <select
              id="tenant-picker"
              className="admin-input"
              style={{ maxWidth: 360, marginTop: 4 }}
              value={tenantId}
              onChange={(e) => switchTenant(e.target.value)}
            >
              {barOptions.map((bar) => (
                <option key={bar.id} value={bar.id}>
                  {bar.name} ({bar.slug})
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className="admin-section">
        <h2>{events.some((event) => event.id === form.id) ? '编辑活动' : '新建活动'}</h2>
        <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
          活动用于消费者 App 的 TONIGHT EVENTS，不包含报名、订票、预约或评论。
          不填开始/结束/可见截止时视为长期挂牌：仅靠「对消费者公开」开关；有时间边界的活动仍按结束/可见截止下架。循环文案（如 Happy Hour）也可只填展示文案。单次活动优先填写开始/结束日期。
        </p>
        <form onSubmit={saveEvent} className="admin-form">
          <div className="taplist-panel-grid">
            <div className="taplist-field taplist-field-span-2">
              <label htmlFor="event-title">标题</label>
              <input
                id="event-title"
                className="admin-input"
                placeholder="Tap Takeover"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="taplist-field">
              <label htmlFor="event-type">活动类型</label>
              <select
                id="event-type"
                className="admin-input"
                value={form.event_type}
                onChange={(e) => setForm({ ...form, event_type: e.target.value })}
              >
                {EVENT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="taplist-field">
              <label htmlFor="event-sort">排序</label>
              <input
                id="event-sort"
                className="admin-input"
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value, 10) || 0 })}
              />
            </div>
            <div className="taplist-field taplist-field-span-2">
              <label htmlFor="event-subtitle">短副标题</label>
              <input
                id="event-subtitle"
                className="admin-input"
                placeholder="6 款新酒同时上架"
                value={form.subtitle}
                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
              />
            </div>
            <div className="taplist-field">
              <label htmlFor="event-date-label">日期展示文案</label>
              <input
                id="event-date-label"
                className="admin-input"
                placeholder="今晚 / 本周五"
                value={form.date_label}
                onChange={(e) => setForm({ ...form, date_label: e.target.value })}
              />
            </div>
            <div className="taplist-field">
              <label htmlFor="event-time-label">时间展示文案</label>
              <input
                id="event-time-label"
                className="admin-input"
                placeholder="20:00 开始"
                value={form.time_label}
                onChange={(e) => setForm({ ...form, time_label: e.target.value })}
              />
            </div>
            <div className="taplist-field">
              <label htmlFor="event-start">开始时间</label>
              <input
                id="event-start"
                className="admin-input"
                type="datetime-local"
                value={form.start_at}
                onChange={(e) => setForm({ ...form, start_at: e.target.value })}
              />
            </div>
            <div className="taplist-field">
              <label htmlFor="event-end">结束时间</label>
              <input
                id="event-end"
                className="admin-input"
                type="datetime-local"
                value={form.end_at}
                onChange={(e) => setForm({ ...form, end_at: e.target.value })}
              />
            </div>
            <div className="taplist-field">
              <label htmlFor="event-visible-until">可见截止</label>
              <input
                id="event-visible-until"
                className="admin-input"
                type="datetime-local"
                value={form.visible_until_at}
                onChange={(e) => setForm({ ...form, visible_until_at: e.target.value })}
              />
            </div>
            <div className="taplist-field">
              <label htmlFor="event-status">状态</label>
              <select
                id="event-status"
                className="admin-input"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as EventStatus })}
              >
                <option value="scheduled">scheduled</option>
                <option value="cancelled">cancelled</option>
              </select>
            </div>
            <div className="taplist-field taplist-field-span-2">
              <label htmlFor="event-description">活动介绍</label>
              <textarea
                id="event-description"
                className="admin-input"
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="taplist-field taplist-field-span-2">
              <label>活动图片</label>
              <EventImageUploadField
                busy={uploading}
                previewUrl={form.image_url || null}
                inputRef={eventFileRef}
                onFileSelected={handleEventImageFile}
              />
              <input
                className="admin-input"
                placeholder="图片 URL（可粘贴外链，或上方上传）"
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              />
            </div>
          </div>

          <label className="admin-label admin-label-checkbox" style={{ marginTop: 12 }}>
            <input
              type="checkbox"
              checked={form.is_public_visible}
              onChange={(e) => setForm({ ...form, is_public_visible: e.target.checked })}
            />
            <span>对消费者公开</span>
          </label>

          <div className="taplist-panel-actions">
            <button type="submit" className="admin-button admin-button-primary" disabled={saving}>
              {saving ? '保存中…' : '保存活动'}
            </button>
            <button type="button" className="admin-button admin-button-secondary" onClick={() => setForm(blankEventForm())}>
              新建空白活动
            </button>
          </div>
        </form>
      </div>

      <div className="admin-section">
        <h2>活动列表</h2>
        {eventsLoading ? (
          <p style={{ color: '#6b7280' }}>加载活动中...</p>
        ) : events.length === 0 ? (
          <p style={{ color: '#6b7280' }}>暂无活动。</p>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>公开</th>
                  <th>状态</th>
                  <th>类型</th>
                  <th>标题</th>
                  <th>时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{event.is_public_visible ? '公开' : '隐藏'}</td>
                    <td>{event.status}</td>
                    <td>{eventTypeLabel(event.event_type)}</td>
                    <td className="name-cell">{event.title}</td>
                    <td>{[event.date_label, event.time_label].filter(Boolean).join(' · ') || toDatetimeLocal(event.start_at) || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <button type="button" className="admin-button admin-button-secondary" onClick={() => setForm(rowToForm(event))}>
                          编辑
                        </button>
                        {event.is_public_visible ? (
                          <button type="button" className="admin-button admin-button-secondary" onClick={() => void hideEvent(event)}>
                            隐藏
                          </button>
                        ) : null}
                        {event.status !== 'cancelled' ? (
                          <button type="button" className="admin-button admin-button-danger" onClick={() => void cancelEvent(event)}>
                            取消
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function EventImageUploadField({
  busy,
  previewUrl,
  inputRef,
  onFileSelected,
}: {
  busy: boolean
  previewUrl: string | null
  inputRef: React.RefObject<HTMLInputElement>
  onFileSelected: (file: File) => void | Promise<void>
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>JPEG / PNG / WebP，最大 2MB</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt=""
            style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb' }}
          />
        ) : null}
        <label className="admin-button admin-button-secondary" style={{ cursor: busy ? 'wait' : 'pointer' }}>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void onFileSelected(file)
            }}
          />
          {busy ? '上传中…' : '上传活动图片'}
        </label>
      </div>
    </div>
  )
}

export default function EventsAdminPage() {
  return (
    <Suspense fallback={
      <div className="admin-container">
        <p>加载中...</p>
      </div>
    }>
      <EventsAdminPageInner />
    </Suspense>
  )
}
