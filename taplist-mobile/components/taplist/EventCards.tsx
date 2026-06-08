import FontAwesome from '@expo/vector-icons/FontAwesome'
import { Link } from 'expo-router'
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

import { palette, spacing, typography } from '@/constants/design'
import type { PublicEventRow } from '@/lib/types'

type EventCardProps = {
  event: PublicEventRow
  compact?: boolean
}

export function EventCard({ event, compact = false }: EventCardProps) {
  const hasImage = Boolean(event.image_url)
  const titleLines = compact ? 2 : 3
  const subtitle = event.subtitle || event.description

  const copy = (
    <View style={styles.eventCopy}>
      <View style={styles.badgeRow}>
        <View style={[styles.stateBadge, event.display_state === 'ONGOING' && styles.ongoingBadge]}>
          <Text style={styles.stateText}>{event.display_state}</Text>
        </View>
        <Text style={styles.typeLabel} numberOfLines={1} ellipsizeMode="tail">
          {event.event_type_label}
        </Text>
      </View>
      <Text style={[styles.title, compact && styles.compactTitle]} numberOfLines={titleLines} ellipsizeMode="tail">
        {event.title}
      </Text>
      {event.display_time ? (
        <Text style={styles.time} numberOfLines={1} ellipsizeMode="tail">
          {event.display_time}
        </Text>
      ) : null}
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={compact ? 2 : 3} ellipsizeMode="tail">
          {subtitle}
        </Text>
      ) : null}
      <Text style={styles.venue} numberOfLines={1} ellipsizeMode="tail">
        @ {event.tenant_display_name}
      </Text>
    </View>
  )

  return (
    <Link
      href={{
        pathname: '/bar/[slug]/event/[eventId]',
        params: { slug: event.tenant_slug, eventId: event.id },
      }}
      asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[event.title, event.event_type_label, event.display_time, event.tenant_display_name]
          .filter(Boolean)
          .join('，')}
        style={({ pressed }) => [
          styles.card,
          compact && styles.compactCard,
          hasImage && styles.imageCard,
          pressed && styles.pressed,
        ]}>
        {hasImage ? (
          <ImageBackground
            source={{ uri: event.image_url as string }}
            style={styles.imageFill}
            imageStyle={styles.imageRadius}>
            <LinearGradient
              colors={['rgba(13,13,13,0.12)', 'rgba(13,13,13,0.68)', 'rgba(13,13,13,0.97)']}
              locations={[0, 0.5, 1]}
              style={styles.imageScrim}>
              {copy}
            </LinearGradient>
          </ImageBackground>
        ) : (
          <LinearGradient
            colors={['rgba(124,86,56,0.24)', 'rgba(21,21,21,0.84)', 'rgba(13,13,13,0.96)']}
            locations={[0, 0.56, 1]}
            style={styles.textOnlyFill}>
            {copy}
          </LinearGradient>
        )}
      </Pressable>
    </Link>
  )
}

export function EventListRow({ event }: { event: PublicEventRow }) {
  return (
    <Link
      href={{
        pathname: '/bar/[slug]/event/[eventId]',
        params: { slug: event.tenant_slug, eventId: event.id },
      }}
      asChild>
      <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        {event.image_url ? (
          <ImageBackground source={{ uri: event.image_url }} style={styles.rowImage} imageStyle={styles.rowImageRadius}>
            <LinearGradient colors={['rgba(13,13,13,0.05)', 'rgba(13,13,13,0.48)']} style={styles.rowImageTint} />
          </ImageBackground>
        ) : (
          <View style={styles.rowSpacer} />
        )}
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={styles.rowState}>{event.display_state}</Text>
            <Text style={styles.rowType} numberOfLines={1} ellipsizeMode="tail">
              {event.event_type_label}
            </Text>
          </View>
          <Text style={styles.rowTitle} numberOfLines={2} ellipsizeMode="tail">
            {event.title}
          </Text>
          {event.display_time ? (
            <Text style={styles.rowMeta} numberOfLines={1} ellipsizeMode="tail">
              {event.display_time}
            </Text>
          ) : null}
          <Text style={styles.rowVenue} numberOfLines={1} ellipsizeMode="tail">
            {event.tenant_display_name}
          </Text>
        </View>
        <FontAwesome name="angle-right" size={18} color={palette.faint} />
      </Pressable>
    </Link>
  )
}

const styles = StyleSheet.create({
  card: {
    width: 214,
    height: 154,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(198,168,117,0.28)',
    backgroundColor: palette.panelElevated,
    overflow: 'hidden',
  },
  compactCard: {
    width: 160,
    height: 122,
  },
  imageCard: {
    backgroundColor: palette.panelElevated,
  },
  pressed: {
    opacity: 0.78,
  },
  imageFill: {
    flex: 1,
    width: '100%',
  },
  imageRadius: {
    borderRadius: 8,
  },
  imageScrim: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.sm,
  },
  textOnlyFill: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.sm,
  },
  eventCopy: {
    minWidth: 0,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  stateBadge: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(211,154,69,0.5)',
    backgroundColor: 'rgba(211,154,69,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ongoingBadge: {
    borderColor: 'rgba(168,194,63,0.42)',
    backgroundColor: 'rgba(168,194,63,0.12)',
  },
  stateText: {
    ...typography.label,
    color: palette.amber,
    fontSize: 9,
    lineHeight: 11,
    letterSpacing: 1,
  },
  typeLabel: {
    ...typography.micro,
    color: palette.tungsten,
    flex: 1,
  },
  title: {
    ...typography.title,
    color: palette.text,
    fontSize: 17,
    lineHeight: 22,
  },
  compactTitle: {
    fontSize: 15,
    lineHeight: 20,
  },
  time: {
    ...typography.micro,
    color: palette.tungsten,
    marginTop: spacing.xxs,
  },
  subtitle: {
    ...typography.micro,
    color: palette.muted,
    marginTop: spacing.xxs,
  },
  venue: {
    ...typography.micro,
    color: palette.faint,
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
  },
  rowImage: {
    width: 72,
    height: 72,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: palette.panelElevated,
  },
  rowImageRadius: {
    borderRadius: 6,
  },
  rowImageTint: {
    flex: 1,
  },
  rowSpacer: {
    width: 0,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xxs,
  },
  rowState: {
    ...typography.label,
    color: palette.amber,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 1,
  },
  rowType: {
    ...typography.micro,
    color: palette.faint,
    flex: 1,
  },
  rowTitle: {
    ...typography.title,
    color: palette.text,
    fontSize: 16,
    lineHeight: 22,
  },
  rowMeta: {
    ...typography.micro,
    color: palette.tungsten,
    marginTop: spacing.xxs,
  },
  rowVenue: {
    ...typography.micro,
    color: palette.muted,
    marginTop: spacing.xxs,
  },
})
