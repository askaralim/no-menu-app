import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useRouter } from 'expo-router'
import { useAuth } from '../../../lib/authProvider'
import { THEME, SPACING, RADIUS } from '../../../lib/theme'
import { Screen, Title, SectionLabel, Card } from '../../../components/ui'
import {
  getTenantPublicPriceMode,
  getTenantPublishReadiness,
  setTenantPublicPriceMode,
  setTenantPublicVisibility,
  type PublicPriceMode,
} from '../../../lib/taplistOwnerApi'
import { listBarEvents, summarizeEvents } from '../../../lib/barEventsApi'

type HubItem = {
  key: string
  label: string
  icon: keyof typeof Ionicons.glyphMap
  href: string
  sub?: string
}

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

export default function HouseHubScreen() {
  const router = useRouter()
  const { tenantId, role, memberships, refreshMembership } = useAuth()
  const tenant = memberships.find((m) => m.tenant_id === tenantId) ?? null

  const [priceMode, setPriceMode] = useState<PublicPriceMode>('hide')
  const [priceModeLoading, setPriceModeLoading] = useState(false)
  const [priceModeBusy, setPriceModeBusy] = useState(false)
  const [publicVisible, setPublicVisible] = useState(false)
  const [publicBusy, setPublicBusy] = useState(false)
  const [eventSummary, setEventSummary] = useState<{ showing: number; draft: number } | null>(null)

  useEffect(() => {
    setPublicVisible(!!tenant?.is_public_visible)
  }, [tenant?.is_public_visible])

  const fetchPriceMode = useCallback(async () => {
    if (!tenantId) return
    setPriceModeLoading(true)
    try {
      setPriceMode(await getTenantPublicPriceMode(tenantId))
    } catch {
      /* keep default */
    } finally {
      setPriceModeLoading(false)
    }
  }, [tenantId])

  const fetchEventSummary = useCallback(async () => {
    if (!tenantId) {
      setEventSummary(null)
      return
    }
    try {
      const rows = await listBarEvents(tenantId)
      setEventSummary(summarizeEvents(rows))
    } catch {
      setEventSummary(null)
    }
  }, [tenantId])

  useEffect(() => {
    void fetchPriceMode()
  }, [fetchPriceMode])

  useFocusEffect(
    useCallback(() => {
      void fetchEventSummary()
    }, [fetchEventSummary]),
  )

  const applyGoLive = async (v: boolean) => {
    if (!tenantId || publicBusy) return
    setPublicBusy(true)
    const prev = publicVisible
    setPublicVisible(v)
    try {
      await setTenantPublicVisibility(tenantId, v)
      await refreshMembership()
    } catch (e: any) {
      setPublicVisible(prev)
      Alert.alert(v ? '无法发布' : '操作失败', e?.message || '请重试')
    } finally {
      setPublicBusy(false)
    }
  }

  const toggleGoLive = async (v: boolean) => {
    if (!tenantId) return
    if (v) {
      try {
        const ready = await getTenantPublishReadiness(tenantId)
        if (!ready.ok) {
          Alert.alert(
            '尚未满足公开展示条件',
            ready.errors.slice(0, 6).join('\n') || '请完善门店资料与酒单',
          )
          return
        }
      } catch (e: any) {
        Alert.alert('检查失败', e?.message || '请重试')
        return
      }
      Alert.alert(
        '确认发布？',
        '发布后，公开网页、门店二维码和 No Menu 将同步展示你的门店与酒单。',
        [
          { text: '取消', style: 'cancel' },
          { text: '确认发布', onPress: () => void applyGoLive(true) },
        ],
      )
      return
    }
    Alert.alert('确认下线？', '下线后公开网页、门店二维码和 No Menu 将不再展示该门店。', [
      { text: '取消', style: 'cancel' },
      { text: '确认下线', style: 'destructive', onPress: () => void applyGoLive(false) },
    ])
  }

  const applyPriceMode = async (mode: PublicPriceMode) => {
    if (!tenantId || mode === priceMode || priceModeBusy) return
    setPriceModeBusy(true)
    const prev = priceMode
    setPriceMode(mode)
    try {
      setPriceMode(await setTenantPublicPriceMode(tenantId, mode))
    } catch (e: any) {
      setPriceMode(prev)
      Alert.alert('无法更新', e?.message || '请重试')
    } finally {
      setPriceModeBusy(false)
    }
  }

  const handlePriceModeChange = (mode: PublicPriceMode) => {
    if (mode === priceMode) return
    if (mode === 'show') {
      Alert.alert('展示价格？', '开启后顾客将看到杯型与价格。', [
        { text: '取消', style: 'cancel' },
        { text: '确认展示', onPress: () => void applyPriceMode('show') },
      ])
      return
    }
    Alert.alert('隐藏价格？', '顾客端将不展示杯型与价格。', [
      { text: '取消', style: 'cancel' },
      { text: '确认隐藏', onPress: () => void applyPriceMode('hide') },
    ])
  }

  const eventSub =
    eventSummary == null
      ? '店庆、DJ、酒厂活动'
      : eventSummary.showing + eventSummary.draft === 0
        ? '暂无活动'
        : `展示中 ${eventSummary.showing} · 未公开 ${eventSummary.draft}`

  const hubItems: HubItem[] = [
    { key: 'profile', label: '基本信息', icon: 'information-circle-outline', href: '/(tabs)/house/profile' },
    {
      key: 'qr',
      label: '二维码 & 酒单链接',
      icon: 'qr-code-outline',
      href: '/(tabs)/house/qr',
    },
    { key: 'events', label: '活动', icon: 'calendar-outline', href: '/(tabs)/house/events', sub: eventSub },
    { key: 'more', label: '经营数据', icon: 'bar-chart-outline', href: '/(tabs)/house/more' },
    ...(role === 'owner' || role === 'super_admin'
      ? [{ key: 'staff', label: '员工', icon: 'people-outline' as const, href: '/(tabs)/house/staff' }]
      : []),
    { key: 'account', label: '账户', icon: 'person-outline', href: '/(tabs)/house/account' },
  ]

  return (
    <Screen scroll>
      <Title>{tenant?.display_name || tenant?.name || '我的门店'}</Title>

      {!publicVisible ? (
        <View style={styles.warnBanner}>
          <Ionicons name="warning-outline" size={18} color={THEME.gold} />
          <Text style={styles.warnText}>门店尚未发布，公开网页与二维码暂不可用。</Text>
        </View>
      ) : null}

      <SectionLabel>公开酒单</SectionLabel>
      <Card>
        <View style={styles.settingBlock}>
          <View style={styles.settingHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkTitle}>多渠道发布</Text>
              <Text style={styles.linkSub}>
                {publicVisible
                  ? '公开网页、二维码和 No Menu 已同步展示'
                  : '一次发布，同步展示到网页、二维码和 No Menu'}
              </Text>
            </View>
            {publicBusy ? <ActivityIndicator size="small" color={THEME.gold} /> : null}
          </View>
          <View style={styles.choiceRow}>
            {(
              [
                { on: false, label: '未公开' },
                { on: true, label: '已公开' },
              ] as const
            ).map((opt) => {
              const active = publicVisible === opt.on
              return (
                <TouchableOpacity
                  key={opt.label}
                  disabled={publicBusy}
                  onPress={() => {
                    if (publicVisible === opt.on) return
                    void toggleGoLive(opt.on)
                  }}
                  style={[styles.choiceChip, active && styles.choiceChipActive]}
                >
                  <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        <View style={styles.settingDivider} />

        <View style={styles.settingBlock}>
          <View style={styles.settingHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkTitle}>价格展示</Text>
              <Text style={styles.linkSub}>
                {priceMode === 'show' ? '顾客可见杯型与价格' : '顾客看不到价格与杯型（默认）'}
              </Text>
            </View>
            {priceModeLoading || priceModeBusy ? (
              <ActivityIndicator size="small" color={THEME.gold} />
            ) : null}
          </View>
          <View style={styles.choiceRow}>
            {(
              [
                { key: 'hide' as const, label: '隐藏价格' },
                { key: 'show' as const, label: '展示价格' },
              ] as const
            ).map((opt) => {
              const active = priceMode === opt.key
              return (
                <TouchableOpacity
                  key={opt.key}
                  disabled={priceModeBusy || priceModeLoading}
                  onPress={() => handlePriceModeChange(opt.key)}
                  style={[styles.choiceChip, active && styles.choiceChipActive]}
                >
                  <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      </Card>

      <SectionLabel>快捷入口</SectionLabel>
      <View style={styles.grid}>
        {hubItems.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={styles.gridCell}
            onPress={() => router.push(item.href as any)}
            activeOpacity={0.75}
          >
            <View style={styles.gridIconWrap}>
              <Ionicons name={item.icon} size={22} color={THEME.gold} />
            </View>
            <Text style={styles.gridLabel} numberOfLines={2}>
              {item.label}
            </Text>
            {item.sub ? (
              <Text style={styles.gridSub} numberOfLines={2}>
                {item.sub}
              </Text>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.roleFooter}>
        <Ionicons name="shield-checkmark-outline" size={15} color={THEME.faint} />
        <Text style={styles.roleFooterText}>当前角色：{roleLabel(role || 'staff')}</Text>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: THEME.goldBorder,
    backgroundColor: THEME.goldFill,
  },
  warnText: { flex: 1, color: THEME.textSoft, fontSize: 13, lineHeight: 19 },
  settingBlock: { gap: SPACING.md },
  settingHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  settingDivider: {
    height: 1,
    backgroundColor: THEME.borderFaint,
    marginVertical: SPACING.lg,
  },
  linkTitle: { color: THEME.text, fontSize: 16, fontWeight: '600' },
  linkSub: { color: THEME.muted, fontSize: 13, marginTop: 2 },
  choiceRow: { flexDirection: 'row', gap: SPACING.sm },
  choiceChip: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: 'center',
  },
  choiceChipActive: {
    backgroundColor: THEME.goldFill,
    borderColor: THEME.goldBorder,
  },
  choiceChipText: { color: THEME.muted, fontSize: 14, fontWeight: '600' },
  choiceChipTextActive: { color: THEME.gold },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  gridCell: {
    width: '31%',
    flexGrow: 1,
    minWidth: '30%',
    maxWidth: '33%',
    backgroundColor: THEME.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: THEME.borderFaint,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
    gap: 6,
  },
  gridIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.goldFill,
    borderWidth: 1,
    borderColor: THEME.goldBorder,
  },
  gridLabel: {
    color: THEME.text,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
  },
  gridSub: { color: THEME.faint, fontSize: 10, textAlign: 'center', lineHeight: 13 },
  roleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xl,
  },
  roleFooterText: { color: THEME.faint, fontSize: 13 },
})
