import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { palette, spacing, typography } from '@/constants/design'
import { trackEvent } from '@/lib/analytics'
import { getMyDrinkState, lightMyDrink, removeMyDrinkVenue } from '@/lib/api/drinkLog'
import { ensureDrinkLogSession } from '@/lib/drinkLogAuth'

type Props = {
  drinkId: string
  tenantId: string
}

export function useDrinkLightController({ drinkId, tenantId }: Props) {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)
  const [showUndo, setShowUndo] = useState(false)

  const stateQuery = useQuery({
    queryKey: ['drink-log', 'state', drinkId],
    queryFn: () => getMyDrinkState(drinkId),
    enabled: Boolean(drinkId),
  })
  const state = stateQuery.data

  useEffect(() => {
    if (!showUndo) return
    const timer = setTimeout(() => setShowUndo(false), 5000)
    return () => clearTimeout(timer)
  }, [showUndo])

  const lightMutation = useMutation({
    mutationFn: async () => {
      trackEvent('drink_light_started')
      const session = await ensureDrinkLogSession()
      queryClient.setQueryData(['drink-log', 'session'], session)
      return lightMyDrink(drinkId)
    },
    onMutate: () => setMessage(null),
    onSuccess: (result) => {
      queryClient.setQueryData(['drink-log', 'state', drinkId], result)
      void queryClient.invalidateQueries({ queryKey: ['drink-log', 'history'] })
      void queryClient.invalidateQueries({ queryKey: ['drink-log', 'summary'] })
      setShowUndo(result.created_venue)
      setMessage(null)
      trackEvent('drink_light_succeeded', {
        created_drink: result.created_light,
        created_venue: result.created_venue,
      })
      if (!result.created_light && result.created_venue) trackEvent('drink_venue_added')
    },
    onError: () => {
      setMessage('暂时无法保存记录，请检查网络后重试')
      trackEvent('drink_light_failed')
    },
  })

  const undoMutation = useMutation({
    mutationFn: async () => {
      if (!state?.light_id) return null
      return removeMyDrinkVenue(state.light_id, tenantId)
    },
    onSuccess: () => {
      setShowUndo(false)
      setMessage(null)
      void queryClient.invalidateQueries({ queryKey: ['drink-log'] })
      void stateQuery.refetch()
    },
  })

  const buttonLabel = state?.is_current_venue_lit
    ? '已喝过'
    : state?.is_lit
      ? '记录这里'
      : '喝过'
  return {
    state,
    buttonLabel,
    message,
    showUndo,
    lightMutation,
    undoMutation,
  }
}

type Controller = ReturnType<typeof useDrinkLightController>

export function DrinkLightAction({ controller }: { controller: Controller }) {
  const { state, buttonLabel, showUndo, lightMutation, undoMutation } = controller

  return (
    <View style={styles.action}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={buttonLabel}
        disabled={state?.is_current_venue_lit || lightMutation.isPending}
        onPress={() => lightMutation.mutate()}
        style={({ pressed }) => [styles.button, state?.is_current_venue_lit && styles.buttonComplete, pressed && styles.buttonPressed]}>
        {lightMutation.isPending ? (
          <ActivityIndicator size="small" color={palette.amber} />
        ) : (
          <FontAwesome
            name={state?.is_current_venue_lit ? 'check' : 'lightbulb-o'}
            size={16}
            color={state?.is_current_venue_lit ? palette.faint : palette.amber}
          />
        )}
      </Pressable>
      {showUndo && state?.light_id ? (
        <View style={styles.stateRow}>
          <Text style={[styles.buttonText, styles.completeText]}>已喝过</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="撤销刚才的喝过"
            disabled={undoMutation.isPending}
            hitSlop={10}
            onPress={() => undoMutation.mutate()}
            style={styles.undoButton}>
            <Text style={styles.undo}>{undoMutation.isPending ? '撤销中' : '撤销'}</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={[styles.buttonText, state?.is_current_venue_lit && styles.completeText]}>{buttonLabel}</Text>
      )}
    </View>
  )
}

export function DrinkLightFeedback({ controller }: { controller: Controller }) {
  const { message } = controller

  if (!message) return null

  return (
    <View style={styles.feedback}>
      <Text style={styles.message}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    gap: spacing.xxs,
    flexShrink: 0,
  },
  button: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: palette.goldMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonComplete: {
    borderColor: palette.line,
  },
  buttonPressed: { opacity: 0.82 },
  buttonText: { ...typography.micro, color: palette.amber, fontSize: 10 },
  completeText: { color: palette.faint },
  stateRow: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  undoButton: { minHeight: 28, minWidth: 28, alignItems: 'center', justifyContent: 'center' },
  feedback: { marginTop: spacing.md },
  message: { ...typography.caption, color: palette.muted },
  undo: { ...typography.caption, color: palette.amber },
})
