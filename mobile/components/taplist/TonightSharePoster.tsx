import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import ViewShot from 'react-native-view-shot'
import type { DraftDrink } from '../../lib/taplistOwnerApi'
import {
  breweryName,
  displayDrinkName,
  drinkShareDescription,
  posterDate,
  posterTapLabel,
  sharePrices,
  styleAndAbv,
} from '../../lib/tonightShare'
import { BeerArtworkImage } from './BeerArtworkImage'

export type TonightSharePosterHandle = {
  capture: () => Promise<string | undefined>
}

type Props = {
  barName: string
  drinks: DraftDrink[]
  showPrices: boolean
  onReadyChange?: (ready: boolean) => void
}

const POSTER_WIDTH = 390
const POSTER_HEIGHT = 520
const CAPTURE_WIDTH = 1080
const CAPTURE_HEIGHT = 1440
const HEADER_HEIGHT = 70
const FOOTER_HEIGHT = 38
const LIST_HEIGHT = POSTER_HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT
const LIST_PAD_X = 20
const NUMBER_COL_WIDTH = 52
const COPY_PAD_LEFT = 13
const COPY_MIN_WIDTH = 148

type TypeScale = {
  gutter: number
  artMax: number
  number: number
  numberLH: number
  brewery: number
  breweryLH: number
  name: number
  nameLH: number
  meta: number
  metaLH: number
  metaLines: number
  desc: number
  descLH: number
  descMargin: number
  prices: number
  pricesLH: number
}

const TYPE_BY_COUNT: Record<1 | 2 | 3 | 4 | 5, TypeScale> = {
  1: {
    gutter: 24,
    artMax: 148,
    number: 24,
    numberLH: 30,
    brewery: 12,
    breweryLH: 16,
    name: 23,
    nameLH: 29,
    meta: 12,
    metaLH: 16,
    metaLines: 2,
    desc: 12,
    descLH: 17,
    descMargin: 6,
    prices: 12,
    pricesLH: 16,
  },
  2: {
    gutter: 16,
    artMax: 108,
    number: 22,
    numberLH: 28,
    brewery: 11,
    breweryLH: 14,
    name: 20,
    nameLH: 25,
    meta: 11,
    metaLH: 15,
    metaLines: 1,
    desc: 11,
    descLH: 15,
    descMargin: 5,
    prices: 11,
    pricesLH: 14,
  },
  3: {
    gutter: 12,
    artMax: 118,
    number: 22,
    numberLH: 28,
    brewery: 10,
    breweryLH: 13,
    name: 19,
    nameLH: 24,
    meta: 10,
    metaLH: 14,
    metaLines: 1,
    desc: 10,
    descLH: 14,
    descMargin: 4,
    prices: 10,
    pricesLH: 13,
  },
  4: {
    gutter: 10,
    artMax: 88,
    number: 20,
    numberLH: 26,
    brewery: 10,
    breweryLH: 12,
    name: 16,
    nameLH: 21,
    meta: 10,
    metaLH: 13,
    metaLines: 1,
    desc: 10,
    descLH: 13,
    descMargin: 3,
    prices: 10,
    pricesLH: 13,
  },
  5: {
    gutter: 8,
    artMax: 70,
    number: 18,
    numberLH: 23,
    brewery: 9,
    breweryLH: 11,
    name: 15,
    nameLH: 19,
    meta: 9,
    metaLH: 12,
    metaLines: 1,
    desc: 9,
    descLH: 12,
    descMargin: 3,
    prices: 9,
    pricesLH: 12,
  },
}

function typeForCount(count: number): TypeScale {
  const n = Math.min(5, Math.max(1, count)) as 1 | 2 | 3 | 4 | 5
  return TYPE_BY_COUNT[n]
}

function descriptionLineCount(
  copyHeight: number,
  type: TypeScale,
  hasPrices: boolean,
  hasDescription: boolean,
  maxLines: number,
) {
  if (!hasDescription) return 0
  const reservedTop =
    type.breweryLH + type.nameLH + type.metaLines * type.metaLH + type.descMargin
  const reservedBottom = hasPrices ? type.pricesLH : 0
  return Math.max(0, Math.min(maxLines, Math.floor((copyHeight - reservedTop - reservedBottom) / type.descLH)))
}

