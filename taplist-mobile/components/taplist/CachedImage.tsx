import { Image, type ImageProps } from 'expo-image'
import { StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native'

type CachedImageProps = Omit<ImageProps, 'source'> & {
  source: ImageProps['source']
}

type CachedImageBackgroundProps = CachedImageProps & {
  children?: React.ReactNode
  imageStyle?: StyleProp<ImageStyle>
}

export function CachedImage({ source, ...props }: CachedImageProps) {
  return <Image cachePolicy="memory-disk" contentFit="cover" source={source} {...props} />
}

export function CachedImageBackground({
  children,
  imageStyle,
  source,
  style,
  ...props
}: CachedImageBackgroundProps) {
  return (
    <View style={style}>
      <CachedImage
        source={source}
        {...props}
        style={[StyleSheet.absoluteFillObject, imageStyle]}
      />
      {children}
    </View>
  )
}
