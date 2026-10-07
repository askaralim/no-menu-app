import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Image, Platform, StyleSheet, Text, View } from 'react-native'
import ViewShot from 'react-native-view-shot'
import type { DraftDrink } from '../../lib/taplistOwnerApi'
import {
  breweryName,
  displayDrinkName,
  drinkShareDescription,
  posterDate,
  posterTapLabel,
  sharePrices,
  styleAndAbvValue,
} from '../../lib/tonightShare'
import { BeerArtworkImage } from './BeerArtworkImage'

export type TonightSharePosterHandle = {
  capture: () => Promise<string | undefined>
}

type Props = {
  barName: string
  drinks: DraftDrink[]
  showPrices: boolean
  qrImageUrl?: string | null
  onReadyChange?: (ready: boolean) => void
  onQrLoadError?: () => void
}

const POSTER_WIDTH = 390
const POSTER_HEIGHT = 520
const CAPTURE_WIDTH = 1080
const CAPTURE_HEIGHT = 1440
const HEADER_HEIGHT = 51
const FOOTER_HEIGHT = 57
const LIST_HEIGHT = POSTER_HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT
const LIST_PAD_X = 18
const NUMBER_COL_WIDTH = 40
const COPY_GAP = 11
const QR_SIZE = 56
const SINGLE_ART_SIZE = 258

const SANS_FONT = Platform.select({
  ios: 'PingFangSC-Regular',
  android: 'sans-serif',
  default: 'sans-serif',
})
const SANS_MEDIUM_FONT = Platform.select({
  ios: 'PingFangSC-Medium',
  android: 'sans-serif-medium',
  default: 'sans-serif',
})
const LATIN_DISPLAY_FONT = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'serif',
})

type TypeScale = {
  artSize: number
  number: number
  numberLH: number
  brewery: number
  breweryLH: number
  name: number
  nameLH: number
  nameLines: number
  meta: number
  metaLH: number
  desc: number
  descLH: number
  descLines: number
  prices: number
  pricesLH: number
}

const TYPE_BY_COUNT: Record<2 | 3 | 4 | 5, TypeScale> = {
  2: {
    artSize: 164,
    number: 17,
    numberLH: 22,
    brewery: 11,
    breweryLH: 15,
    name: 16,
    nameLH: 21,
    nameLines: 2,
    meta: 10,
    metaLH: 14,
    desc: 9,
    descLH: 13,
    descLines: 2,
    prices: 9,
    pricesLH: 13,
  },
  3: {
    artSize: 118,
    number: 16,
    numberLH: 21,
    brewery: 10.5,
    breweryLH: 14,
    name: 15,
    nameLH: 19,
    nameLines: 2,
    meta: 9.5,
    metaLH: 13,
    desc: 8.5,
    descLH: 12,
    descLines: 1,
    prices: 8.5,
    pricesLH: 12,
  },
  4: {
    artSize: 88,
    number: 15.5,
    numberLH: 20,
    brewery: 9.5,
    breweryLH: 12.5,
    name: 13.5,
    nameLH: 17,
    nameLines: 1,
    meta: 8.5,
    metaLH: 11.5,
    desc: 0,
    descLH: 0,
    descLines: 0,
    prices: 8,
    pricesLH: 11,
  },
  5: {
    artSize: 74,
    number: 15,
    numberLH: 19,
    brewery: 9,
    breweryLH: 12,
    name: 12.5,
    nameLH: 16,
    nameLines: 1,
    meta: 8,
    metaLH: 10.5,
    desc: 0,
    descLH: 0,
    descLines: 0,
    prices: 7.5,
    pricesLH: 10,
  },
}

function typeForCount(count: number): TypeScale {
  const normalized = Math.min(5, Math.max(2, count)) as 2 | 3 | 4 | 5
  return TYPE_BY_COUNT[normalized]
}

