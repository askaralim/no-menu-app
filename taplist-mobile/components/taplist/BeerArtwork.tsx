import { StyleSheet, Text, View } from 'react-native'

import { CachedImage } from '@/components/taplist/CachedImage'
import { palette, typography } from '@/constants/design'

type BeerArtworkProps = {
  name: string
  source?: string | null
  size?: number
}

export function BeerArtwork({ name, source, size = 64 }: BeerArtworkProps) {
  if (source) {
    return <CachedImage source={source} style={[styles.image, { width: size, height: size }]} />
  }

  return (
    <View style={[styles.placeholder, { width: size, height: size }]}>
      <Text style={styles.placeholderText}>{name.slice(0, 1) || '酒'}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  image: {
    borderRadius: 7,
    backgroundColor: palette.panelElevated,
  },
  placeholder: {
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.darkOlive,
    borderWidth: 1,
    borderColor: 'rgba(217,164,65,0.20)',
  },
  placeholderText: {
    ...typography.display,
    color: palette.amber,
    fontSize: 22,
  },
})
