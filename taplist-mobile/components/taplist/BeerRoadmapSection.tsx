import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'expo-router'
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import { palette, spacing, typography } from '@/constants/design'
import { fetchPublicBeerRoadmap } from '@/lib/api/taplist'
import { navigationUrlForLeg } from '@/lib/navigationLinks'
import type { BeerRoadmapLeg, BeerRoadmapRoute, BeerRoadmapStop } from '@/lib/types'

type BeerRoadmapSectionProps = {
  startTenantId: string | null | undefined
  enabled: boolean
}

export function BeerRoadmapSection({ startTenantId, enabled }: BeerRoadmapSectionProps) {
  const roadmapQuery = useQuery({
    queryKey: ['taplist', 'beer-roadmap', startTenantId],
    queryFn: () => fetchPublicBeerRoadmap(startTenantId!),
    enabled: enabled && !!startTenantId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const payload = roadmapQuery.data
  if (!payload || payload.ok !== true) return null

  return <BeerRoadmapRouteCard route={payload.route} />
}

function BeerRoadmapRouteCard({ route }: { route: BeerRoadmapRoute }) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>TONIGHT'S BEER ROUTE</Text>
        <Text style={styles.subtitle}>从这家开始，看看附近两家</Text>
      </View>

      <View style={styles.stopStack}>
        {route.stops.map((stop, index) => {
          const leg = index === 0 ? null : route.legs[index - 1]
          return (
            <RoadmapStopRow
              key={stop.tenantId}
              stop={stop}
              stopNumber={index + 1}
              leg={leg}
              stops={route.stops}
            />
          )
        })}
      </View>
    </View>
  )
}

function RoadmapStopRow({
  stop,
  stopNumber,
  leg,
  stops,
}: {
  stop: BeerRoadmapStop
  stopNumber: number
  leg: BeerRoadmapLeg | null
  stops: BeerRoadmapStop[]
}) {
  const navigationUrl =
    Platform.OS === 'ios' && leg ? navigationUrlForLeg(stops, leg) : null
  const newTapNames = stop.newTapNames.slice(0, 2)

  const handleOpenNavigation = () => {
    if (!navigationUrl) return
    void Linking.openURL(navigationUrl).catch((error) => {
      console.warn('Open Apple Maps navigation failed', error)
    })
  }

  return (
    <View style={styles.stopRow}>
      <View style={styles.stopNumberColumn}>
        <Text style={styles.stopNumber}>{String(stopNumber).padStart(2, '0')}</Text>
        {stopNumber < 3 ? <View style={styles.stopLine} /> : null}
      </View>

      <View style={styles.stopContent}>
        <Text style={styles.stopName}>{stop.displayName}</Text>

        {newTapNames.length > 0 ? (
          <View style={styles.newTapBlock}>
            <Text style={styles.newTapLabel}>NEW ON TAP</Text>
            {newTapNames.map((name) => (
              <Text key={name} style={styles.newTapName} numberOfLines={1} ellipsizeMode="tail">
                {name}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <Link href={`/bar/${stop.tenantSlug}`} asChild>
            <Pressable style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}>
              <Text style={styles.textButtonLabel}>查看酒单</Text>
            </Pressable>
          </Link>

          {navigationUrl ? (
            <Pressable
              accessibilityLabel={`打开 Apple Maps 导航到 ${stop.displayName}`}
              onPress={handleOpenNavigation}
              style={({ pressed }) => [styles.navButton, pressed && styles.navButtonPressed]}>
              <FontAwesome name="location-arrow" size={12} color={palette.background} />
              <Text style={styles.navButtonLabel}>打开 Apple Maps</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.xl,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(198,168,117,0.18)',
    paddingVertical: spacing.lg,
  },
  header: {
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.display,
    color: palette.tungsten,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: 1.2,
  },
  subtitle: {
    ...typography.caption,
    color: 'rgba(245,238,225,0.48)',
    marginTop: spacing.xxs,
  },
  stopStack: {
    gap: spacing.md,
  },
  stopRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  stopNumberColumn: {
    width: 34,
    alignItems: 'center',
  },
  stopNumber: {
    ...typography.display,
    color: palette.amber,
    fontSize: 24,
    lineHeight: 28,
  },
  stopLine: {
    flex: 1,
    width: 1,
    marginTop: spacing.xs,
    backgroundColor: 'rgba(198,168,117,0.18)',
  },
  stopContent: {
    flex: 1,
    minWidth: 0,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,241,230,0.08)',
    backgroundColor: 'rgba(21,21,21,0.48)',
    padding: spacing.md,
  },
  stopName: {
    ...typography.title,
    color: palette.text,
    fontSize: 19,
    lineHeight: 25,
  },
  newTapBlock: {
    marginTop: spacing.md,
    gap: 2,
  },
  newTapLabel: {
    ...typography.label,
    color: palette.amber,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1.4,
  },
  newTapName: {
    ...typography.caption,
    color: palette.text,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  textButton: {
    minHeight: 34,
    justifyContent: 'center',
  },
  textButtonPressed: {
    opacity: 0.72,
  },
  textButtonLabel: {
    ...typography.label,
    color: palette.amber,
    fontSize: 11,
  },
  navButton: {
    minHeight: 34,
    borderRadius: 17,
    backgroundColor: palette.amber,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  navButtonPressed: {
    opacity: 0.82,
  },
  navButtonLabel: {
    ...typography.caption,
    color: palette.background,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
})
