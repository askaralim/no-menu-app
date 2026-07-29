import { StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

import { CachedImageBackground } from '@/components/taplist/CachedImage'
import { palette, spacing } from '@/constants/design'

type AtmosphereImageProps = {
  source?: string | null
  height?: number
  aspectRatio?: number
  overlayOpacity?: number
  scrimOpacity?: number
  children?: React.ReactNode
  borderRadius?: number
}

export function AtmosphereImage({
  source,
  height,
  aspectRatio,
  overlayOpacity = 0.36,
  scrimOpacity = 1,
  children,
  borderRadius = 8,
}: AtmosphereImageProps) {
  const frameStyle = [
    styles.frame,
    height ? { height } : null,
    aspectRatio ? { aspectRatio } : null,
    { borderRadius },
  ]

  if (!source) {
    return (
      <View style={[frameStyle, styles.placeholder]}>
        <LinearGradient
          colors={[
            `rgba(75,54,31,${overlayOpacity})`,
            `rgba(13,13,13,${0.78 * scrimOpacity})`,
            `rgba(13,13,13,${1 * scrimOpacity})`,
          ]}
          style={styles.tint}>
          <View pointerEvents="none" style={styles.grain} />
          {children}
        </LinearGradient>
      </View>
    )
  }

  return (
    <CachedImageBackground source={source} style={frameStyle} imageStyle={{ borderRadius }}>
      <LinearGradient
        colors={[
          `rgba(75,54,31,${overlayOpacity})`,
          `rgba(13,13,13,${0.52 * scrimOpacity})`,
          `rgba(13,13,13,${1 * scrimOpacity})`,
        ]}
        style={styles.tint}>
        <View pointerEvents="none" style={styles.grain} />
        {children}
      </LinearGradient>
    </CachedImageBackground>
  )
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: palette.panelElevated,
  },
  imageRadius: {
    borderRadius: 8,
  },
  placeholder: {
    backgroundColor: palette.panelElevated,
  },
  tint: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  grain: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.12,
    backgroundColor: 'rgba(245,241,232,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(245,241,232,0.04)',
  },
})
