import { useEffect, useState } from 'react'
import {
  Image,
  type ImageResizeMode,
  type ImageStyle,
  type StyleProp,
} from 'react-native'
import { defaultBeerArtwork } from './defaultBeerArtwork'
import { withOssImageStyle, type OssImageStyle } from '../../lib/ossImageUrl'

type Props = {
  imageUrl?: string | null
  resizeMode?: ImageResizeMode
  style: StyleProp<ImageStyle>
  onLoadEnd?: () => void
  ossStyle?: OssImageStyle
}

export function BeerArtworkImage({
  imageUrl,
  resizeMode = 'cover',
  style,
  onLoadEnd,
  ossStyle = 'nm-thumb',
}: Props) {
  const normalizedUrl = withOssImageStyle(imageUrl, ossStyle)
  const [failed, setFailed] = useState(false)
  const useRemote = !!normalizedUrl && !failed

  useEffect(() => {
    setFailed(false)
  }, [normalizedUrl])

  return (
    <Image
      source={useRemote ? { uri: normalizedUrl } : defaultBeerArtwork}
      defaultSource={useRemote ? defaultBeerArtwork : undefined}
      style={style}
      resizeMode={resizeMode}
      onError={() => {
        if (useRemote) setFailed(true)
        onLoadEnd?.()
      }}
      onLoadEnd={onLoadEnd}
    />
  )
}
