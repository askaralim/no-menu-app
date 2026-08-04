'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { generateTempOwnerPassword, normalizeChinaMobile, toNationalMobile } from '@/lib/ownerAuth'

type SupportStatus = 'pending' | 'in_progress' | 'resolved' | 'closed'

type SupportRequest = {
  id: string
  request_type: string
  source: string
  tenant_id: string | null
  contact_name: string | null
  contact_channel: string | null
  contact_value: string | null
  venue_name: string | null
  message: string | null
  status: SupportStatus
  resolution_note: string | null
  created_at: string
}

type OnboardForm = {
  name: string
  slug: string
  mobile: string
  password: string
}

type DeliveryCard = {
  requestId: string
  tenantName: string
  tenantId: string
  mobile: string
  temporaryPassword: string
  created: boolean
}

const STATUS_LABEL: Record<SupportStatus, string> = {
  pending: '待处理',
  in_progress: '处理中',
  resolved: '已完成',
  closed: '已关闭',
}

const TYPE_LABEL: Record<string, string> = {
  bar_onboarding: '门店开通',
  product_support: '使用帮助',
  privacy: '账号与隐私',
  account_deletion: '删除账号',
  other: '其他',
}

const btnStyle: CSSProperties = {
  padding: '7px 12px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  cursor: 'pointer',
  background: '#fff',
}

const primaryBtnStyle: CSSProperties = {
  ...btnStyle,
  background: '#111827',
  color: '#fff',
  borderColor: '#111827',
}

function requestNumber(id: string) {
  return `NM-${id.replaceAll('-', '').slice(0, 8).toUpperCase()}`
}

function defaultMobile(row: SupportRequest): string {
  if (row.contact_channel === 'mobile' && row.contact_value) {
    return toNationalMobile(row.contact_value) || row.contact_value.replace(/\D/g, '')
  }
  return ''
}

