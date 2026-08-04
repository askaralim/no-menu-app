import { supabase } from './supabase'

export type AccountDeletionRequest = {
  id: string
  request_number: string
  status: 'pending' | 'in_progress' | 'resolved' | 'closed'
  created_at: string
  updated_at?: string
  existing?: boolean
}

export async function getMyAccountDeletionRequest(): Promise<AccountDeletionRequest | null> {
  const { data, error } = await supabase.rpc('get_my_account_deletion_request')
  if (error) throw new Error(error.message || '无法加载删除申请')
  if (!data || typeof data !== 'object') return null
  return data as AccountDeletionRequest
}

export async function requestMyAccountDeletion(
  tenantId: string | null,
  message?: string,
): Promise<AccountDeletionRequest> {
  const { data, error } = await supabase.rpc('request_my_account_deletion', {
    p_tenant_id: tenantId,
    p_message: message?.trim() || null,
  })
  if (error) throw new Error(error.message || '无法提交删除申请')
  const result = data as ({ ok?: boolean } & AccountDeletionRequest) | null
  if (!result?.ok || !result.id) throw new Error('删除申请返回异常')
  return result
}

