import { StyleSheet, Text, View } from 'react-native'

import { EventListCard, shouldGroupEventsByVenue } from '@/components/taplist/EventCards'
import { BEER_CARD_GAP } from '@/components/taplist/railCardStyle'
import { palette, spacing, typography } from '@/constants/design'
import type { PublicEventRow } from '@/lib/types'
import type { AnalyticsSource } from '@/lib/analytics'

type EventListSectionProps = {
  title: string
  count: number
  events: PublicEventRow[]
  /** Bar detail screen: never show venue on cards. */
  hideVenue?: boolean
  compact?: boolean
  source?: AnalyticsSource
}

export function EventListSection({ title, count, events, hideVenue = false, compact = false, source = 'direct' }: EventListSectionProps) {
  const anyVenueHasMultiple = !hideVenue && shouldGroupEventsByVenue(events)

  return (
    <View style={[styles.group, compact && !anyVenueHasMultiple && styles.groupCompact]}>
      <Text style={styles.groupTitle}>{title}</Text>
      <Text style={[styles.groupSub, compact && !anyVenueHasMultiple && styles.groupSubCompact]}>
        {count} 场活动
      </Text>

      {anyVenueHasMultiple ? (
        groupEventsByVenue(events).map((venueGroup) =>
          venueGroup.events.length > 1 ? (
            <View key={venueGroup.tenantId} style={styles.venueBlock}>
              <View style={styles.venueHeader}>
                <Text style={styles.venueName} numberOfLines={1} ellipsizeMode="tail">
                  {venueGroup.name}
                </Text>
                <Text style={styles.venueCount}>{venueGroup.events.length} 场</Text>
              </View>
              <View style={styles.eventStack}>
                {venueGroup.events.map((event) => (
                  <EventListCard key={event.id} event={event} showVenue={false} source={source} />
                ))}
              </View>
            </View>
          ) : (
            <View key={venueGroup.tenantId} style={styles.singleVenueCard}>
              <EventListCard event={venueGroup.events[0]} showVenue source={source} />
            </View>
          )
        )
      ) : (
        <View style={styles.eventStack}>
          {events.map((event) => (
            <EventListCard key={event.id} event={event} showVenue={!hideVenue} source={source} />
          ))}
        </View>
      )}
    </View>
  )
}

function groupEventsByVenue(events: PublicEventRow[]) {
  return events.reduce<
    {
      tenantId: string
      name: string
      events: PublicEventRow[]
    }[]
  >((groups, event) => {
    const existing = groups.find((group) => group.tenantId === event.tenant_id)

    if (existing) {
      existing.events.push(event)
      return groups
    }

    groups.push({
      tenantId: event.tenant_id,
      name: event.tenant_display_name,
      events: [event],
    })

    return groups
  }, [])
}

const styles = StyleSheet.create({
  group: {
    marginTop: 40,
  },
  groupCompact: {
    marginTop: 28,
  },
  groupTitle: {
    ...typography.title,
    color: palette.tungsten,
    fontSize: 18,
    lineHeight: 25,
    letterSpacing: 0,
    fontWeight: '500',
  },
  groupSub: {
    ...typography.caption,
    color: 'rgba(245,238,225,0.42)',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  groupSubCompact: {
    marginBottom: spacing.md,
  },
  venueBlock: {
    marginBottom: spacing.lg,
  },
  singleVenueCard: {
    marginBottom: BEER_CARD_GAP,
  },
  venueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  venueName: {
    ...typography.title,
    color: palette.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    flex: 1,
    minWidth: 0,
  },
  venueCount: {
    ...typography.micro,
    color: palette.tungsten,
    flexShrink: 0,
  },
  eventStack: {
    gap: BEER_CARD_GAP,
  },
})
