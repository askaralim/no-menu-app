import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../lib/authProvider'
import { COLORS } from '../../lib/constants'

function roleLabel(role: string) {
  if (role === 'owner') return '店主'
  if (role === 'super_admin') return '管理员'
  return '店员'
}

export default function SelectTenantScreen() {
  const router = useRouter()
  const { memberships, setActiveTenantId } = useAuth()

  const choose = async (tenantId: string) => {
    await setActiveTenantId(tenantId)
    router.replace('/(tabs)/taplist')
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>选择门店</Text>
      <Text style={styles.sub}>你的账号绑定了多家门店，请选择要进入的一家。</Text>

      <FlatList
        data={memberships}
        keyExtractor={(item) => item.tenant_id}
        contentContainerStyle={{ paddingTop: 8 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => void choose(item.tenant_id)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.display_name || item.name}</Text>
              <Text style={styles.meta}>
                {roleLabel(item.role)}
                {item.is_public_visible ? ' · 公开展示中' : ' · 未公开'}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>暂无门店</Text>}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 24, paddingTop: 72 },
  title: { color: COLORS.gold, fontSize: 28, fontWeight: '800' },
  sub: { color: COLORS.muted, fontSize: 14, marginTop: 8, marginBottom: 16, lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  name: { color: COLORS.text, fontSize: 17, fontWeight: '700' },
  meta: { color: COLORS.muted, fontSize: 13, marginTop: 4 },
  chevron: { color: COLORS.gold, fontSize: 28, fontWeight: '300' },
  empty: { color: COLORS.muted, textAlign: 'center', marginTop: 40 },
})
