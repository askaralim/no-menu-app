import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { palette, spacing, typography } from '@/constants/design'
import { TAPLIST_AGE_NOTICE_TITLE, TAPLIST_LEGAL_DISCLAIMER } from '@/constants/compliance'
import { hasAcknowledgedLegalNotice, setAcknowledgedLegalNotice } from '@/lib/firstLaunch'
import { queryClient } from '@/lib/queryClient'
import { resetTaplistSupabaseCache } from '@/lib/supabase'

type Props = {
  children: React.ReactNode
}

/**
 * ADR-018: first-launch age / legal notice before using the consumer app.
 */
export function FirstLaunchLegalGate({ children }: Props) {
  const insets = useSafeAreaInsets()
  const [ready, setReady] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const ack = await hasAcknowledgedLegalNotice()
      if (cancelled) return
      setVisible(!ack)
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const onAccept = async () => {
    await setAcknowledgedLegalNotice()
    resetTaplistSupabaseCache()
    setVisible(false)
    void queryClient.invalidateQueries({ queryKey: ['taplist'] })
  }

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={palette.amber} />
      </View>
    )
  }

  if (visible) {
    return (
      <Modal visible animationType="fade" transparent={false} onRequestClose={() => {}}>
        <View
          style={[
            styles.sheet,
            { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg },
          ]}>
          <Text style={styles.kicker}>NO MENU TAP LIST</Text>
          <Text style={styles.title}>{TAPLIST_AGE_NOTICE_TITLE}</Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.body}>{TAPLIST_LEGAL_DISCLAIMER}</Text>
          </ScrollView>
          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={() => void onAccept()}>
            <Text style={styles.buttonText}>我已满法定饮酒年龄，继续</Text>
          </Pressable>
          <Text style={styles.hint}>未满法定饮酒年龄请勿使用本 App。</Text>
        </View>
      </Modal>
    )
  }

  return <>{children}</>
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    flex: 1,
    backgroundColor: palette.background,
    paddingHorizontal: spacing.lg,
  },
  kicker: {
    ...typography.label,
    color: palette.tungsten,
    fontSize: 11,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.displayL,
    color: palette.text,
    fontSize: 34,
    lineHeight: 40,
    marginBottom: spacing.lg,
  },
  scroll: {
    flex: 1,
    marginBottom: spacing.lg,
  },
  scrollContent: {
    paddingBottom: spacing.xs,
  },
  body: {
    ...typography.body,
    color: palette.muted,
  },
  button: {
    backgroundColor: palette.tungsten,
    borderRadius: 8,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonText: {
    color: palette.background,
    ...typography.title,
  },
  hint: {
    ...typography.micro,
    color: palette.faint,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
})
