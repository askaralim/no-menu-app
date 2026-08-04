import { useEffect, useState } from 'react'
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { TAPLIST_THEME as T } from '../../lib/taplistTheme'
import { getDrinkStatusEvents, type DrinkStatusEvent } from '../../lib/taplistOwnerApi'

export default function DrinkStatusHistorySheet({
  visible,
  drinkId,
  drinkName,
  onClose,
}: {
  visible: boolean
  drinkId: string | null
  drinkName: string
  onClose: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [events, setEvents] = useState<DrinkStatusEvent[]>([])

  useEffect(() => {
    if (!visible || !drinkId) {
      setEvents([])
      return
    }
    let cancelled = false
    setLoading(true)
    void getDrinkStatusEvents(drinkId)
      .then((rows) => {
        if (!cancelled) setEvents(rows)
      })
      .catch(() => {
        if (!cancelled) setEvents([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [visible, drinkId])

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              状态记录
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={T.text} />
            </TouchableOpacity>
          </View>
          <Text style={styles.sub} numberOfLines={1}>
            {drinkName}
          </Text>
          {loading ? (
            <ActivityIndicator color={T.gold} style={{ marginTop: 24 }} />
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
              {events.length === 0 ? (
                <Text style={styles.empty}>暂无状态变更记录</Text>
              ) : (
                events.map((ev) => (
                  <Text key={ev.id} style={styles.line}>
                    {(ev.from_status_zh || '—') + ' → ' + ev.to_status_zh}
                    {' · '}
                    {new Date(ev.created_at).toLocaleString('zh-CN', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                ))
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '70%',
    backgroundColor: T.surfaceSolid,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderColor: T.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: { color: T.text, fontSize: 18, fontWeight: '700', flex: 1 },
  sub: { color: T.muted, fontSize: 13, marginBottom: 14 },
  empty: { color: T.muted, fontSize: 14, marginTop: 8 },
  line: { color: T.textSoft, fontSize: 14, lineHeight: 22, marginBottom: 8 },
})
