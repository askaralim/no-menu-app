import { useCallback, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useRouter } from 'expo-router'
import { useAuth } from '../../../lib/authProvider'
import { THEME, SPACING, RADIUS } from '../../../lib/theme'
import { Screen, SectionLabel, Card, Button, Loading } from '../../../components/ui'
import { HouseSubheader } from '../../../components/house/HouseSubheader'
import {
  listBarEvents,
  setBarEventPublicVisible,
  softDeleteBarEvent,
  isEvergreenEvent,
  isEventExpired,
  eventTypeLabel,
  type BarEventRow,
} from '../../../lib/barEventsApi'

function eventTimeLine(row: BarEventRow): string {
  if (isEvergreenEvent(row)) return '长期展示'
  const parts = [row.date_label, row.time_label].filter(Boolean)
  if (parts.length) return parts.join(' · ')
  return '有日期窗口'
}

export default function EventsScreen() {
  const router = useRouter()
  const { tenantId } = useAuth()
  const [rows, setRows] = useState<BarEventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!tenantId) {
      setRows([])
      setLoading(false)
      return
    }
    try {
      const data = await listBarEvents(tenantId)
      setRows(data.filter((r) => r.status !== 'cancelled'))
    } catch (e: any) {
      Alert.alert('错误', e?.message || '加载活动失败')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [tenantId])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      void load()
    }, [load]),
  )

  const showing = rows.filter((r) => r.is_public_visible && !isEventExpired(r))
  const hidden = rows.filter((r) => !r.is_public_visible || isEventExpired(r))

  const toggleVisible = (row: BarEventRow, next: boolean) => {
    if (!tenantId) return
    const title = next ? '公开此活动？' : '隐藏此活动？'
    const body = next
      ? '活动将同步展示在公开网页和 No Menu 中。'
      : '公开网页和 No Menu 将不再展示此活动。'
    Alert.alert(title, body, [
      { text: '取消', style: 'cancel' },
      {
        text: next ? '公开' : '隐藏',
        style: next ? 'default' : 'destructive',
        onPress: () => {
          void (async () => {
            setBusyId(row.id)
            try {
              await setBarEventPublicVisible(tenantId, row.id, next)
              await load()
            } catch (e: any) {
              Alert.alert('错误', e?.message || '更新失败')
            } finally {
              setBusyId(null)
            }
          })()
        },
      },
    ])
  }

  const confirmDelete = (row: BarEventRow) => {
    if (!tenantId) return
    Alert.alert('删除此活动？', '删除后列表中不再显示（可恢复需联系管理员）。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusyId(row.id)
            try {
              await softDeleteBarEvent(tenantId, row.id)
              await load()
            } catch (e: any) {
              Alert.alert('错误', e?.message || '删除失败')
            } finally {
              setBusyId(null)
            }
          })()
        },
      },
    ])
  }

  const renderRow = (row: BarEventRow, opts?: { allowDelete?: boolean }) => {
    const evergreen = isEvergreenEvent(row)
    const expired = isEventExpired(row)
    const busy = busyId === row.id
    const allowDelete = !!opts?.allowDelete
    return (
      <Card key={row.id} style={styles.rowCard}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push(`/(tabs)/house/event-edit?id=${row.id}`)}
          style={styles.rowMain}
        >
          {row.image_url ? (
            <Image source={{ uri: row.image_url }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty]}>
              <Ionicons name="image-outline" size={22} color={THEME.faint} />
            </View>
          )}
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.rowTitle} numberOfLines={2}>
              {row.title}
            </Text>
            <Text style={styles.rowMeta}>
              {eventTypeLabel(row.event_type)} · {eventTimeLine(row)}
            </Text>
            <View style={styles.pillRow}>
              {row.is_public_visible && !expired ? (
                <View style={[styles.pill, styles.pillOn]}>
                  <Text style={styles.pillOnText}>公开中</Text>
                </View>
              ) : (
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{expired ? '已结束' : '未公开'}</Text>
                </View>
              )}
              {evergreen ? (
                <View style={styles.pill}>
                  <Text style={styles.pillText}>长期展示</Text>
                </View>
              ) : null}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={THEME.faint} />
        </TouchableOpacity>
        <View style={styles.rowActions}>
          {busy ? (
            <ActivityIndicator size="small" color={THEME.gold} />
          ) : (
            <>
              {row.is_public_visible && !expired ? (
                <Button
                  label="隐藏"
                  variant="secondary"
                  onPress={() => toggleVisible(row, false)}
                  style={styles.actionBtn}
                />
              ) : (
                <Button
                  label="公开"
                  variant="secondary"
                  onPress={() => toggleVisible(row, true)}
                  style={styles.actionBtn}
                />
              )}
              <Button
                label="编辑"
                variant="secondary"
                onPress={() => router.push(`/(tabs)/house/event-edit?id=${row.id}`)}
                style={styles.actionBtn}
              />
              {allowDelete ? (
                <Button
                  label="删除"
                  variant="danger"
                  onPress={() => confirmDelete(row)}
                  style={styles.actionBtn}
                />
              ) : null}
            </>
          )}
        </View>
      </Card>
    )
  }

  return (
    <Screen
      scroll
      keyboard
      contentStyle={{ flexGrow: 1 }}
    >
      <HouseSubheader title="活动" />

      <Button
        label="新建活动"
        icon="add-outline"
        onPress={() => router.push('/(tabs)/house/event-edit')}
        style={{ marginBottom: SPACING.lg }}
      />

      {loading ? (
        <Loading />
      ) : (
        <View
          // RefreshControl needs ScrollView; Screen already scrolls — use pull via focus reload.
        >
          {rows.length === 0 ? (
            <Card>
              <Text style={styles.empty}>还没有活动。新建后可公开到顾客端 EVENTS。</Text>
            </Card>
          ) : (
            <>
              <SectionLabel>展示中（{showing.length}）</SectionLabel>
              {showing.length === 0 ? (
                <Text style={styles.emptyInline}>暂无公开活动</Text>
              ) : (
                showing.map((row) => renderRow(row))
              )}

              <SectionLabel style={{ marginTop: SPACING.lg }}>
                未公开 / 已结束（{hidden.length}）
              </SectionLabel>
              {hidden.length === 0 ? (
                <Text style={styles.emptyInline}>无</Text>
              ) : (
                hidden.map((row) => renderRow(row, { allowDelete: true }))
              )}
            </>
          )}
          <TouchableOpacity
            onPress={() => {
              setRefreshing(true)
              void load()
            }}
            style={styles.refresh}
          >
            <Text style={styles.refreshText}>{refreshing ? '刷新中…' : '刷新列表'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  backBtn: { marginTop: -4 },
  rowCard: { marginBottom: SPACING.md, gap: SPACING.md },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.md,
    backgroundColor: THEME.surface,
  },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: THEME.border },
  rowTitle: { color: THEME.text, fontSize: 16, fontWeight: '600' },
  rowMeta: { color: THEME.muted, fontSize: 13 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  pillOn: {
    backgroundColor: THEME.goldFill,
    borderColor: THEME.goldBorder,
  },
  pillText: { color: THEME.muted, fontSize: 11, fontWeight: '600' },
  pillOnText: { color: THEME.gold, fontSize: 11, fontWeight: '600' },
  rowActions: { flexDirection: 'row', gap: SPACING.sm },
  actionBtn: { flex: 1 },
  empty: { color: THEME.muted, fontSize: 14, lineHeight: 20 },
  emptyInline: { color: THEME.faint, fontSize: 13, marginBottom: SPACING.md },
  refresh: { alignItems: 'center', paddingVertical: SPACING.lg },
  refreshText: { color: THEME.gold, fontSize: 14, fontWeight: '600' },
})
