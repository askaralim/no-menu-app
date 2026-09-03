import { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../../lib/authProvider'
import { THEME, SPACING, RADIUS } from '../../../lib/theme'
import { Screen } from '../../../components/ui'
import { HouseSubheader } from '../../../components/house/HouseSubheader'

function roleLabel(role: string) {
  if (role === 'owner') return '店主'
  if (role === 'super_admin') return '管理员'
  return '店员'
}

export default function SwitchTenantScreen() {
  const router = useRouter()
  const { memberships, tenantId, setActiveTenantId } = useAuth()
  const [busyId, setBusyId] = useState<string | null>(null)

  const choose = async (nextId: string) => {
    if (busyId) return
    if (nextId === tenantId) {
      router.back()
      return
    }
    setBusyId(nextId)
    try {
      await setActiveTenantId(nextId)
      router.replace('/(tabs)/taplist')
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '请重试'
      Alert.alert('无法切换门店', message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Screen scroll>
      <HouseSubheader title="切换门店" />
      <Text style={styles.sub}>不用退出登录。选一家后会进入该店酒单。</Text>

      {memberships.map((item) => {
        const active = item.tenant_id === tenantId
        const busy = busyId === item.tenant_id
        return (
          <TouchableOpacity
            key={item.tenant_id}
            style={[styles.row, active && styles.rowActive]}
            onPress={() => void choose(item.tenant_id)}
            disabled={!!busyId}
            activeOpacity={0.75}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.display_name || item.name}</Text>
              <Text style={styles.meta}>
                {roleLabel(item.role)}
                {item.is_public_visible ? ' · 公开展示中' : ' · 未公开'}
              </Text>
            </View>
            {busy ? (
              <ActivityIndicator size="small" color={THEME.gold} />
            ) : active ? (
              <Ionicons name="checkmark-circle" size={22} color={THEME.gold} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={THEME.faint} />
            )}
          </TouchableOpacity>
        )
      })}
    </Screen>
  )
}

const styles = StyleSheet.create({
  sub: {
    color: THEME.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.card,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: THEME.borderFaint,
    gap: SPACING.md,
  },
  rowActive: {
    borderColor: THEME.goldBorder,
    backgroundColor: THEME.goldFill,
  },
  name: { color: THEME.text, fontSize: 17, fontWeight: '700' },
  meta: { color: THEME.muted, fontSize: 13, marginTop: 4 },
})
