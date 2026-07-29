import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'
import { Platform } from 'react-native'

import { getTaplistSupabase } from '@/lib/supabase'
import type { AccountProtectionState } from '@/lib/types'

export async function ensureDrinkLogSession() {
  const client = getTaplistSupabase()
  const { data: sessionData, error: sessionError } = await client.auth.getSession()
  if (sessionError) throw sessionError
  if (sessionData.session) return sessionData.session

  const { data, error } = await client.auth.signInAnonymously()
  if (error) throw error
  if (!data.session) throw new Error('Anonymous session was not created')
  return data.session
}

export async function getAccountProtectionState(): Promise<AccountProtectionState> {
  if (Platform.OS !== 'ios' || !(await AppleAuthentication.isAvailableAsync())) {
    return 'unavailable'
  }
  const { data, error } = await getTaplistSupabase().auth.getUser()
  if (error || !data.user) return 'anonymous'
  return data.user.identities?.some((identity) => identity.provider === 'apple')
    ? 'apple'
    : 'anonymous'
}

export async function protectDrinkLogWithApple() {
  if (Platform.OS !== 'ios' || !(await AppleAuthentication.isAvailableAsync())) {
    throw new Error('APPLE_UNAVAILABLE')
  }
  const anonymousSession = await ensureDrinkLogSession()

  const rawNonce = Crypto.randomUUID()
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  )
  const credential = await AppleAuthentication.signInAsync({
    nonce: hashedNonce,
  })
  if (!credential.identityToken) throw new Error('APPLE_TOKEN_MISSING')

  const client = getTaplistSupabase()
  const { data, error } = await client.auth.linkIdentity({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  })
  if (!error) return data

  const { data: appleData, error: appleError } = await client.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  })
  if (appleError || !appleData.session) throw appleError ?? error
  const { data: mergeData, error: mergeError } = await client.functions.invoke('merge-apple-account', {
    body: { anonymousAccessToken: anonymousSession.access_token },
  })
  if (mergeError || !mergeData?.ok) throw mergeError ?? new Error('APPLE_MERGE_FAILED')
  return appleData
}

export async function deleteDrinkLogAccount() {
  const client = getTaplistSupabase()
  const { data: userData, error: userError } = await client.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('ACCOUNT_NOT_FOUND')

  const usesApple = userData.user.identities?.some((identity) => identity.provider === 'apple')
  let appleAuthorizationCode: string | undefined
  if (usesApple) {
    if (Platform.OS !== 'ios' || !(await AppleAuthentication.isAvailableAsync())) {
      throw new Error('APPLE_UNAVAILABLE')
    }
    const credential = await AppleAuthentication.signInAsync()
    if (!credential.authorizationCode) throw new Error('APPLE_AUTHORIZATION_CODE_MISSING')
    appleAuthorizationCode = credential.authorizationCode
  }

  const { data, error } = await client.functions.invoke('delete-my-account', {
    body: { appleAuthorizationCode },
  })
  if (error || !data?.ok) throw error ?? new Error('ACCOUNT_DELETE_FAILED')
  await client.auth.signOut({ scope: 'local' })
}

export function isAppleCancellation(error: unknown) {
  return (
    error instanceof Error &&
    ('code' in error ? error.code === 'ERR_REQUEST_CANCELED' : error.message.includes('canceled'))
  )
}
