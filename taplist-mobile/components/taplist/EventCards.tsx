import { Link, useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

import { palette, spacing, typography } from '@/constants/design'
import { RailVenueBadge } from '@/components/taplist/RailVenueBadge'
import { CachedImage, CachedImageBackground } from '@/components/taplist/CachedImage'
import {
  listCapsuleCardStyles,
  listCapsuleMetaStyle,
  listCapsuleSecondaryStyle,
  listCapsuleTitleStyle,
  listCapsuleVenueStyle,
} from '@/components/taplist/listCapsuleCardStyle'
import {
  BEER_CARD_ARTWORK_WIDTH,
  BEER_CARD_PANEL_COLORS,
  BEER_CARD_PANEL_LOCATIONS,
  EVENT_CARD_ARTWORK_WIDTH,
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
import { trackEvent, type AnalyticsSource } from '@/lib/analytics'

type EventCardProps = {
  event: PublicEventRow
  compact?: boolean
  showVenue?: boolean
  source?: AnalyticsSource
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

/** Specific type or subtitle for list cards — skips generic "活动". */
export function eventListDetailLine(event: PublicEventRow): string | null {
  const typeLabel = compactEventTypeLabel(event)
  if (typeLabel && typeLabel !== '活动') return typeLabel
  const subtitle = event.subtitle?.trim()
  return subtitle || null
}

export function shouldGroupEventsByVenue(events: PublicEventRow[]) {
  const counts = new Map<string, number>()
  for (const event of events) {
    counts.set(event.tenant_id, (counts.get(event.tenant_id) ?? 0) + 1)
  }

  return [...counts.values()].some((count) => count > 1)
}

export function eventDisplayStateLabel(state: PublicEventRow['display_state']) {
  return state === 'ONGOING' ? 'TONIGHT' : state
}

export function eventMetaLine(event: PublicEventRow) {
  return eventDisplayStateLabel(event.display_state)
}

export function EventCard({ event, compact = false, showVenue = true, source = 'direct' }: EventCardProps) {
  const router = useRouter()
  const hasImage = Boolean(event.image_url)
  const titleLines = compact ? 2 : 2

  const copy = (
    <View style={styles.eventCopy}>
      <View style={styles.badgeRow}>
        <View style={[styles.stateBadge, (event.display_state === 'ONGOING' || event.display_state === 'TONIGHT') && styles.ongoingBadge]}>
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
        {
          trackEvent('event_opened', {
            tenant_id: event.tenant_id,
            event_id: event.id,
            source,
          })
          router.push({
            pathname: '/bar/[slug]/event/[eventId]',
            params: { slug: event.tenant_slug, eventId: event.id },
          })
        }
      }
      style={({ pressed }) => [styles.card, hasImage && styles.imageCard, pressed && styles.pressed]}>
      {hasImage ? (
        <CachedImageBackground
          source={event.image_url as string}
          style={styles.imageFill}
          imageStyle={styles.imageRadius}>
          <LinearGradient
            colors={RAIL_IMAGE_SCRIM_COLORS}
            locations={RAIL_IMAGE_SCRIM_LOCATIONS}
            style={styles.imageScrim}>
            {copy}
          </LinearGradient>
        </CachedImageBackground>
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

export function EventListCard({
  event,
  showVenue = true,
  source = 'direct',
}: {
  event: PublicEventRow
  showVenue?: boolean
  source?: AnalyticsSource
}) {
  const hasImage = Boolean(event.image_url)
  const artworkWidth = hasImage ? EVENT_CARD_ARTWORK_WIDTH : BEER_CARD_ARTWORK_WIDTH
  const detailLine = eventListDetailLine(event)
  const venueLine = event.tenant_display_name

  return (
    <Link
      href={{
        pathname: '/bar/[slug]/event/[eventId]',
        params: { slug: event.tenant_slug, eventId: event.id },
      }}
      asChild>
      <Pressable
        onPress={() =>
          trackEvent('event_opened', {
            tenant_id: event.tenant_id,
            event_id: event.id,
            source,
          })
        }
        accessibilityRole="button"
        accessibilityLabel={[event.tenant_display_name, event.title, event.display_time, event.event_type_label]
          .filter(Boolean)
          .join('，')}
        style={({ pressed }) => [listCapsuleCardStyles.card, pressed && listCapsuleCardStyles.cardPressed]}>
        <View style={listCapsuleCardStyles.cardInner}>
          {hasImage ? (
            <View style={[listCapsuleCardStyles.artworkFrame, { width: artworkWidth }]}>
              <CachedImage
                source={event.image_url as string}
                style={listCapsuleCardStyles.artwork}
              />
            </View>
          ) : (
            <View style={[listCapsuleCardStyles.artworkSpacer, { width: artworkWidth }]} />
          )}

          <View style={listCapsuleCardStyles.panel}>
            <LinearGradient
              colors={BEER_CARD_PANEL_COLORS}
              locations={BEER_CARD_PANEL_LOCATIONS}
              style={StyleSheet.absoluteFill}
            />

            <View style={listCapsuleCardStyles.panelContent}>
              <Text style={listCapsuleTitleStyle} numberOfLines={2} ellipsizeMode="tail">
                {event.title}
              </Text>

              {detailLine ? (
                <Text style={listCapsuleMetaStyle} numberOfLines={1} ellipsizeMode="tail">
                  {detailLine}
                </Text>
              ) : null}

              {event.display_time ? (
                <Text style={listCapsuleSecondaryStyle} numberOfLines={2}>
                  {event.display_time}
                </Text>
              ) : null}

              {showVenue && venueLine ? (
                <Text style={listCapsuleVenueStyle} numberOfLines={1} ellipsizeMode="tail">
                  {venueLine}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
        <View pointerEvents="none" style={listCapsuleCardStyles.borderOverlay} />
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
})
