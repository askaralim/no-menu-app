import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { COLORS } from '../../lib/constants'

export default function NoAccessScreen() {
  const router = useRouter()

  const signOut = async () => {
    await supabase.auth.signOut()
    router.replace('/(auth)/login')
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>暂无门店权限</Text>
      <Text style={styles.sub}>
        当前账号尚未绑定门店。若店主已发给你「手机号 + 初始密码 + 邀请码」，点下方一次加入；店主账号请联系 No Menu 开通。
      </Text>

      <TouchableOpacity
        style={styles.primary}
        onPress={() => router.push('/(auth)/accept-invite')}
      >
        <Text style={styles.primaryText}>我有邀请码</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondary} onPress={signOut}>
        <Text style={styles.secondaryText}>重新登录</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.support}
        onPress={() => void Linking.openURL('https://nomenuapp.com/support?topic=bar_onboarding')}
      >
        <Text style={styles.supportText}>申请门店开通 / 联系支持</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    padding: 28,
  },
  title: { color: COLORS.gold, fontSize: 26, fontWeight: '800', marginBottom: 12 },
  sub: { color: COLORS.muted, fontSize: 15, lineHeight: 22, marginBottom: 28 },
  primary: {
    backgroundColor: COLORS.gold,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryText: { color: '#000', fontSize: 16, fontWeight: '700' },
  secondary: {
    marginTop: 14,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  support: { marginTop: 20, alignItems: 'center', paddingVertical: 8 },
  supportText: { color: COLORS.gold, fontSize: 14, textDecorationLine: 'underline' },
})
