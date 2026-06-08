import FontAwesome from '@expo/vector-icons/FontAwesome'
import { Link, useRouter } from 'expo-router'
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

import { palette, spacing, typography } from '@/constants/design'
import { RailVenueBadge } from '@/components/taplist/RailVenueBadge'
import {
  EVENT_RAIL_CARD_HEIGHT,
  EVENT_RAIL_CARD_WIDTH,
  RAIL_CARD_IMAGE_BORDER,
  RAIL_CARD_RADIUS,
  RAIL_IMAGE_SCRIM_COLORS,
  RAIL_IMAGE_SCRIM_LOCATIONS,
  RAIL_TEXT_ONLY_SCRIM_COLORS,
  RAIL_TEXT_ONLY_SCRIM_LOCATIONS,
  RAIL_TEXT_SHADOW,
  railCardBodyStyle,
  railCardScrimStyle,
} from '@/components/taplist/railCardStyle'
import type { PublicEventRow } from '@/lib/types'

type EventCardProps = {
  event: PublicEventRow
  compact?: boolean
  showVenue?: boolean
}

export function compactEventTypeLabel(event: PublicEventRow) {
  switch (event.event_type) {
    case 'happy_hour':
      return 'Happy Hour'
    case 'tap_takeover':
      return '酒头接管'
    case 'dj':
      return 'DJ Night'
    case 'new_tap':
      return '新酒发布'
    case 'party':
      return '派对'
    case 'tasting':
      return '品鉴'
    case 'guest_shift':
      return 'Guest Shift'
    case 'live_music':
      return 'Live Music'
    case 'quiz':
      return 'Quiz Night'
    case 'other':
      return '活动'
    default:
      return event.event_type_label?.split('/')[0]?.trim() || '活动'
  }
}

export function eventMetaLine(event: PublicEventRow) {
  return `${event.display_state}`
}

export function EventCard({ event, compact = false, showVenue = true }: EventCardProps) {
  const router = useRouter()
  const hasImage = Boolean(event.image_url)
  const titleLines = compact ? 2 : 2

  const copy = (
    <View style={styles.eventCopy}>
      <View style={styles.badgeRow}>
        <View style={[styles.stateBadge, event.display_state === 'ONGOING' && styles.ongoingBadge]}>
          <Text style={styles.stateText} numberOfLines={1} ellipsizeMode="tail">
            {eventMetaLine(event)}
          </Text>
        </View>
      </View>
      <Text style={[styles.title, compact && styles.compactTitle]} numberOfLines={titleLines} ellipsizeMode="tail">
        {event.title}
      </Text>

      {showVenue ? <RailVenueBadge name={event.tenant_display_name} /> : null}
    </View>
  )

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[event.title, event.event_type_label, event.display_time, event.tenant_display_name]
        .filter(Boolean)
        .join('，')}
      onPress={() =>
        router.push({
          pathname: '/bar/[slug]/event/[eventId]',
          params: { slug: event.tenant_slug, eventId: event.id },
        })
      }
      style={({ pressed }) => [styles.card, hasImage && styles.imageCard, pressed && styles.pressed]}>
      {hasImage ? (
        <ImageBackground
          source={{ uri: event.image_url as string }}
          style={styles.imageFill}
          imageStyle={styles.imageRadius}>
          <LinearGradient
            colors={RAIL_IMAGE_SCRIM_COLORS}
            locations={RAIL_IMAGE_SCRIM_LOCATIONS}
            style={styles.imageScrim}>
            {copy}
          </LinearGradient>
        </ImageBackground>
      ) : (
        <LinearGradient
          colors={RAIL_TEXT_ONLY_SCRIM_COLORS}
          locations={RAIL_TEXT_ONLY_SCRIM_LOCATIONS}
          style={styles.textOnlyFill}>
          {copy}
        </LinearGradient>
      )}
      <View pointerEvents="none" style={styles.railBorderOverlay} />
    </Pressable>
  )
}

