import type { SupabaseClient } from '@supabase/supabase-js'

export const PLATFORM_SLUG = '__platform__'

type UserRoleRow = { role: string; tenant_id: string }

/**
 * Resolve tenant for POS admin pages (categories, drinks, settings, orders).
 * Prefers owner, then staff. Ignores super_admin (concierge uses platform / taplist).
 */
export async function resolvePosAdminTenantId(
  supabase: SupabaseClient
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: roles, error } = await supabase
    .from('user_roles')
    .select('role, tenant_id')
    .eq('user_id', user.id)

  if (error) {
    console.error('resolvePosAdminTenantId:', error)
    return null
  }

  const list = (roles ?? []) as UserRoleRow[]
  const owner = list.find((r) => r.role === 'owner')
  if (owner?.tenant_id) return owner.tenant_id

  const staff = list.find((r) => r.role === 'staff')
  if (staff?.tenant_id) return staff.tenant_id

  return null
}
