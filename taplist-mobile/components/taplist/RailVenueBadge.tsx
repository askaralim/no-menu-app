import { BlurView } from 'expo-blur'
import { StyleSheet, Text } from 'react-native'

import { railVenueBadgeStyle, railVenueLabelStyle } from '@/components/taplist/railCardStyle'
import { typography } from '@/constants/design'

type RailVenueBadgeProps = {
  name: string
}

export function RailVenueBadge({ name }: RailVenueBadgeProps) {
  return (
    <BlurView intensity={24} tint="dark" style={styles.badge}>
      <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">
        @ {name}
      </Text>
    </BlurView>
  )
}

const styles = StyleSheet.create({
  badge: railVenueBadgeStyle,
  label: {
    ...typography.label,
    ...railVenueLabelStyle,
  },
})
