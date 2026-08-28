import { useEffect, useState } from 'react'
import {
  Image,
  type ImageResizeMode,
  type ImageStyle,
  type StyleProp,
} from 'react-native'
import { defaultBeerArtwork } from './defaultBeerArtwork'

type Props = {
  imageUrl?: string | null
  resizeMode?: ImageResizeMode
  style: StyleProp<ImageStyle>
  onLoadEnd?: () => void
}

export function BeerArtworkImage({
  imageUrl,
  resizeMode = 'cover',
  style,
  onLoadEnd,
}: Props) {
  const normalizedUrl = imageUrl?.trim() || null
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
