import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'expo-router'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'

import { AMAP_ROUTE_ATTRIBUTION } from '@/constants/compliance'
import { palette, spacing, typography } from '@/constants/design'
import { fetchPublicBeerRoadmap } from '@/lib/api/taplist'
import { navigationUrlForLeg } from '@/lib/amapUri'
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
        <Text style={styles.subtitle}>今晚三站</Text>
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
              isStart={index === 0}
            />
          )
        })}
      </View>

      <Text style={styles.attribution}>{AMAP_ROUTE_ATTRIBUTION}</Text>
    </View>
  )
}

function RoadmapStopRow({
  stop,
  stopNumber,
  leg,
  stops,
  isStart,
}: {
  stop: BeerRoadmapStop
  stopNumber: number
  leg: BeerRoadmapLeg | null
  stops: BeerRoadmapStop[]
  isStart: boolean
}) {
  const navigationUrl = leg ? navigationUrlForLeg(stops, leg) : null
  const minutes = leg ? Math.max(1, Math.round(leg.walkingDurationS / 60)) : null
  const distance = leg ? formatDistance(leg.walkingDistanceM) : null
  const meta = [minutes ? `${minutes} 分钟步行` : null, distance, stop.openUntilLabel].filter(Boolean).join(' · ')
  const newTapNames = stop.newTapNames.slice(0, 2)

  const handleOpenNavigation = () => {
    if (!navigationUrl) return
    void Linking.openURL(navigationUrl).catch((error) => {
      console.warn('Open AMap navigation failed', error)
    })
  }

  return (
    <View style={styles.stopRow}>
      <View style={styles.stopNumberColumn}>
        <Text style={styles.stopNumber}>{String(stopNumber).padStart(2, '0')}</Text>
        {stopNumber < 3 ? <View style={styles.stopLine} /> : null}
      </View>

      <View style={styles.stopContent}>
        {isStart ? <Text style={styles.startLabel}>从这里开始</Text> : null}
        <Text style={styles.stopName}>{stop.displayName}</Text>
        {meta ? <Text style={styles.stopMeta}>{meta}</Text> : null}

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
              accessibilityLabel={`打开到 ${stop.displayName} 的高德步行导航`}
              onPress={handleOpenNavigation}
              style={({ pressed }) => [styles.navButton, pressed && styles.navButtonPressed]}>
              <FontAwesome name="location-arrow" size={12} color={palette.background} />
              <Text style={styles.navButtonLabel}>高德步行导航</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  )
}

function formatDistance(meters: number) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`
  return `${Math.round(meters)}m`
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
  startLabel: {
    ...typography.micro,
    color: palette.faint,
    marginBottom: spacing.xxs,
  },
  stopName: {
    ...typography.title,
    color: palette.text,
    fontSize: 19,
    lineHeight: 25,
  },
  stopMeta: {
    ...typography.caption,
    color: palette.muted,
    marginTop: spacing.xxs,
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
  attribution: {
    ...typography.micro,
    color: palette.faint,
    marginTop: spacing.lg,
  },
})
