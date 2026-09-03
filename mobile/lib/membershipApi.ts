import { supabase } from './supabase'
import type { UserRole } from './types'

export type MyTenant = {
  tenant_id: string
  name: string
  display_name: string | null
  slug: string
  role: UserRole
  status: string
  onboarding_status: string
  is_public_visible: boolean
  // Added by ordering_enabled migration. Undefined on older backends;
  // clients treat undefined as enabled until the column ships, then only
  // true shows 开台/订单 (opt-in).
  ordering_enabled?: boolean
}

export type CreateInviteResult = {
  ok: boolean
  invite_id?: string
  raw_token?: string
  expires_at?: string
  role?: string
  email?: string | null
  mobile?: string | null
  account_created?: boolean
  temporary_password?: string | null
  login_email?: string | null
}

export type AcceptInviteResult = {
  ok: boolean
  tenant_id?: string
  role?: UserRole
  tenant_name?: string
}

function translate(message: string): string {
  const m = message || ''
  if (m.includes('Invalid invite')) return '邀请码无效'
  if (m.includes('expired')) return '邀请码已过期，请联系管理员重新发送'
  if (m.includes('revoked')) return '邀请码已作废'
  if (m.includes('already used')) return '邀请码已被使用'
  if (m.includes('Invite email does not match')) return '邀请邮箱与当前登录账号不一致'
  if (m.includes('Invite mobile does not match')) return '邀请手机号与当前登录账号不一致'
  if (m.includes('Invalid China mobile')) return '请输入有效的中国大陆手机号'
  if (m.includes('already has an owner')) return '该门店已有店主'
  if (m.includes('Only super_admin')) return '仅平台管理员可操作店主邀请'
  if (m.includes('Only owner')) return '仅店主可邀请员工'
  if (m.includes('Forbidden')) return '没有权限'
  if (m.includes('Not authenticated')) return '请先登录'
  if (m.includes('Tenant is not active')) return '该门店已停用'
  if (m.includes('Tenant not found')) return '未找到门店'
  return m
}

export async function ensureUserProfile(): Promise<void> {
  const { error } = await supabase.rpc('ensure_user_profile')
  if (error) throw new Error(translate(error.message))
}

export async function getMyTenants(): Promise<MyTenant[]> {
  const { data, error } = await supabase.rpc('get_my_tenants')
  if (error) throw new Error(translate(error.message))
  return (data as MyTenant[]) ?? []
}

export async function setActiveTenant(tenantId: string): Promise<void> {
  const { error } = await supabase.rpc('set_active_tenant', { p_tenant_id: tenantId })
  if (!error) return
  const raw = error.message || ''
  if (raw.includes('Could not find the function')) {
    throw new Error('后台尚未开通切店，请先更新后再试')
  }
  throw new Error(translate(raw))
}

export async function createTenantInvite(input: {
  tenantId: string
  contactType: 'email' | 'mobile'
  email?: string | null
  mobile?: string | null
  role: 'owner' | 'staff'
}): Promise<CreateInviteResult> {
  const { data, error } = await supabase.rpc('create_tenant_invite', {
    p_tenant_id: input.tenantId,
    p_contact_type: input.contactType,
    p_email: input.email ?? null,
    p_mobile: input.mobile ?? null,
    p_role: input.role,
  })
  if (error) throw new Error(translate(error.message))
  return data as CreateInviteResult
}

export async function acceptTenantInvite(token: string): Promise<AcceptInviteResult> {
  const { data, error } = await supabase.rpc('accept_tenant_invite', {
    p_token: token.trim(),
  })
  if (error) throw new Error(translate(error.message))
  return data as AcceptInviteResult
}

export async function revokeTenantInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_tenant_invite', { p_invite_id: inviteId })
  if (error) throw new Error(translate(error.message))
}

export async function listTenantInvites(tenantId: string): Promise<unknown[]> {
  const { data, error } = await supabase.rpc('list_tenant_invites', { p_tenant_id: tenantId })
  if (error) throw new Error(translate(error.message))
  return (data as unknown[]) ?? []
}
