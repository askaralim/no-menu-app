import { View, Text, StyleSheet, Alert, Linking } from 'react-native'
import Constants from 'expo-constants'
import { useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../lib/authProvider'
import { THEME, SPACING } from '../../../lib/theme'
import { Screen, Card, Button, SectionLabel } from '../../../components/ui'
import { HouseSubheader } from '../../../components/house/HouseSubheader'

function roleLabel(r: string): string {
  switch (r) {
    case 'owner':
      return '店主'
    case 'staff':
      return '员工'
    case 'super_admin':
      return '超级管理员'
    default:
      return r
  }
}

function formatPhone(raw: string | undefined | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`
  }
  if (digits.length === 13 && digits.startsWith('86')) {
    const local = digits.slice(2)
    return `${local.slice(0, 3)} ${local.slice(3, 7)} ${local.slice(7)}`
  }
  return raw
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  )
}

export default function HouseAccountScreen() {
  const router = useRouter()
  const { role, user, tenantId, memberships } = useAuth()
  const tenant = memberships.find((m) => m.tenant_id === tenantId) ?? null

  const phone =
    formatPhone(user?.phone) ||
    formatPhone((user?.user_metadata as { phone?: string } | undefined)?.phone) ||
    formatPhone((user?.user_metadata as { mobile?: string } | undefined)?.mobile)
  const email = user?.email?.trim() || null
  const displayName =
    (user?.user_metadata as { full_name?: string; name?: string } | undefined)?.full_name ||
    (user?.user_metadata as { name?: string } | undefined)?.name ||
    null

  const handleLogout = () => {
    Alert.alert('确认', '确定要退出登录吗？', [
      { text: '取消', style: 'cancel' },
      { text: '退出', style: 'destructive', onPress: () => void supabase.auth.signOut() },
    ])
  }

  return (
    <Screen scroll>
      <HouseSubheader title="账户" />

      <SectionLabel>账号信息</SectionLabel>
      <Card>
        <InfoRow label="门店" value={tenant?.display_name || tenant?.name || '—'} />
        <View style={styles.divider} />
        <InfoRow label="角色" value={roleLabel(role || 'staff')} />
        {displayName ? (
          <>
            <View style={styles.divider} />
            <InfoRow label="姓名" value={displayName} />
          </>
        ) : null}
        {phone ? (
          <>
            <View style={styles.divider} />
            <InfoRow label="手机号" value={phone} />
          </>
        ) : null}
        {email ? (
          <>
            <View style={styles.divider} />
            <InfoRow label="邮箱" value={email} />
          </>
        ) : null}
        {!phone && !email ? (
          <>
            <View style={styles.divider} />
            <Text style={styles.hint}>未绑定手机号或邮箱</Text>
          </>
        ) : null}
      </Card>

      <SectionLabel>安全</SectionLabel>
      <View style={{ gap: SPACING.md }}>
        <Button
          label="修改密码"
          variant="secondary"
          icon="key-outline"
          onPress={() => router.push('/(tabs)/house/change-password')}
        />
        <Button label="退出登录" variant="danger" icon="log-out-outline" onPress={handleLogout} />
      </View>

      <SectionLabel>支持与法律</SectionLabel>
      <View style={{ gap: SPACING.md }}>
        <Button label="支持中心" variant="secondary" icon="help-circle-outline" onPress={() => void Linking.openURL('https://nomenuapp.com/support')} />
        <Button label="隐私政策" variant="secondary" icon="shield-checkmark-outline" onPress={() => void Linking.openURL('https://nomenuapp.com/privacy')} />
        <Button label="服务条款" variant="secondary" icon="document-text-outline" onPress={() => void Linking.openURL('https://nomenuapp.com/terms')} />
        <Button label="申请删除账号" variant="danger" icon="trash-outline" onPress={() => router.push('/(tabs)/house/account-deletion')} />
      </View>

      <Text style={styles.version}>
        No Menu Tonight {Constants.expoConfig?.version || '1.0.0'} ({Constants.expoConfig?.ios?.buildNumber || '—'})
      </Text>
    </Screen>
  )
}

const styles = StyleSheet.create({
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    paddingVertical: 2,
  },
  infoLabel: { width: 64, color: THEME.muted, fontSize: 14, paddingTop: 1 },
  infoValue: { flex: 1, color: THEME.text, fontSize: 15, fontWeight: '600' },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: THEME.borderFaint,
    marginVertical: SPACING.md,
  },
  hint: { color: THEME.faint, fontSize: 13 },
  version: { color: THEME.faint, fontSize: 12, textAlign: 'center', marginTop: SPACING.xl },
})