export const TonightSharePoster = forwardRef<TonightSharePosterHandle, Props>(
  function TonightSharePoster(
    { barName, drinks, showPrices, qrImageUrl, onReadyChange, onQrLoadError },
    ref,
  ) {
    const shotRef = useRef<ViewShot>(null)
    const loadedIds = useRef(new Set<string>())
    const drinkIdsRef = useRef(new Set<string>())
    const [loadedCount, setLoadedCount] = useState(0)
    const [loadedQrUrl, setLoadedQrUrl] = useState<string | null>(null)
    const [qrFailed, setQrFailed] = useState(false)
    const drinkKey = drinks.map((drink) => `${drink.id}:${drink.image_url || ''}`).join('|')
    const single = drinks.length === 1
    const rowHeight = LIST_HEIGHT / Math.max(1, drinks.length)
    const type = typeForCount(drinks.length)
    const artSize = Math.min(type.artSize, rowHeight - 7)
    const qrReady = !qrImageUrl || loadedQrUrl === qrImageUrl || qrFailed
    drinkIdsRef.current = new Set(drinks.map((drink) => drink.id))

    useEffect(() => {
      loadedIds.current = new Set()
      drinks.forEach((drink) => {
        if (!drink.image_url?.trim()) loadedIds.current.add(drink.id)
      })
      setLoadedCount(loadedIds.current.size)
      // drinks is keyed by drinkKey so artwork URL changes also reset readiness.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drinkKey])

    useEffect(() => {
      setQrFailed(false)
      setLoadedQrUrl(null)
    }, [qrImageUrl])

    useEffect(() => {
      onReadyChange?.(drinks.length > 0 && loadedCount >= drinks.length && qrReady)
    }, [drinks.length, loadedCount, onReadyChange, qrReady])

    const markLoaded = (id: string) => {
      if (!drinkIdsRef.current.has(id) || loadedIds.current.has(id)) return
      loadedIds.current.add(id)
      setLoadedCount(loadedIds.current.size)
    }

    useImperativeHandle(ref, () => ({
      capture: async () => (await shotRef.current?.capture?.()) ?? undefined,
    }))

    const rows = useMemo(
      () =>
        drinks.map((drink, index) => ({
          drink,
          index,
          description: drinkShareDescription(drink),
          prices: sharePrices(drink, showPrices),
        })),
      [drinks, showPrices],
    )
    const singleNameLines =
      rows[0] && displayDrinkName(rows[0].drink).length > 18 ? 2 : 1

    return (
      <ViewShot
        ref={shotRef}
        options={{ format: 'png', quality: 1, width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT }}
      >
        <View collapsable={false} style={styles.poster}>
          <View style={styles.header}>
            <Text
              style={styles.barName}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.68}
            >
              {barName}
            </Text>
            <View style={styles.headerMeta}>
              <Text style={styles.date}>{posterDate()}</Text>
              <Text style={styles.heading}>今晚上新</Text>
            </View>
            <View style={styles.headerRule} />
          </View>

          <View style={styles.list}>
            {single && rows[0] ? (
              <View style={styles.singleBody}>
                <View style={styles.singleHero}>
                  <View style={styles.singleNumberColumn}>
                    <Text style={styles.singleNumber} numberOfLines={1}>
                      {posterTapLabel(rows[0].drink, 0)}
                    </Text>
                  </View>
                  <View collapsable={false} style={styles.singleArtFrame}>
                    <BeerArtworkImage
                      imageUrl={rows[0].drink.image_url}
                      ossStyle="nm-poster"
                      style={styles.singleArt}
                      resizeMode="cover"
                      onLoadEnd={() => markLoaded(rows[0].drink.id)}
                    />
                  </View>
                </View>
                <View style={styles.singleInfo}>
                  <Text style={styles.singleBrewery} numberOfLines={1}>
                    {breweryName(rows[0].drink)}
                  </Text>
                  <Text style={styles.singleName} numberOfLines={2}>
                    {displayDrinkName(rows[0].drink)}
                  </Text>
                  <Text style={styles.singleMeta} numberOfLines={1}>
                    {styleAndAbvValue(rows[0].drink) || ' '}
                  </Text>
                  {rows[0].description ? (
                    <>
                      <View style={styles.singleCopyRule} />
                      <Text
                        style={styles.singleDescription}
                        numberOfLines={singleNameLines === 2 ? 2 : 3}
                      >
                        {rows[0].description}
                      </Text>
                    </>
                  ) : null}
                  {rows[0].prices.length ? (
                    <Text style={styles.singlePrices} numberOfLines={2}>
                      {rows[0].prices.join(' / ')}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : (
              rows.map(({ drink, index, description, prices }) => (
                <View
                  key={drink.id}
                  style={[
                    styles.row,
                    index < rows.length - 1 && styles.rowDivider,
                    { height: rowHeight },
                  ]}
                >
                  <View style={styles.numberColumn}>
                    <Text
                      style={[styles.number, { fontSize: type.number, lineHeight: type.numberLH }]}
                      numberOfLines={1}
                    >
                      {posterTapLabel(drink, index)}
                    </Text>
                  </View>
                  <View
                    collapsable={false}
                    style={[
                      styles.artworkFrame,
                      { width: artSize, height: artSize },
                    ]}
                  >
                    <BeerArtworkImage
                      imageUrl={drink.image_url}
                      ossStyle="nm-poster"
                      style={{ width: artSize, height: artSize }}
                      resizeMode="cover"
                      onLoadEnd={() => markLoaded(drink.id)}
                    />
                  </View>
                  <View style={[styles.copy, { minHeight: artSize }]}>
                    <Text
                      style={[styles.brewery, { fontSize: type.brewery, lineHeight: type.breweryLH }]}
                      numberOfLines={1}
                    >
                      {breweryName(drink)}
                    </Text>
                    <Text
                      style={[styles.drinkName, { fontSize: type.name, lineHeight: type.nameLH }]}
                      numberOfLines={type.nameLines}
                      adjustsFontSizeToFit={type.nameLines === 1}
                      minimumFontScale={0.68}
                    >
                      {displayDrinkName(drink)}
                    </Text>
                    <Text
                      style={[styles.meta, { fontSize: type.meta, lineHeight: type.metaLH }]}
                      numberOfLines={1}
                    >
                      {styleAndAbvValue(drink) || ' '}
                    </Text>
                    {description && type.descLines > 0 ? (
                      <Text
                        style={[
                          styles.description,
                          { fontSize: type.desc, lineHeight: type.descLH },
                        ]}
                        numberOfLines={type.descLines}
                      >
                        {description}
                      </Text>
                    ) : null}
                    {prices.length ? (
                      <Text
                        style={[
                          styles.prices,
                          { fontSize: type.prices, lineHeight: type.pricesLH },
                        ]}
                        numberOfLines={2}
                      >
                        {prices.join(' / ')}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={styles.footer}>
            <View style={[styles.footerRule, !qrImageUrl && styles.footerRuleWithoutQr]} />
            <Text style={styles.footerText}>No Menu</Text>
            {qrImageUrl && !qrFailed ? (
              <View style={styles.qrFrame}>
                <Image
                  source={{ uri: qrImageUrl }}
                  style={styles.qrImage}
                  resizeMode="contain"
                  onLoad={() => setLoadedQrUrl(qrImageUrl)}
                  onError={() => {
                    setQrFailed(true)
                    onQrLoadError?.()
                  }}
                />
              </View>
            ) : null}
          </View>
        </View>
      </ViewShot>
    )
  },
)

const PAPER = '#FFFFFF'
const INK = '#171512'
const ACCENT = '#8A641F'
const RELEASE_RED = '#B94A31'
const RULE = '#DDDAD4'
const FOOTER_GRAY = '#89857E'
const FRAME_RULE = 'rgba(119,115,107,0.58)'

const styles = StyleSheet.create({
  poster: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    backgroundColor: PAPER,
    overflow: 'hidden',
  },
  header: {
    height: HEADER_HEIGHT,
    paddingHorizontal: 18,
    paddingTop: 11,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  barName: {
    flex: 1,
    color: INK,
    fontFamily: SANS_MEDIUM_FONT,
    fontSize: 23,
    lineHeight: 30,
    letterSpacing: -0.35,
    paddingRight: 10,
  },
  headerMeta: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 7,
    paddingTop: 8,
  },
  date: {
    color: INK,
    fontFamily: LATIN_DISPLAY_FONT,
    fontSize: 7.2,
    lineHeight: 10,
    letterSpacing: 1.9,
  },
  heading: {
    color: RELEASE_RED,
    fontFamily: SANS_MEDIUM_FONT,
    fontSize: 11.5,
    lineHeight: 17,
    letterSpacing: 1.6,
  },
  headerRule: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 4,
    height: 1,
    backgroundColor: FRAME_RULE,
  },
  list: { height: LIST_HEIGHT, paddingHorizontal: LIST_PAD_X },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: RULE,
  },
  numberColumn: {
    width: NUMBER_COL_WIDTH,
    alignItems: 'flex-start',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  number: { color: ACCENT, fontFamily: SANS_MEDIUM_FONT },
  artworkFrame: {
    flexShrink: 0,
    overflow: 'hidden',
    backgroundColor: PAPER,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    marginLeft: COPY_GAP,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  singleBody: { flex: 1, paddingTop: 5, paddingBottom: 2 },
  singleHero: {
    height: SINGLE_ART_SIZE,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  singleNumberColumn: {
    width: 45,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  singleNumber: {
    color: ACCENT,
    fontFamily: SANS_MEDIUM_FONT,
    fontSize: 17,
    lineHeight: 22,
  },
  singleArtFrame: {
    width: SINGLE_ART_SIZE,
    height: SINGLE_ART_SIZE,
    flexShrink: 0,
    overflow: 'hidden',
    backgroundColor: PAPER,
  },
  singleArt: { width: SINGLE_ART_SIZE, height: SINGLE_ART_SIZE },
  singleInfo: { marginTop: 8 },
  singleBrewery: {
    color: ACCENT,
    fontFamily: SANS_FONT,
    fontSize: 10.5,
    lineHeight: 14,
  },
  singleName: {
    color: INK,
    fontFamily: SANS_MEDIUM_FONT,
    fontSize: 17,
    lineHeight: 21,
    marginTop: 1,
  },
  singleMeta: {
    color: INK,
    fontFamily: SANS_FONT,
    fontSize: 10.5,
    lineHeight: 15,
    marginTop: 1,
  },
  singleCopyRule: {
    width: '78%',
    height: 1,
    backgroundColor: 'rgba(74,77,81,0.42)',
    marginTop: 5,
    marginBottom: 5,
  },
  singleDescription: {
    width: '88%',
    color: INK,
    fontFamily: SANS_FONT,
    fontSize: 9,
    lineHeight: 12,
  },
  singlePrices: {
    color: ACCENT,
    fontFamily: SANS_FONT,
    fontSize: 8.5,
    lineHeight: 12,
    marginTop: 7,
  },
  brewery: { color: ACCENT, fontFamily: SANS_FONT },
  drinkName: { color: INK, fontFamily: SANS_MEDIUM_FONT, marginTop: 1 },
  meta: { color: INK, fontFamily: SANS_FONT, marginTop: 1 },
  description: { color: 'rgba(23,21,18,0.75)', fontFamily: SANS_FONT, marginTop: 2 },
  prices: { color: ACCENT, fontFamily: SANS_FONT, marginTop: 3, maxWidth: '100%' },
  footer: { height: FOOTER_HEIGHT, marginHorizontal: 18, position: 'relative' },
  footerRule: {
    position: 'absolute',
    left: 0,
    right: QR_SIZE + 11,
    top: QR_SIZE / 2,
    height: 1,
    backgroundColor: FRAME_RULE,
  },
  footerRuleWithoutQr: { right: 0 },
  footerText: {
    position: 'absolute',
    left: 0,
    top: QR_SIZE / 2 + 7,
    color: FOOTER_GRAY,
    fontFamily: LATIN_DISPLAY_FONT,
    fontSize: 8.2,
    lineHeight: 12,
  },
  qrFrame: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: QR_SIZE,
    height: QR_SIZE,
    padding: 2,
    backgroundColor: '#FFFFFF',
  },
  qrImage: { width: QR_SIZE - 4, height: QR_SIZE - 4 },
})
