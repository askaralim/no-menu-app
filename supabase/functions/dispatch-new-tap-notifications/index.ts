import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const jsonHeaders = { 'Content-Type': 'application/json' }
const expoSendUrl = 'https://exp.host/--/api/v2/push/send'
const expoReceiptsUrl = 'https://exp.host/--/api/v2/push/getReceipts'

type Delivery = {
  id: string
  batch_id: string
  device_id: string | null
  expo_push_token: string
  title: string
  body: string
  payload: Record<string, unknown>
  attempt_count: number
}

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders })
}

function chunks<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size)
  )
}

function compactDrinkName(value: string, maxLength = 18) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return response({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const dispatchSecret = Deno.env.get('NEW_TAP_PUSH_DISPATCH_SECRET')
  const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN')
  const pushEnabled = Deno.env.get('NEW_TAP_PUSH_ENABLED') === 'true'
  if (!supabaseUrl || !serviceRoleKey || !dispatchSecret || !expoAccessToken) {
    return response({ ok: false, code: 'CONFIG_MISSING' }, 503)
  }
  if (req.headers.get('x-dispatch-secret') !== dispatchSecret) {
    return response({ ok: false, code: 'UNAUTHORIZED' }, 401)
  }
  if (!pushEnabled) return response({ ok: true, disabled: true })

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error: backfillError } = await admin.rpc('backfill_missing_new_tap_events')
  if (backfillError) console.error('new-tap compensation scan failed', backfillError.message)

  let batchesCreated = 0
  for (let index = 0; index < 20; index += 1) {
    const { data, error } = await admin.rpc('claim_ready_new_tap_batch')
    if (error) return response({ ok: false, code: 'CLAIM_FAILED' }, 500)
    const claimed = data as { batch_id?: string; tenant_id?: string } | null
    if (!claimed?.batch_id || !claimed.tenant_id) break
    try {
      await createBatchDeliveries(admin, claimed.batch_id, claimed.tenant_id)
    } catch (error) {
      console.error('create new-tap batch deliveries failed', error instanceof Error ? error.message : error)
      await releaseBatch(admin, claimed.batch_id)
    }
    batchesCreated += 1
  }

  const sent = await sendPendingDeliveries(admin, expoAccessToken)
  const receipts = await checkReceipts(admin, expoAccessToken)
  return response({ ok: true, batchesCreated, sent, receipts })
})

async function createBatchDeliveries(admin: ReturnType<typeof createClient>, batchId: string, tenantId: string) {
  const [{ data: eventRows, error: eventError }, { data: tenant, error: tenantError }] = await Promise.all([
    admin.from('new_tap_notification_events').select('id, drink_id, detected_at').eq('batch_id', batchId),
    admin.from('tenants').select('id, slug, name, display_name, status, is_public_visible').eq('id', tenantId).maybeSingle(),
  ])
  if (eventError || tenantError || !tenant || tenant.status !== 'active' || !tenant.is_public_visible) {
    await cancelBatch(admin, batchId)
    return
  }

  const events = eventRows ?? []
  const drinkIds = events.map((event) => event.drink_id)
  if (drinkIds.length === 0) {
    await cancelBatch(admin, batchId)
    return
  }

  const { data: drinkRows, error: drinkError } = await admin
    .from('drinks')
    .select('id, name, display_name, category_id, enabled, is_public_visible, public_status')
    .in('id', drinkIds)
  if (drinkError) throw drinkError

  const categoryIds = [...new Set((drinkRows ?? []).map((drink) => drink.category_id))]
  const { data: categoryRows, error: categoryError } = categoryIds.length > 0
    ? await admin.from('categories').select('id, enabled, is_public_visible').in('id', categoryIds)
    : { data: [], error: null }
  if (categoryError) throw categoryError
  const publicCategoryIds = new Set((categoryRows ?? [])
    .filter((category) => category.enabled && category.is_public_visible)
    .map((category) => category.id))
  const validDrinks = (drinkRows ?? []).filter((drink) =>
    drink.enabled && drink.is_public_visible && drink.public_status === 'new' && publicCategoryIds.has(drink.category_id)
  )
  if (validDrinks.length === 0) {
    await cancelBatch(admin, batchId)
    return
  }

  const earliestDetectedAt = events.reduce(
    (earliest, event) => event.detected_at < earliest ? event.detected_at : earliest,
    events[0].detected_at,
  )
  const { data: follows, error: followsError } = await admin
    .from('user_bar_follows')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('notify_new_taps', true)
    .lte('created_at', earliestDetectedAt)
  if (followsError) throw followsError

  const userIds = (follows ?? []).map((follow) => follow.user_id)
  if (userIds.length === 0) {
    await completeBatchWithoutDeliveries(admin, batchId)
    return
  }
  const { data: devices, error: devicesError } = await admin
    .from('user_push_devices')
    .select('id, user_id, expo_push_token')
    .in('user_id', userIds)
    .eq('platform', 'ios')
    .eq('enabled', true)
  if (devicesError) throw devicesError

  const barName = tenant.display_name?.trim() || tenant.name
  const singleDrink = validDrinks.length === 1 ? validDrinks[0] : null
  const drinkNames = validDrinks.map((drink) => drink.display_name?.trim() || drink.name)
  const title = singleDrink
    ? `${barName} 上新 · ${singleDrink.display_name?.trim() || singleDrink.name}`
    : `${barName} 今晚上新 ${validDrinks.length} 款`
  const body = singleDrink
    ? '今晚酒单有了新选择，点按查看这款酒。'
    : validDrinks.length === 2
      ? `${drinkNames.map((name) => compactDrinkName(name)).join('、')} 已加入今晚酒单。`
      : `${drinkNames.slice(0, 2).map((name) => compactDrinkName(name)).join('、')} 等新酒已加入今晚酒单，点按查看。`
  const payload = {
    type: 'new_tap',
    tenantSlug: tenant.slug,
    drinkId: singleDrink?.id ?? null,
    batchId,
  }

  const deliveries = (devices ?? []).map((device) => ({
    batch_id: batchId,
    device_id: device.id,
    user_id: device.user_id,
    expo_push_token: device.expo_push_token,
    title,
    body,
    payload,
  }))
  if (deliveries.length > 0) {
    const { error } = await admin.from('new_tap_push_deliveries').insert(deliveries)
    if (error) throw error
  }
  await admin.from('new_tap_notification_events').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('batch_id', batchId)
  if (deliveries.length === 0) await completeBatchWithoutDeliveries(admin, batchId)
}

