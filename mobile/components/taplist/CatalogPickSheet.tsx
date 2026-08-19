import { useEffect, useMemo, useState } from 'react'
import {
  Modal,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { TAPLIST_THEME as T } from '../../lib/taplistTheme'
import { useAuth } from '../../lib/authProvider'
import { type DraftDrink, drinkHasOrderablePrice, isOnTonight } from '../../lib/taplistOwnerApi'

type PickTab = 'catalog' | 'archived'

interface Props {
  visible: boolean
  drinks: DraftDrink[]
  targetTapNumber?: number | null
  onClose: () => void
  onPick: (drink: DraftDrink) => void
  onCreate: () => void
}

/**
 * Pick an existing catalog drink (not on tonight) or an archived one to restore into tonight.
 */
export default function CatalogPickSheet({
  visible,
  drinks,
  targetTapNumber,
  onClose,
  onPick,
  onCreate,
}: Props) {
  const { orderingEnabled } = useAuth()
  const [tab, setTab] = useState<PickTab>('catalog')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!visible) return
    setTab('catalog')
    setQuery('')
  }, [visible, targetTapNumber])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return drinks
      .filter((d) => (tab === 'catalog' ? d.enabled : !d.enabled))
      .filter((d) => !isOnTonight(d))
      .filter((d) => {
        if (!q) return true
        const hay = `${d.brand_name || ''} ${d.profile?.brewery || ''} ${d.name} ${d.display_name || ''} ${d.profile?.beer_style || ''}`.toLowerCase()
        return hay.includes(q)
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  }, [drinks, tab, query])

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>
              {targetTapNumber ? `为 #${targetTapNumber} 选择酒款` : '从商品库选择'}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={T.muted} />
            </TouchableOpacity>
          </View>

          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, tab === 'catalog' && styles.tabActive]}
              onPress={() => setTab('catalog')}
            >
              <Text style={[styles.tabText, tab === 'catalog' && styles.tabTextActive]}>可用</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, tab === 'archived' && styles.tabActive]}
              onPress={() => setTab('archived')}
            >
              <Text style={[styles.tabText, tab === 'archived' && styles.tabTextActive]}>已下架</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={T.muted} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="搜索酒款"
              placeholderTextColor={T.faint}
              clearButtonMode="while-editing"
            />
          </View>

          <FlatList
            style={{ flex: 1 }}
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 28, flexGrow: 1 }}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {tab === 'catalog' ? '没有可加入酒单的商品' : '没有已下架商品'}
              </Text>
            }
            renderItem={({ item }) => {
              const priced = drinkHasOrderablePrice(item)
              return (
                <TouchableOpacity style={styles.row} onPress={() => onPick(item)} activeOpacity={0.8}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.display_name || item.name}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {[item.profile?.brewery, item.profile?.beer_style].filter(Boolean).join(' · ') ||
                        '未填资料'}
                      {!priced ? (orderingEnabled ? ' · 不可点单' : ' · 未设价格') : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={T.goldSoft} />
                </TouchableOpacity>
              )
            }}
          />
          <TouchableOpacity style={styles.createBtn} onPress={onCreate} activeOpacity={0.8}>
            <Ionicons name="add-circle-outline" size={18} color={T.gold} />
            <Text style={styles.createText}>找不到酒款？新增商品</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: T.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    height: '70%',
    maxHeight: '88%',
    borderTopWidth: 1,
    borderColor: T.border,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.border,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: { color: T.text, fontSize: 18, fontWeight: '800' },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
  },
  tabActive: { backgroundColor: T.goldFill, borderColor: T.goldBorder },
  tabText: { color: T.muted, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: T.gold },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: T.surfaceMuted,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  searchInput: { flex: 1, color: T.text, fontSize: 15, paddingVertical: 10 },
  empty: { color: T.faint, textAlign: 'center', marginTop: 40, fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.borderFaint,
    gap: 8,
  },
  name: { color: T.text, fontSize: 15, fontWeight: '700' },
  meta: { color: T.muted, fontSize: 12, marginTop: 3 },
  createBtn: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.border,
  },
  createText: { color: T.gold, fontSize: 15, fontWeight: '700' },
})