export const TonightSharePoster = forwardRef<TonightSharePosterHandle, Props>(
  function TonightSharePoster({ barName, drinks, showPrices, onReadyChange }, ref) {
    const shotRef = useRef<ViewShot>(null)
    const loadedIds = useRef(new Set<string>())
    const drinkIdsRef = useRef(new Set<string>())
    const [loadedCount, setLoadedCount] = useState(0)
    const drinkKey = drinks.map((drink) => drink.id).join('|')
    const count = Math.max(1, drinks.length)
    const type = typeForCount(drinks.length)
    const rowHeight = LIST_HEIGHT / count
    const maxArtByWidth =
      POSTER_WIDTH - LIST_PAD_X * 2 - NUMBER_COL_WIDTH - COPY_PAD_LEFT - COPY_MIN_WIDTH
    const artworkSize = Math.min(type.artMax, Math.max(48, rowHeight - type.gutter), maxArtByWidth)
    const copyHeight = artworkSize
    const contentInset = (rowHeight - artworkSize) / 2
    const single = drinks.length === 1
    drinkIdsRef.current = new Set(drinks.map((drink) => drink.id))

    useEffect(() => {
      loadedIds.current = new Set()
      drinks.forEach((drink) => {
        if (!drink.image_url?.trim()) loadedIds.current.add(drink.id)
      })
      setLoadedCount(loadedIds.current.size)
      onReadyChange?.(drinks.length > 0 && loadedIds.current.size >= drinks.length)
      // drinks is keyed by drinkKey
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drinkKey, onReadyChange])

    useEffect(() => {
      onReadyChange?.(drinks.length > 0 && loadedCount >= drinks.length)
    }, [loadedCount, drinks.length, onReadyChange])

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
        drinks.map((drink, index) => {
          const description = drinkShareDescription(drink)
          const prices = sharePrices(drink, showPrices)
          const lines = descriptionLineCount(
            copyHeight,
            type,
            prices.length > 0,
            !!description,
            8,
          )
          return { drink, index, description, prices, lines }
        }),
      [copyHeight, drinks, showPrices, type],
    )

    return (
      <ViewShot
        ref={shotRef}
        options={{ format: 'png', quality: 1, width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT }}
      >
        <View collapsable={false} style={styles.poster}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.barName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                {barName}
              </Text>
              <Text style={styles.heading}>今晚上新</Text>
            </View>
            <View style={styles.headerRule} />
          </View>

          <View style={styles.list}>
            {single && rows[0] ? (
              <View style={styles.singleBody}>
                <View collapsable={false} style={styles.singleArtFrame}>
                  <BeerArtworkImage
                    imageUrl={rows[0].drink.image_url}
                    style={styles.singleArt}
                    resizeMode="cover"
                    onLoadEnd={() => markLoaded(rows[0].drink.id)}
                  />
                </View>
                <Text style={styles.singleKicker} numberOfLines={1}>
                  {posterTapLabel(rows[0].drink, 0)} · {breweryName(rows[0].drink)}
                </Text>
                <Text style={styles.singleName} numberOfLines={1}>
                  {displayDrinkName(rows[0].drink)}
                </Text>
                <Text style={styles.singleMeta} numberOfLines={1}>
                  {styleAndAbv(rows[0].drink) || ' '}
                </Text>
                {rows[0].description ? (
                  <Text style={styles.singleDescription} numberOfLines={3}>
                    {rows[0].description}
                  </Text>
                ) : null}
                {rows[0].prices.length ? (
                  <Text style={styles.singlePrices} numberOfLines={1}>
                    {rows[0].prices.join(' / ')}
                  </Text>
                ) : null}
              </View>
            ) : (
              rows.map(({ drink, index, description, prices, lines }) => (
                <View key={drink.id} style={[styles.row, { height: rowHeight }]}>
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
                    style={[styles.artworkFrame, { width: artworkSize, height: artworkSize }]}
                  >
                    <BeerArtworkImage
                      imageUrl={drink.image_url}
                      style={{ width: artworkSize, height: artworkSize }}
                      resizeMode="cover"
                      onLoadEnd={() => markLoaded(drink.id)}
                    />
                  </View>
                  <View
                    style={[
                      styles.copy,
                      { height: copyHeight, marginTop: contentInset, marginBottom: contentInset },
                    ]}
                  >
                    <Text
                      style={[styles.brewery, { fontSize: type.brewery, lineHeight: type.breweryLH }]}
                      numberOfLines={1}
                    >
                      {breweryName(drink)}
                    </Text>
                    <Text
                      style={[styles.drinkName, { fontSize: type.name, lineHeight: type.nameLH }]}
                      numberOfLines={1}
                    >
                      {displayDrinkName(drink)}
                    </Text>
                    <Text
                      style={[
                        styles.meta,
                        {
                          fontSize: type.meta,
                          lineHeight: type.metaLH,
                          minHeight: type.metaLines * type.metaLH,
                        },
                      ]}
                      numberOfLines={type.metaLines}
                    >
                      {styleAndAbv(drink) || ' '}
                    </Text>
                    {description && lines > 0 ? (
                      <Text
                        style={[
                          styles.description,
                          {
                            fontSize: type.desc,
                            lineHeight: type.descLH,
                            marginTop: type.descMargin,
                          },
                        ]}
                        numberOfLines={lines}
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
                        numberOfLines={1}
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
            <Text style={styles.footerText}>No Menu · {posterDate()}</Text>
          </View>
        </View>
      </ViewShot>
    )
  },
)

const PAPER = '#F4EFE5'
const INK = '#16130F'
const ACCENT = '#B84A24'
const RULE = 'rgba(22,19,15,0.32)'

const styles = StyleSheet.create({
  poster: { width: POSTER_WIDTH, height: POSTER_HEIGHT, backgroundColor: PAPER, overflow: 'hidden' },
  header: { height: HEADER_HEIGHT, paddingHorizontal: 20, paddingTop: 15 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  barName: { flex: 1, color: INK, fontSize: 28, lineHeight: 35, fontWeight: '800' },
  headerRule: { height: 1, backgroundColor: INK, marginTop: 7 },
  heading: { flexShrink: 0, color: ACCENT, fontSize: 13, lineHeight: 18, letterSpacing: 3, fontWeight: '700' },
  list: { height: LIST_HEIGHT, paddingHorizontal: LIST_PAD_X },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: RULE },
  numberColumn: {
    width: NUMBER_COL_WIDTH,
    alignItems: 'flex-start',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  number: { color: INK, fontWeight: '700' },
  artworkFrame: { flexShrink: 0, overflow: 'hidden', backgroundColor: '#E7DFD1', borderWidth: 1, borderColor: RULE },
  copy: { flex: 1, minWidth: COPY_MIN_WIDTH, paddingLeft: COPY_PAD_LEFT, overflow: 'hidden' },
  singleBody: { flex: 1, paddingTop: 10, paddingBottom: 6 },
  singleArtFrame: {
    width: 220,
    height: 220,
    alignSelf: 'center',
    overflow: 'hidden',
    backgroundColor: '#E7DFD1',
    borderWidth: 1,
    borderColor: RULE,
    marginBottom: 12,
  },
  singleArt: { width: 220, height: 220 },
  singleKicker: { color: ACCENT, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  singleName: { color: INK, fontSize: 24, lineHeight: 30, fontWeight: '800', marginTop: 3 },
  singleMeta: { color: INK, fontSize: 12, lineHeight: 16, fontWeight: '600', marginTop: 3 },
  singleDescription: { color: INK, fontSize: 12, lineHeight: 17, marginTop: 8 },
  singlePrices: { color: ACCENT, textAlign: 'right', fontSize: 14, lineHeight: 18, fontWeight: '800', marginTop: 10 },
  brewery: { color: ACCENT, fontWeight: '700' },
  drinkName: { color: INK, fontWeight: '800' },
  meta: { color: INK, fontWeight: '600' },
  description: { color: INK, paddingRight: 2 },
  prices: { marginTop: 'auto', maxWidth: '100%', color: ACCENT, textAlign: 'right', fontWeight: '800', alignSelf: 'flex-end' },
  footer: { height: FOOTER_HEIGHT, marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footerText: { color: 'rgba(22,19,15,0.56)', fontSize: 8, letterSpacing: 0.2 },
})
