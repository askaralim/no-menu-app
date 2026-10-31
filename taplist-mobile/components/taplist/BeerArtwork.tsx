import { StyleSheet } from 'react-native'
import type { ImageProps } from 'expo-image'

import { CachedImage } from '@/components/taplist/CachedImage'
import { defaultBeerArtwork } from '@/components/taplist/defaultBeerArtwork'
import { palette } from '@/constants/design'
import { tr, useLanguage } from '@/lib/i18n'

type BeerArtworkProps = {
  name: string
  source?: ImageProps['source'] | null
  size?: number
}

export function BeerArtwork({ name, source, size = 64 }: BeerArtworkProps) {
  const { language } = useLanguage()
  return (
    <CachedImage
      accessibilityLabel={source ? tr(language, `${name}酒款图片`, `${name} beer image`) : tr(language, `${name}默认酒款图片`, `${name} default beer image`)}
      ossStyle={size <= 96 ? 'nm-thumb' : 'nm-card'}
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
