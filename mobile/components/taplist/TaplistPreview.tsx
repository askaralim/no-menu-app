import { Modal, View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { TAPLIST_THEME as T, statusVisual } from '../../lib/taplistTheme'
import type { TaplistDraft } from '../../lib/taplistOwnerApi'

interface Props {
  visible: boolean
  draft: TaplistDraft | null
  onClose: () => void
}

/**
 * Client-side approximation of the public Tap List, rendered purely from the
 * local draft (no public RPC calls). Shows only what a guest would see.
 */
export default function TaplistPreview({ visible, draft, onClose }: Props) {
  if (!draft) return null

  const visibleCategoryIds = new Set(
    draft.categories.filter((c) => c.is_public_visible && c.enabled).map((c) => c.id),
  )

  const onTonight = draft.drinks
    .filter((d) => d.enabled && d.is_public_visible)
    .filter((d) => typeof d.public_sort_order === 'number' && d.public_sort_order >= 1)
    .filter((d) => d.category_id == null || visibleCategoryIds.has(d.category_id))

  const mainDrinks = onTonight
    .filter((d) => d.public_status !== 'sold_out' && d.public_status !== 'coming_soon')
    .sort((a, b) => (a.public_sort_order ?? 0) - (b.public_sort_order ?? 0))
  const comingSoon = onTonight
    .filter((d) => d.public_status === 'coming_soon')
    .sort((a, b) => (a.public_sort_order ?? 0) - (b.public_sort_order ?? 0))
  const recentlySoldOut = onTonight
    .filter((d) => d.public_status === 'sold_out')
    .sort((a, b) => (a.public_sort_order ?? 0) - (b.public_sort_order ?? 0))

  const showPrices = (draft.tenant.public_price_mode ?? 'hide') === 'show'

  const renderDrink = (d: (typeof onTonight)[number], dimmed?: boolean) => {
    const vis = statusVisual(d.public_status)
    const servings = d.servings
      .filter((s) => !s._deleted && s.is_active)
      .sort((a, b) => a.public_sort_order - b.public_sort_order)
    return (
      <View key={d.id} style={[styles.card, dimmed && { opacity: 0.55 }]}>
        {typeof d.public_sort_order === 'number' && d.public_sort_order > 0 ? (
          <View style={styles.tapBadge}>
            <Text style={styles.tapBadgeText}>#{d.public_sort_order}</Text>
          </View>
        ) : null}
        {d.image_url ? <Image source={{ uri: d.image_url }} style={styles.cardImage} /> : null}
        <View style={{ flex: 1 }}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.drinkName} numberOfLines={2}>
              {d.display_name || d.name}
            </Text>
            <View style={[styles.statusChip, { backgroundColor: vis.bg, borderColor: vis.border }]}>
              <Text style={[styles.statusChipText, { color: vis.fg }]}>{vis.label}</Text>
            </View>
          </View>
          {d.profile.brewery || d.profile.beer_style ? (
            <Text style={styles.meta} numberOfLines={1}>
              {[d.profile.brewery, d.profile.beer_style, d.profile.abv ? `${d.profile.abv}%` : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
          {showPrices && servings.length > 0 ? (
            <View style={styles.servingRow}>
              {servings
                .filter((s) => Number(s.price) > 0)
                .map((s) => (
                  <Text key={s.id || s.client_id} style={styles.serving}>
                    {s.label}
                    {s.volume_ml ? ` ${s.volume_ml}ml` : ''} ¥{s.price}
                  </Text>
                ))}
            </View>
          ) : null}
        </View>
      </View>
    )
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerEyebrow}>No Menu 实时酒单</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={26} color={T.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
          <Text style={styles.barName}>{draft.tenant.display_name || draft.tenant.name}</Text>
          <Text style={styles.count}>酒单 {mainDrinks.length} 款</Text>
          <Text style={styles.priceModeHint}>
            {showPrices ? '价格展示：已开启' : '价格展示：已隐藏（与顾客端一致）'}
          </Text>

          {!draft.tenant.is_public_visible ? (
            <View style={styles.offlineBanner}>
              <Ionicons name="eye-off-outline" size={16} color={T.muted} />
              <Text style={styles.offlineText}>酒单当前未上线，顾客暂时看不到。</Text>
            </View>
          ) : null}

          {mainDrinks.length === 0 && comingSoon.length === 0 && recentlySoldOut.length === 0 ? (
            <Text style={styles.empty}>还没有公开的酒款。</Text>
          ) : (
            <>
              {mainDrinks.map((d) => renderDrink(d))}
              {comingSoon.length > 0 ? (
                <>
                  <Text style={styles.sectionTitle}>即将上枪 {comingSoon.length}</Text>
                  {comingSoon.map((d) => renderDrink(d))}
                </>
              ) : null}
              {recentlySoldOut.length > 0 ? (
                <>
                  <Text style={styles.sectionTitle}>刚售罄 {recentlySoldOut.length}</Text>
                  {recentlySoldOut.map((d) => renderDrink(d, true))}
                </>
              ) : null}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: T.borderFaint,
  },
  headerEyebrow: { color: T.goldSoft, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase' },
  barName: { color: T.text, fontSize: 26, fontWeight: '800', letterSpacing: 0.5 },
  count: { color: T.muted, fontSize: 14, marginTop: 4 },
  priceModeHint: { color: T.faint, fontSize: 12, marginTop: 4, marginBottom: 20 },
  sectionTitle: {
    color: T.goldSoft,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 10,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: T.surfaceMuted,
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: T.border,
  },
  offlineText: { color: T.muted, fontSize: 13, flex: 1 },
  empty: { color: T.faint, fontSize: 15, marginTop: 40, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: T.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: T.borderFaint,
    alignItems: 'flex-start',
  },
  tapBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: T.goldFill,
    borderWidth: 1,
    borderColor: T.goldBorder,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  tapBadgeText: { color: T.gold, fontSize: 14, fontWeight: '800' },
  cardImage: { width: 64, height: 64, borderRadius: 8, backgroundColor: T.surfaceMuted },
  cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  drinkName: { color: T.text, fontSize: 17, fontWeight: '700', flex: 1 },
  statusChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, borderWidth: 1 },
  statusChipText: { fontSize: 12, fontWeight: '600' },
  meta: { color: T.muted, fontSize: 13, marginTop: 4 },
  servingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  serving: { color: T.goldSoft, fontSize: 13, fontWeight: '600' },
})
