import FontAwesome from '@expo/vector-icons/FontAwesome'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { CachedImageBackground } from '@/components/taplist/CachedImage'
import { compactEventDateLabel } from '@/components/taplist/EventCards'
import {
  RAIL_IMAGE_SCRIM_COLORS,
  RAIL_IMAGE_SCRIM_LOCATIONS,
  RAIL_TEXT_ONLY_SCRIM_COLORS,
  RAIL_TEXT_ONLY_SCRIM_LOCATIONS,
} from '@/components/taplist/railCardStyle'
import { palette, spacing, typography } from '@/constants/design'
import { trackEvent } from '@/lib/analytics'
import type { PublicEventRow } from '@/lib/types'

export const HOME_EVENT_BANNER_HEIGHT = 184

type HomeEventBannerProps = {
  event: PublicEventRow
  width: number
  index: number
  total: number
}

function homeEventStateLabel(event: PublicEventRow) {
  return event.display_state === 'UPCOMING' ? '即将开始' : '进行中'
}

export function HomeEventBanner({ event, width, index, total }: HomeEventBannerProps) {
  const router = useRouter()
  const stateLabel = homeEventStateLabel(event)
  const dateLabel = compactEventDateLabel(event)
  const pageLabel = total > 1 ? `第 ${index + 1} 场，共 ${total} 场` : null
  const copy = (
    <>
      <View style={styles.stateBadge}>
        <Text style={styles.stateText}>{stateLabel}</Text>
      </View>
      <View style={[styles.copy, total > 1 && styles.copyWithCounter]}>
        <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
          {event.title}
        </Text>
        {dateLabel ? (
          <Text style={styles.date} numberOfLines={1} ellipsizeMode="tail">
            {dateLabel}
          </Text>
        ) : null}
        <View style={styles.venueRow}>
          <FontAwesome name="map-marker" size={12} color={palette.muted} />
          <Text style={styles.venue} numberOfLines={1} ellipsizeMode="tail">
            {event.tenant_display_name}
          </Text>
        </View>
      </View>
    </>
  )

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[stateLabel, event.title, dateLabel, event.tenant_display_name, pageLabel]
        .filter(Boolean)
        .join('，')}
      onPress={() => {
        trackEvent('event_opened', {
          tenant_id: event.tenant_id,
          event_id: event.id,
          source: 'home_event',
        })
        router.push({
          pathname: '/bar/[slug]/event/[eventId]',
          params: { slug: event.tenant_slug, eventId: event.id },
        })
      }}
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}>
      {event.image_url ? (
        <CachedImageBackground source={event.image_url} style={styles.fill} imageStyle={styles.image}>
          <LinearGradient
            colors={RAIL_IMAGE_SCRIM_COLORS}
            locations={RAIL_IMAGE_SCRIM_LOCATIONS}
            style={styles.scrim}>
            {copy}
          </LinearGradient>
        </CachedImageBackground>
      ) : null}
      {!event.image_url ? (
        <LinearGradient
          colors={RAIL_TEXT_ONLY_SCRIM_COLORS}
          locations={RAIL_TEXT_ONLY_SCRIM_LOCATIONS}
          style={styles.fill}>
          {copy}
        </LinearGradient>
      ) : null}
      <View pointerEvents="none" style={styles.border} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    height: HOME_EVENT_BANNER_HEIGHT,
    minHeight: HOME_EVENT_BANNER_HEIGHT,
    borderRadius: 16,
    backgroundColor: palette.panelElevated,
    overflow: 'hidden',
    flexShrink: 0,
  },
  fill: {
    flex: 1,
  },
  image: {
    borderRadius: 16,
  },
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  copy: {
    alignSelf: 'stretch',
    minWidth: 0,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    alignItems: 'flex-start',
  },
  copyWithCounter: {
    paddingRight: 72,
  },
  stateBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    zIndex: 1,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  stateText: {
    ...typography.label,
    color: palette.muted,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1,
  },
  title: {
    ...typography.title,
    color: palette.text,
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '600',
  },
  date: {
    ...typography.caption,
    color: palette.faint,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.xxs,
  },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.xs,
    minWidth: 0,
  },
  venue: {
    ...typography.caption,
    color: palette.muted,
    flex: 1,
    minWidth: 0,
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.line,
  },
  pressed: {
    opacity: 0.82,
  },
})
