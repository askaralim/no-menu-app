import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import { palette, spacing, typography } from '@/constants/design'
import { fetchPublicBeerRoadmap } from '@/lib/api/taplist'
import { navigationUrlForLeg } from '@/lib/navigationLinks'
import type { BeerRoadmapLeg, BeerRoadmapRoute, BeerRoadmapStop } from '@/lib/types'
import { trackEvent } from '@/lib/analytics'

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
  const startBarName = route.stops[0].displayName

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>TONIGHT'S BEER ROUTE</Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          从「{startBarName}」开始，看看附近两家
        </Text>
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
  const router = useRouter()
  const navigationUrl =
    Platform.OS === 'ios' && leg ? navigationUrlForLeg(stops, leg) : null
  const showActions = !isStart

  const handleOpenMenu = () => {
    trackEvent('bar_opened', {
      tenant_id: stop.tenantId,
      tenant_slug: stop.tenantSlug,
      source: 'beer_route',
    })
    router.push(`/bar/${stop.tenantSlug}`)
  }

  const handleOpenNavigation = () => {
    if (!navigationUrl) return
    trackEvent('apple_maps_opened', {
      start_tenant_id: stops[0]?.tenantId,
      destination_tenant_id: stop.tenantId,
    })
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

      <View style={[styles.stopContent, isStart && styles.startStopContent]}>
        <Text style={styles.stopName}>{stop.displayName}</Text>

        {showActions ? (
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`查看 ${stop.displayName} 酒单`}
              onPress={handleOpenMenu}
              style={({ pressed }) => [styles.menuButton, pressed && styles.menuButtonPressed]}>
              <Text style={styles.menuButtonLabel}>查看酒单</Text>
            </Pressable>

            {navigationUrl ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`打开 Apple Maps 导航到 ${stop.displayName}`}
                onPress={handleOpenNavigation}
                style={({ pressed }) => [styles.navButton, pressed && styles.navButtonPressed]}>
                <FontAwesome name="location-arrow" size={12} color="#E1A94F" />
                <Text style={styles.navButtonLabel}>打开 Apple Maps</Text>
              </Pressable>
            ) : (
              <View style={styles.navButtonSpacer} />
            )}
          </View>
        ) : null}
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
  startStopContent: {
    paddingVertical: spacing.sm,
  },
  stopName: {
    ...typography.title,
    color: palette.text,
    fontSize: 19,
    lineHeight: 25,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  menuButton: {
    flexShrink: 0,
    minHeight: 36,
    borderRadius: 18,
    backgroundColor: '#E1A94F',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonPressed: {
    opacity: 0.86,
  },
  menuButtonLabel: {
    ...typography.caption,
    color: '#0D0D0D',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
  },
  navButton: {
    flexShrink: 1,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xxs,
    paddingLeft: spacing.sm,
  },
  navButtonSpacer: {
    width: 1,
  },
  navButtonPressed: {
    opacity: 0.65,
  },
  navButtonLabel: {
    ...typography.caption,
    color: '#E1A94F',
    fontSize: 12,
    lineHeight: 16,
  },
})
