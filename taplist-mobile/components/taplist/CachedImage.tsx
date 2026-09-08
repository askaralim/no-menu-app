import { Image, type ImageProps } from 'expo-image'
import { StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native'

import { withOssImageStyle, type OssImageStyle } from '@/lib/ossImageUrl'

type CachedImageProps = Omit<ImageProps, 'source'> & {
  source: ImageProps['source']
  ossStyle?: OssImageStyle
}

type CachedImageBackgroundProps = CachedImageProps & {
  children?: React.ReactNode
  imageStyle?: StyleProp<ImageStyle>
}

function styledSource(source: ImageProps['source'], ossStyle?: OssImageStyle): ImageProps['source'] {
  if (!ossStyle || typeof source !== 'string') return source
  return withOssImageStyle(source, ossStyle) || source
}

export function CachedImage({ source, ossStyle, ...props }: CachedImageProps) {
  return <Image cachePolicy="memory-disk" contentFit="cover" source={styledSource(source, ossStyle)} {...props} />
}

export function CachedImageBackground({
  children,
  imageStyle,
  ossStyle,
  source,
  style,
  ...props
}: CachedImageBackgroundProps) {
  return (
    <View style={style}>
      <CachedImage
        source={source}
        ossStyle={ossStyle}
        {...props}
        style={[StyleSheet.absoluteFillObject, imageStyle]}
      />
      {children}
    </View>
  )
}
