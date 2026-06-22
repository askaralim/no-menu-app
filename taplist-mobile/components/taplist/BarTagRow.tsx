import { StyleSheet, Text, View } from 'react-native'

import { palette, spacing, typography } from '@/constants/design'
import type { PublicBarTag } from '@/lib/types'

type BarTagRowProps = {
  tags: PublicBarTag[]
}

export function BarTagRow({ tags }: BarTagRowProps) {
  if (tags.length === 0) return null

  return (
    <View style={styles.row}>
      {tags.map((tag) => (
        <View key={tag.key} style={styles.pill}>
          <Text style={styles.label}>{tag.label}</Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
  },
  pill: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(245,241,232,0.06)',
    backgroundColor: 'rgba(17,17,17,0.28)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  label: {
    ...typography.caption,
    color: palette.muted,
  },
})