async function sendPendingDeliveries(admin: ReturnType<typeof createClient>, expoAccessToken: string) {
  const { data, error } = await admin.rpc('claim_pending_push_deliveries', { p_limit: 500 })
  if (error) throw error
  const deliveries = (data ?? []) as Delivery[]
  const touchedBatchIds = new Set(deliveries.map((delivery) => delivery.batch_id))

  let ticketed = 0
  for (const group of chunks(deliveries, 100)) {
    const expoResponse = await fetch(expoSendUrl, {
      method: 'POST',
      headers: { ...jsonHeaders, Authorization: `Bearer ${expoAccessToken}` },
      body: JSON.stringify(group.map((delivery) => ({
        to: delivery.expo_push_token,
        title: delivery.title,
        body: delivery.body,
        sound: 'default',
        priority: 'default',
        data: delivery.payload,
      }))),
    })
    if (!expoResponse.ok) {
      await Promise.all(group.map((delivery) => scheduleRetry(admin, delivery, `HTTP_${expoResponse.status}`)))
      continue
    }
    const result = await expoResponse.json() as { data?: Array<{ status: string; id?: string; details?: { error?: string }; message?: string }> }
    await Promise.all(group.map(async (delivery, index) => {
      const ticket = result.data?.[index]
      if (ticket?.status === 'ok' && ticket.id) {
        ticketed += 1
        await admin.from('new_tap_push_deliveries').update({
          status: 'ticketed', expo_ticket_id: ticket.id,
          attempt_count: delivery.attempt_count + 1, updated_at: new Date().toISOString(),
        }).eq('id', delivery.id)
      } else if (ticket?.details?.error === 'DeviceNotRegistered') {
        await disableDevice(admin, delivery)
      } else {
        await scheduleRetry(admin, delivery, ticket?.details?.error ?? ticket?.message ?? 'EXPO_TICKET_ERROR')
      }
    }))
  }
  await Promise.all([...touchedBatchIds].map((batchId) => refreshBatchStatus(admin, batchId)))
  return ticketed
}

