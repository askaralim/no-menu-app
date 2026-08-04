import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { THEME, SPACING } from '../../lib/theme'

export function HouseSubheader({ title }: { title: string }) {
  const router = useRouter()
  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={() => router.back()} style={styles.back} hitSlop={12}>
        <Ionicons name="chevron-back" size={22} color={THEME.gold} />
      </TouchableOpacity>
      <Text style={styles.title}>{title}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  back: { paddingVertical: 4, marginLeft: -4 },
  title: { flex: 1, color: THEME.gold, fontSize: 28, fontWeight: '800' },
})