function slugifyHint(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/[\u4e00-\u9fff]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function deliveryCopy(card: DeliveryCard): string {
  return [
    `【No Menu Tonight】${card.tenantName}`,
    '',
    `手机号：${card.mobile}`,
    `临时密码：${card.temporaryPassword}`,
    '',
    '请打开 No Menu Tonight，使用手机号和临时密码登录。',
    '首次登录后请修改密码。',
  ].join('\n')
}

export default function SupportRequestsPage() {
  const [rows, setRows] = useState<SupportRequest[]>([])
  const [filter, setFilter] = useState<SupportStatus | 'all'>('pending')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [onboardId, setOnboardId] = useState<string | null>(null)
  const [onboardForm, setOnboardForm] = useState<OnboardForm>({
    name: '',
    slug: '',
    mobile: '',
    password: '',
  })
  const [delivery, setDelivery] = useState<DeliveryCard | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_list_support_requests', {
      p_status: filter === 'all' ? null : filter,
      p_limit: 200,
    })
    if (error) window.alert(error.message)
    setRows((data || []) as SupportRequest[])
    setLoading(false)
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  const updateRequest = async (
    row: SupportRequest,
    status: SupportStatus,
    note: string | null,
    tenantId?: string | null,
  ) => {
    const { error } = await supabase.rpc('admin_update_support_request', {
      p_request_id: row.id,
      p_status: status,
      p_resolution_note: note,
      ...(tenantId ? { p_tenant_id: tenantId } : {}),
    })
    if (error) throw new Error(error.message)
  }

  const updateWithPrompt = async (row: SupportRequest, status: SupportStatus) => {
    const note = window.prompt('处理备注（可选）', row.resolution_note || '')
    if (note === null) return
    setBusyId(row.id)
    try {
      await updateRequest(row, status, note || null)
      await load()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '更新失败')
    } finally {
      setBusyId(null)
    }
  }

  const startProcessing = async (row: SupportRequest) => {
    setBusyId(row.id)
    try {
      await updateRequest(row, 'in_progress', row.resolution_note || '已开始联系申请人')
      await load()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '更新失败')
    } finally {
      setBusyId(null)
    }
  }

  const closeRequest = async (row: SupportRequest) => {
    const note = window.prompt(
      '关闭原因（无效 / 重复 / 拒绝 / 撤回）',
      row.resolution_note || '',
    )
    if (note === null) return
    setBusyId(row.id)
    try {
      await updateRequest(row, 'closed', note.trim() || '已关闭')
      if (onboardId === row.id) setOnboardId(null)
      await load()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '关闭失败')
    } finally {
      setBusyId(null)
    }
  }

  const openOnboardForm = (row: SupportRequest) => {
    const name = (row.venue_name || '').trim()
    setOnboardForm({
      name,
      slug: slugifyHint(name),
      mobile: defaultMobile(row),
      password: '',
    })
    setOnboardId(row.id)
    setDelivery(null)
  }

  const submitOnboard = async (row: SupportRequest) => {
    const name = onboardForm.name.trim()
    const slug = onboardForm.slug.trim().toLowerCase()
    const mobileRaw = onboardForm.mobile.trim()
    const passwordInput = onboardForm.password.trim()

    if (!row.tenant_id) {
      if (!name) {
        window.alert('请填写门店名称')
        return
      }
      if (!slug) {
        window.alert('请填写 slug')
        return
      }
    }

    if (!normalizeChinaMobile(mobileRaw)) {
      window.alert(
        row.contact_channel === 'wechat'
          ? '微信申请不能用微信号开通账号，请填写店主中国大陆手机号'
          : '请填写有效的中国大陆手机号',
      )
      return
    }

    const password = passwordInput || generateTempOwnerPassword(mobileRaw)
    if (password.length < 6) {
      window.alert('临时密码至少 6 位')
      return
    }

    const confirmed = window.confirm(
      [
        row.tenant_id ? '将仅绑定店主到已创建的门店。' : '将创建门店并绑定店主账号。',
        '',
        '若该手机号已有店主账号，将重置其密码并绑定到本门店。',
        '临时密码仅本次显示，不会写入申请备注。',
        '',
        '确认继续？',
      ].join('\n'),
    )
    if (!confirmed) return

    setBusyId(row.id)
    let tenantId = row.tenant_id
    const tenantName = name || row.venue_name || '门店'

    try {
      if (!tenantId) {
        const { data, error } = await supabase.rpc('admin_create_bar', {
          p_name: name,
          p_slug: slug,
        })
        if (error) {
          window.alert(error.message || '创建门店失败')
          return
        }
        tenantId = data as string
        if (!tenantId) {
          window.alert('创建门店失败：未返回 tenant_id')
          return
        }

        // Persist link before provision so refresh can retry bind without recreating the bar.
        await updateRequest(
          row,
          'in_progress',
          `门店已创建：${tenantName}（${tenantId}）。待绑定店主。`,
          tenantId,
        )
        await load()
      }

      const { data: provisionData, error: provisionError } = await supabase.rpc(
        'admin_provision_owner',
        {
          p_tenant_id: tenantId,
          p_mobile: mobileRaw,
          p_password: password,
        },
      )

      if (provisionError) {
        window.alert(
          `门店已创建（tenant_id: ${tenantId}），但绑定店主失败：${provisionError.message}\n请修正手机号后点击「重试绑定店主」。`,
        )
        await load()
        return
      }

      const json = provisionData as {
        ok?: boolean
        created?: boolean
        mobile?: string
        temporary_password?: string
      }

      const deliveredMobile = json.mobile || toNationalMobile(mobileRaw)
      const deliveredPassword = json.temporary_password || password
      const deliveredAt = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })

      await updateRequest(
        { ...row, tenant_id: tenantId },
        'resolved',
        `已开通并交付：${tenantName}；tenant_id=${tenantId}；交付时间 ${deliveredAt}`,
        tenantId,
      )

      setDelivery({
        requestId: row.id,
        tenantName,
        tenantId,
        mobile: deliveredMobile,
        temporaryPassword: deliveredPassword,
        created: !!json.created,
      })
      setOnboardId(null)
      await load()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '开通失败')
      await load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginBottom: 8 }}>支持请求</h1>
      <p style={{ color: '#64748b', marginBottom: 20 }}>
        门店开通、产品支持、隐私与账号删除申请。门店开通为 Concierge：申请 → 人工确认 → 平台创建 → 交付账号。
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {(['pending', 'in_progress', 'resolved', 'closed', 'all'] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            style={{
              border: '1px solid #d1d5db',
              borderRadius: 999,
              padding: '8px 14px',
              background: filter === status ? '#111827' : '#fff',
              color: filter === status ? '#fff' : '#111827',
              cursor: 'pointer',
            }}
          >
            {status === 'all' ? '全部' : STATUS_LABEL[status]}
          </button>
        ))}
      </div>

      {delivery ? (
        <div
          style={{
            marginBottom: 20,
            padding: 16,
            borderRadius: 12,
            border: '1px solid #ca8a04',
            background: '#fffbeb',
          }}
        >
          <strong style={{ color: '#92400e' }}>
            账号已交付{delivery.created ? '（新账号）' : '（已有账号已重置密码）'} — 请复制发给店主
          </strong>
          <pre
            style={{
              margin: '12px 0',
              whiteSpace: 'pre-wrap',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            {deliveryCopy(delivery)}
          </pre>
          <p style={{ color: '#78716c', fontSize: 13, margin: '0 0 12px' }}>
            tenant_id：{delivery.tenantId} · 临时密码仅此显示，未写入申请备注
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              style={primaryBtnStyle}
              onClick={() => {
                void navigator.clipboard.writeText(deliveryCopy(delivery)).then(
                  () => window.alert('已复制微信文案'),
                  () => window.alert('复制失败，请手动选择文案'),
                )
              }}
            >
              复制微信文案
            </button>
            <button type="button" style={btnStyle} onClick={() => setDelivery(null)}>
              关闭卡片
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p>加载中…</p>
      ) : rows.length === 0 ? (
        <p>暂无请求</p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {rows.map((row) => {
            const isOnboarding = row.request_type === 'bar_onboarding'
            const busy = busyId === row.id
            const open = onboardId === row.id
            const canStart = isOnboarding && row.status === 'pending'
            const canOnboard =
              isOnboarding &&
              (row.status === 'pending' || row.status === 'in_progress') &&
              !row.tenant_id
            const canRetryBind =
              isOnboarding && row.status === 'in_progress' && Boolean(row.tenant_id)
            const canClose =
              isOnboarding && row.status !== 'resolved' && row.status !== 'closed'

            return (
              <article
                key={row.id}
                style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 18, background: '#fff' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{TYPE_LABEL[row.request_type] || row.request_type}</strong>
                    <span style={{ color: '#64748b', marginLeft: 10 }}>{requestNumber(row.id)}</span>
                  </div>
                  <span>{STATUS_LABEL[row.status]}</span>
                </div>
                <p style={{ margin: '12px 0 4px' }}>
                  {row.venue_name ? `${row.venue_name} · ` : ''}
                  {row.contact_name || '登录用户'}
                </p>
                {row.contact_value ? (
                  <p style={{ color: '#475569', margin: '4px 0' }}>
                    {row.contact_channel === 'wechat' ? '微信' : '手机'}：{row.contact_value}
                  </p>
                ) : null}
                {row.tenant_id ? (
                  <p style={{ color: '#0f766e', margin: '4px 0', fontSize: 13 }}>
                    已关联门店 tenant_id：{row.tenant_id}
                    {canRetryBind ? '（待重试绑定店主）' : ''}
                  </p>
                ) : null}
                {row.message ? (
                  <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{row.message}</p>
                ) : null}
                {row.resolution_note ? (
                  <p style={{ color: '#64748b', fontSize: 13, marginTop: 8 }}>
                    备注：{row.resolution_note}
                  </p>
                ) : null}
                <p style={{ color: '#94a3b8', fontSize: 13 }}>
                  {new Date(row.created_at).toLocaleString('zh-CN')}
                </p>

                {isOnboarding ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    {canStart ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void startProcessing(row)}
                        style={primaryBtnStyle}
                      >
                        开始处理
                      </button>
                    ) : null}
                    {canOnboard ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => openOnboardForm(row)}
                        style={btnStyle}
                      >
                        开通门店
                      </button>
                    ) : null}
                    {canRetryBind ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => openOnboardForm(row)}
                        style={primaryBtnStyle}
                      >
                        重试绑定店主
                      </button>
                    ) : null}
                    {canClose ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void closeRequest(row)}
                        style={btnStyle}
                      >
                        关闭申请
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    {(['pending', 'in_progress', 'resolved', 'closed'] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={busy || status === row.status}
                        onClick={() => void updateWithPrompt(row, status)}
                        style={btnStyle}
                      >
                        设为{STATUS_LABEL[status]}
                      </button>
                    ))}
                  </div>
                )}

                {open ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      void submitOnboard(row)
                    }}
                    style={{
                      marginTop: 16,
                      padding: 14,
                      borderRadius: 10,
                      border: '1px solid #e5e7eb',
                      background: '#f8fafc',
                      display: 'grid',
                      gap: 10,
                      maxWidth: 480,
                    }}
                  >
                    <strong>{row.tenant_id ? '重试绑定店主' : '开通门店'}</strong>
                    {row.contact_channel === 'wechat' ? (
                      <p style={{ margin: 0, color: '#b45309', fontSize: 13 }}>
                        申请联系方式为微信，不能用微信号创建登录账号，请向申请人确认店主手机号后填写。
                      </p>
                    ) : null}
                    {row.tenant_id ? (
                      <p style={{ margin: 0, color: '#0f766e', fontSize: 13 }}>
                        门店已创建，不会重复建店。tenant_id：{row.tenant_id}
                      </p>
                    ) : (
                      <>
                        <input
                          required
                          placeholder="门店名称"
                          value={onboardForm.name}
                          onChange={(e) => setOnboardForm({ ...onboardForm, name: e.target.value })}
                          style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db' }}
                        />
                        <input
                          required
                          placeholder="slug（小写，如 midnightswim）"
                          value={onboardForm.slug}
                          onChange={(e) =>
                            setOnboardForm({ ...onboardForm, slug: e.target.value.toLowerCase() })
                          }
                          autoCapitalize="none"
                          style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db' }}
                        />
                      </>
                    )}
                    <input
                      required
                      placeholder="店主中国大陆手机号"
                      value={onboardForm.mobile}
                      onChange={(e) => setOnboardForm({ ...onboardForm, mobile: e.target.value })}
                      autoCapitalize="none"
                      style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db' }}
                    />
                    <input
                      placeholder="临时密码（可选，留空自动生成）"
                      value={onboardForm.password}
                      onChange={(e) => setOnboardForm({ ...onboardForm, password: e.target.value })}
                      autoCapitalize="none"
                      style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db' }}
                    />
                    <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>
                      新门店默认不公开酒单、不开启点单。公开由店主在 POS 自行完成。
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="submit" disabled={busy} style={primaryBtnStyle}>
                        {busy ? '处理中…' : row.tenant_id ? '绑定店主' : '确认开通'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setOnboardId(null)}
                        style={btnStyle}
                      >
                        取消
                      </button>
                    </div>
                  </form>
                ) : null}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