async function checkReceipts(admin: ReturnType<typeof createClient>, expoAccessToken: string) {
  const receiptCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { data, error } = await admin
    .from('new_tap_push_deliveries')
    .select('id, batch_id, device_id, expo_push_token, title, body, payload, attempt_count, expo_ticket_id')
    .eq('status', 'ticketed')
    .lte('updated_at', receiptCutoff)
    .limit(1000)
  if (error) throw error
  const deliveries = data ?? []
  if (deliveries.length === 0) return 0

  const receiptResponse = await fetch(expoReceiptsUrl, {
    method: 'POST',
    headers: { ...jsonHeaders, Authorization: `Bearer ${expoAccessToken}` },
    body: JSON.stringify({ ids: deliveries.map((delivery) => delivery.expo_ticket_id) }),
  })
  if (!receiptResponse.ok) return 0
  const result = await receiptResponse.json() as { data?: Record<string, { status: string; details?: { error?: string }; message?: string }> }
  let completed = 0
  await Promise.all(deliveries.map(async (delivery) => {
    const receipt = delivery.expo_ticket_id ? result.data?.[delivery.expo_ticket_id] : null
    if (!receipt) return
    if (receipt.status === 'ok') {
      completed += 1
      await admin.from('new_tap_push_deliveries').update({ status: 'delivered', updated_at: new Date().toISOString() }).eq('id', delivery.id)
    } else if (receipt.details?.error === 'DeviceNotRegistered') {
      await disableDevice(admin, delivery as Delivery)
    } else {
      await admin.from('new_tap_push_deliveries').update({
        status: 'failed', error_code: receipt.details?.error ?? 'EXPO_RECEIPT_ERROR',
        error_message: receipt.message ?? null, updated_at: new Date().toISOString(),
      }).eq('id', delivery.id)
    }
  }))
  await Promise.all([...new Set(deliveries.map((delivery) => delivery.batch_id))]
    .map((batchId) => refreshBatchStatus(admin, batchId)))
  return completed
}

async function scheduleRetry(admin: ReturnType<typeof createClient>, delivery: Delivery, code: string) {
  const attempts = delivery.attempt_count + 1
  const terminal = attempts >= 4
  const delayMinutes = Math.min(5 * 2 ** Math.max(0, attempts - 1), 60)
  await admin.from('new_tap_push_deliveries').update({
    status: terminal ? 'failed' : 'retry', attempt_count: attempts, error_code: code,
    next_attempt_at: new Date(Date.now() + delayMinutes * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', delivery.id)
}

async function disableDevice(admin: ReturnType<typeof createClient>, delivery: Delivery) {
  await admin.from('new_tap_push_deliveries').update({
    status: 'device_unregistered', error_code: 'DeviceNotRegistered', updated_at: new Date().toISOString(),
  }).eq('id', delivery.id)
  if (delivery.device_id) {
    await admin.from('user_push_devices').update({ enabled: false, updated_at: new Date().toISOString() }).eq('id', delivery.device_id)
  }
}

async function cancelBatch(admin: ReturnType<typeof createClient>, batchId: string) {
  await Promise.all([
    admin.from('new_tap_notification_events').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('batch_id', batchId),
    admin.from('new_tap_push_batches').update({ status: 'cancelled', completed_at: new Date().toISOString() }).eq('id', batchId),
  ])
}

async function completeBatchWithoutDeliveries(admin: ReturnType<typeof createClient>, batchId: string) {
  await Promise.all([
    admin.from('new_tap_notification_events').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('batch_id', batchId),
    admin.from('new_tap_push_batches').update({ status: 'sent', completed_at: new Date().toISOString() }).eq('id', batchId),
  ])
}

async function refreshBatchStatus(admin: ReturnType<typeof createClient>, batchId: string) {
  const { data, error } = await admin
    .from('new_tap_push_deliveries')
    .select('status')
    .eq('batch_id', batchId)
  if (error || !data || data.length === 0) return
  const statuses = data.map((delivery) => delivery.status)
  const hasPending = statuses.some((status) => status === 'pending' || status === 'sending' || status === 'retry')
  const hasAccepted = statuses.some((status) => status === 'ticketed' || status === 'delivered')
  const allTerminalFailures = statuses.every((status) => status === 'failed' || status === 'device_unregistered')
  const status = hasPending ? 'partial' : allTerminalFailures ? 'failed' : hasAccepted ? 'sent' : 'partial'
  await admin.from('new_tap_push_batches').update({
    status,
    completed_at: hasPending ? null : new Date().toISOString(),
  }).eq('id', batchId)
}

async function releaseBatch(admin: ReturnType<typeof createClient>, batchId: string) {
  await Promise.all([
    admin.from('new_tap_notification_events').update({
      status: 'pending', batch_id: null,
      ready_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('batch_id', batchId),
    admin.from('new_tap_push_batches').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('id', batchId),
  ])
}
