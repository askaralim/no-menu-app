import { StyleSheet } from 'react-native'
import type { ImageProps } from 'expo-image'

import { CachedImage } from '@/components/taplist/CachedImage'
import { defaultBeerArtwork } from '@/components/taplist/defaultBeerArtwork'
import { palette } from '@/constants/design'

type BeerArtworkProps = {
  name: string
  source?: ImageProps['source'] | null
  size?: number
}

export function BeerArtwork({ name, source, size = 64 }: BeerArtworkProps) {
  return (
    <CachedImage
      accessibilityLabel={source ? `${name}酒款图片` : `${name}默认酒款图片`}
      source={source || defaultBeerArtwork}
      style={[styles.image, { width: size, height: size }]}
    />
  )
}

const styles = StyleSheet.create({
  image: {
    borderRadius: 7,
    backgroundColor: palette.panelElevated,
  },
})