export function EventListRow({ event, showVenue = true }: { event: PublicEventRow; showVenue?: boolean }) {
  const hasImage = Boolean(event.image_url)
  const copy = (
    <View style={styles.rowBody}>
      <View style={styles.rowTop}>
        <View style={[styles.stateBadge, event.display_state === 'ONGOING' && styles.ongoingBadge]}>
          <Text style={styles.stateText} numberOfLines={1} ellipsizeMode="tail">
            {eventMetaLine(event)}
          </Text>
        </View>
      </View>
      <Text style={styles.rowTitle} numberOfLines={2} ellipsizeMode="tail">
        {event.title}
      </Text>
      {event.display_time ? (
        <Text style={styles.rowMeta} numberOfLines={1} ellipsizeMode="tail">
          {event.display_time}
        </Text>
      ) : null}
      {showVenue ? (
        <Text style={styles.rowVenue} numberOfLines={1} ellipsizeMode="tail">
          {event.tenant_display_name}
        </Text>
      ) : null}
    </View>
  )

  return (
    <Link
      href={{
        pathname: '/bar/[slug]/event/[eventId]',
        params: { slug: event.tenant_slug, eventId: event.id },
      }}
      asChild>
      <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        {hasImage ? (
          <ImageBackground source={{ uri: event.image_url as string }} style={styles.rowImage} imageStyle={styles.rowImageRadius}>
            <LinearGradient
              colors={['rgba(13,13,13,0.04)', 'rgba(13,13,13,0.32)', 'rgba(13,13,13,0.96)']}
              locations={[0, 0.46, 1]}
              style={styles.rowImageTint}>
              {copy}
            </LinearGradient>
          </ImageBackground>
        ) : (
          <LinearGradient
            colors={['rgba(124,86,56,0.18)', 'rgba(21,21,21,0.88)', 'rgba(13,13,13,0.98)']}
            locations={[0, 0.58, 1]}
            style={styles.rowTextOnly}>
            {copy}
          </LinearGradient>
        )}
        <View style={styles.rowArrow}>
          <FontAwesome name="angle-right" size={18} color={palette.faint} />
        </View>
      </Pressable>
    </Link>
  )
}

const styles = StyleSheet.create({
  card: {
    width: EVENT_RAIL_CARD_WIDTH,
    minWidth: EVENT_RAIL_CARD_WIDTH,
    maxWidth: EVENT_RAIL_CARD_WIDTH,
    height: EVENT_RAIL_CARD_HEIGHT,
    borderRadius: RAIL_CARD_RADIUS,
    backgroundColor: palette.bgSoft,
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
    flexGrow: 0,
  },
  imageCard: {
    backgroundColor: palette.panelElevated,
  },
  railBorderOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RAIL_CARD_RADIUS,
    borderWidth: 1,
    borderColor: RAIL_CARD_IMAGE_BORDER,
  },
  pressed: {
    opacity: 0.78,
  },
  imageFill: {
    flex: 1,
    width: '100%',
  },
  imageRadius: {
    borderRadius: RAIL_CARD_RADIUS,
  },
  imageScrim: {
    ...railCardScrimStyle,
  },
  textOnlyFill: {
    ...railCardScrimStyle,
  },
  eventCopy: {
    ...railCardBodyStyle,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  stateBadge: {
    maxWidth: '100%',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(211,154,69,0.46)',
    backgroundColor: 'rgba(8,8,8,0.72)',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ongoingBadge: {
    borderColor: 'rgba(211,154,69,0.54)',
    backgroundColor: 'rgba(8,8,8,0.72)',
  },
  stateText: {
    ...typography.label,
    color: palette.amber,
    fontSize: 9,
    lineHeight: 11,
    letterSpacing: 1,
  },
  title: {
    ...typography.caption,
    color: palette.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    maxWidth: '100%',
    ...RAIL_TEXT_SHADOW,
  },
  compactTitle: {
    fontSize: 14,
    lineHeight: 19,
  },
  row: {
    minHeight: 146,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(198,168,117,0.28)',
    backgroundColor: palette.panelElevated,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  rowImage: {
    minHeight: 146,
    overflow: 'hidden',
    backgroundColor: palette.panelElevated,
  },
  rowImageRadius: {
    borderRadius: 12,
  },
  rowImageTint: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  rowTextOnly: {
    minHeight: 136,
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  rowBody: {
    minWidth: 0,
    paddingRight: spacing.lg,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xxs,
  },
  rowTitle: {
    ...typography.title,
    color: palette.text,
    fontSize: 16,
    lineHeight: 22,
    textShadowColor: 'rgba(0,0,0,0.84)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  rowMeta: {
    ...typography.caption,
    color: palette.tungsten,
    marginTop: spacing.xxs,
    textShadowColor: 'rgba(0,0,0,0.72)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  rowVenue: {
    ...typography.caption,
    color: palette.muted,
    marginTop: spacing.xxs,
    textShadowColor: 'rgba(0,0,0,0.72)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  rowArrow: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
  },
})
