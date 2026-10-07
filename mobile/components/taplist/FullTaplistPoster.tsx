import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Image, Platform, StyleSheet, Text, View } from 'react-native'
import ViewShot from 'react-native-view-shot'

import type { DraftDrink } from '../../lib/taplistOwnerApi'
import { withOssImageStyle } from '../../lib/ossImageUrl'
import { breweryName, displayDrinkName, posterDate } from '../../lib/tonightShare'

export type FullTaplistTheme = 'dark' | 'light'
export type FullTaplistColumns = 1 | 2
export type FullTaplistOutput = 'pages' | 'long'
export type FullTaplistLayout = 'single' | 'double' | 'landscape'

export type FullTaplistPosterHandle = {
  captureAll: () => Promise<string[]>
}

type Props = {
  barName: string
  drinks: DraftDrink[]
  showPrices: boolean
  theme: FullTaplistTheme
  layout: FullTaplistLayout
  output: FullTaplistOutput
  qrImageUrl?: string | null
  onReadyChange?: (ready: boolean) => void
  onQrLoadError?: () => void
}

type Palette = ReturnType<typeof themePalette>
type PosterDrink = {
  drink: DraftDrink
  servingLines: string[]
  designHeight: number
}
type PosterPage = {
  layout: FullTaplistLayout
  captureWidth: number
  captureHeight: number
  contentHeight: number
  contentTop: number
  sidePadding: number
  columnGap: number
  rowCount: number
  columns: PosterDrink[][]
}

const PREVIEW_WIDTH = 390
const PAGE_WIDTH: Record<FullTaplistColumns, number> = { 1: 840, 2: 1240 }
const CONTENT_TOP = 144
const FOOTER_HEIGHT = 190
const SIDE_PADDING = 72
const COLUMN_GAP = 40
const BASE_ROW_HEIGHT: Record<FullTaplistColumns, number> = { 1: 176, 2: 240 }
const SERVING_LINE_HEIGHT: Record<FullTaplistColumns, number> = { 1: 24, 2: 27 }
const PAGE_CAPACITY: Record<FullTaplistColumns, number> = { 1: 6, 2: 12 }
const LANDSCAPE_PAGE_WIDTH = 1600
const LANDSCAPE_PAGE_HEIGHT = 1200
const LANDSCAPE_CONTENT_TOP = 124
const LANDSCAPE_CONTENT_HEIGHT = 922
const LANDSCAPE_FOOTER_HEIGHT = 154
const LANDSCAPE_SIDE_PADDING = 48
const LANDSCAPE_COLUMN_GAP = 24
const LANDSCAPE_COLUMNS = 4
const LANDSCAPE_MAX_ITEMS = 20
const LANDSCAPE_SIZES = {
  1: { minBaseHeight: 220, servingLineHeight: 34 },
  2: { minBaseHeight: 180, servingLineHeight: 30 },
  3: { minBaseHeight: 150, servingLineHeight: 28 },
  4: { minBaseHeight: 145, servingLineHeight: 24 },
  5: { minBaseHeight: 135, servingLineHeight: 20 },
} as const

const SANS = Platform.select({ ios: 'PingFangSC-Regular', android: 'sans-serif', default: 'sans-serif' })
const SANS_MEDIUM = Platform.select({ ios: 'PingFangSC-Medium', android: 'sans-serif-medium', default: 'sans-serif' })

const STATUS_LABELS: Record<DraftDrink['public_status'], string> = {
  new: '上新',
  available: '在售',
  low: '少量',
  sold_out: '售罄',
  coming_soon: '即将上新',
}

export const FullTaplistPoster = forwardRef<FullTaplistPosterHandle, Props>(
  function FullTaplistPoster(
    { barName, drinks, showPrices, theme, layout, output, qrImageUrl, onReadyChange, onQrLoadError },
    ref,
  ) {
    const shots = useRef<Array<ViewShot | null>>([])
    const loadedDrinkIds = useRef(new Set<string>())
    const currentDrinkIds = useRef(new Set<string>())
    const [loadedArtworkCount, setLoadedArtworkCount] = useState(0)
    const [loadedQrUrl, setLoadedQrUrl] = useState<string | null>(null)
    const [qrFailed, setQrFailed] = useState(false)
    const drinkKey = drinks.map((drink) => `${drink.id}:${drink.image_url || ''}`).join('|')
    const pages = useMemo(
      () => buildPosterPages(drinks, showPrices, layout, output),
      [drinks, layout, output, showPrices],
    )
    const palette = themePalette(theme)
    const onSaleCount = drinks.filter(
      (drink) => drink.public_status !== 'sold_out' && drink.public_status !== 'coming_soon',
    ).length
    const newCount = drinks.filter((drink) => drink.public_status === 'new').length

    currentDrinkIds.current = new Set(drinks.map((drink) => drink.id))

    useEffect(() => {
      loadedDrinkIds.current = new Set()
      setLoadedArtworkCount(0)
    }, [drinkKey])

    useEffect(() => {
      setLoadedQrUrl(null)
      setQrFailed(false)
    }, [qrImageUrl])

    useEffect(() => {
      const artworkReady = loadedArtworkCount >= drinks.length
      const qrReady = !qrImageUrl || loadedQrUrl === qrImageUrl || qrFailed
      onReadyChange?.(drinks.length > 0 && artworkReady && qrReady)
    }, [drinks.length, loadedArtworkCount, loadedQrUrl, onReadyChange, qrFailed, qrImageUrl])

    const markArtworkLoaded = useCallback((drinkId: string) => {
      if (!currentDrinkIds.current.has(drinkId) || loadedDrinkIds.current.has(drinkId)) return
      loadedDrinkIds.current.add(drinkId)
      setLoadedArtworkCount(loadedDrinkIds.current.size)
    }, [])

    useImperativeHandle(
      ref,
      () => ({
        captureAll: async () => {
          const uris: string[] = []
          for (let index = 0; index < pages.length; index += 1) {
            const uri = await shots.current[index]?.capture?.()
            if (uri) uris.push(uri)
          }
          return uris
        },
      }),
      [pages.length],
    )

    return (
      <View style={styles.pageStack}>
        {pages.map((page, pageIndex) => {
          const scale = PREVIEW_WIDTH / page.captureWidth
          const previewHeight = page.captureHeight * scale
          const countText = `${onSaleCount} 款在售${newCount ? ` · ${newCount} 款上新` : ''}`
          return (
            <View key={`${layout}:${output}:${pageIndex}`} style={styles.pageWrap}>
              {pages.length > 1 ? (
                <Text style={styles.pageLabel}>第 {pageIndex + 1} / {pages.length} 页</Text>
              ) : null}
              <ViewShot
                ref={(node) => {
                  shots.current[pageIndex] = node
                }}
                options={{
                  format: 'jpg',
                  quality: 0.94,
                  width: page.captureWidth,
                  height: page.captureHeight,
                }}
              >
                <View
                  collapsable={false}
                  style={[
                    styles.poster,
                    { height: previewHeight, backgroundColor: palette.background },
                  ]}
                >
                  <PosterHeader
                    barName={barName}
                    countText={countText}
                    palette={palette}
                    scale={scale}
                    contentTop={page.contentTop}
                    sidePadding={page.sidePadding}
                  />

                  <View
                    style={{
                      height: page.contentHeight * scale,
                      paddingHorizontal: page.sidePadding * scale,
                      flexDirection: 'row',
                      gap: page.columnGap * scale,
                    }}
                  >
                    {page.columns.map((column, columnIndex) => (
                      <View
                        key={`column-${columnIndex}`}
                        style={{ width: columnWidth(page.captureWidth, page.columns.length, page.sidePadding, page.columnGap) * scale }}
                      >
                        {column.map((item, rowIndex) => page.layout === 'landscape' ? (
                          <LandscapeDrinkRow
                            key={item.drink.id}
                            item={item}
                            rows={page.rowCount}
                            isLast={rowIndex === column.length - 1}
                            palette={palette}
                            scale={scale}
                            onArtworkLoaded={markArtworkLoaded}
                          />
                        ) : (
                          <PosterDrinkRow
                            key={item.drink.id}
                            item={item}
                            columns={page.layout === 'single' ? 1 : 2}
                            isLast={rowIndex === column.length - 1}
                            palette={palette}
                            scale={scale}
                            onArtworkLoaded={markArtworkLoaded}
                          />
                        ))}
                      </View>
                    ))}
                  </View>

                  <PosterFooter
                    pageIndex={pageIndex}
                    pageCount={pages.length}
                    palette={palette}
                    qrImageUrl={qrImageUrl}
                    qrFailed={qrFailed}
                    layout={page.layout}
                    scale={scale}
                    onQrLoad={() => setLoadedQrUrl(qrImageUrl || null)}
                    onQrLoadError={() => {
                      setQrFailed(true)
                      onQrLoadError?.()
                    }}
                  />
                </View>
              </ViewShot>
            </View>
          )
        })}
      </View>
    )
  },
)

function PosterHeader({ barName, countText, palette, scale, contentTop, sidePadding }: {
  barName: string
  countText: string
  palette: Palette
  scale: number
  contentTop: number
  sidePadding: number
}) {
  return (
    <View style={{ height: contentTop * scale, paddingHorizontal: sidePadding * scale, paddingTop: 27 * scale }}>
      <View style={styles.headerRow}>
        <Text
          style={[
            styles.barName,
            {
              color: palette.text,
              fontSize: 52 * scale,
              lineHeight: 62 * scale,
              paddingRight: 24 * scale,
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.62}
        >
          {barName}
        </Text>
        <View style={[styles.headerStats, { gap: 24 * scale, paddingTop: 17 * scale }]}>
          <Text style={[styles.headerDate, { color: palette.text, fontSize: 20 * scale, lineHeight: 26 * scale }]}>
            {posterDate()}
          </Text>
          <Text style={[styles.headerCount, { color: palette.muted, fontSize: 20 * scale, lineHeight: 26 * scale }]}>
            {countText}
          </Text>
        </View>
      </View>
      <View style={{
        position: 'absolute',
        left: sidePadding * scale,
        top: 112 * scale,
        width: 72 * scale,
        height: Math.max(1, 5 * scale),
        backgroundColor: palette.accent,
      }} />
    </View>
  )
}

function PosterDrinkRow({ item, columns, isLast, palette, scale, onArtworkLoaded }: {
  item: PosterDrink
  columns: FullTaplistColumns
  isLast: boolean
  palette: Palette
  scale: number
  onArtworkLoaded: (drinkId: string) => void
}) {
  const { drink, servingLines, designHeight } = item
  const single = columns === 1
  const artwork = single ? 116 : 132
  const numberWidth = single ? 66 : 58
  const soldOut = drink.public_status === 'sold_out'
  const abv = typeof drink.profile.abv === 'number' ? `${formatNumber(drink.profile.abv)}%` : ''
  const status = !servingLines.length && drink.public_status !== 'available'
    ? STATUS_LABELS[drink.public_status]
    : ''

  return (
    <View style={{
      height: designHeight * scale,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: isLast ? 0 : Math.max(1, scale),
      borderBottomColor: palette.rule,
    }}>
      <Text style={[
        styles.tapNumber,
        {
          width: numberWidth * scale,
          color: soldOut ? palette.sold : palette.accent,
          fontSize: (single ? 28 : 30) * scale,
          lineHeight: (single ? 36 : 38) * scale,
        },
      ]}>
        {String(drink.public_sort_order ?? 0).padStart(2, '0')}
      </Text>
      <PosterArtwork
        drinkId={drink.id}
        imageUrl={drink.image_url}
        size={artwork * scale}
        placeholderColor={palette.pale}
        onReady={onArtworkLoaded}
      />
      <View style={{ flex: 1, minWidth: 0, marginLeft: 24 * scale, justifyContent: 'center' }}>
        <Text style={[
          styles.drinkName,
          {
            color: soldOut ? palette.sold : palette.text,
            fontSize: (single ? 29 : 32) * scale,
            lineHeight: (single ? 36 : 39) * scale,
          },
        ]} numberOfLines={1}>
          {displayDrinkName(drink)}
        </Text>
        <Text style={[
          styles.drinkStyle,
          {
            color: palette.accent,
            fontSize: (single ? 22 : 24) * scale,
            lineHeight: (single ? 28 : 30) * scale,
            marginTop: (single ? 1 : 2) * scale,
          },
        ]} numberOfLines={1}>
          {drink.profile.beer_style?.trim() || ' '}
        </Text>
        <Text style={[
          styles.brewery,
          {
            color: palette.muted,
            fontSize: (single ? 20 : 21) * scale,
            lineHeight: (single ? 25 : 27) * scale,
            marginTop: (single ? 1 : 2) * scale,
          },
        ]} numberOfLines={1}>
          {breweryName(drink)}
        </Text>
        <Text style={[
          styles.abv,
          {
            color: palette.muted,
            fontSize: (single ? 18 : 20) * scale,
            lineHeight: (single ? 23 : 25) * scale,
            marginTop: (single ? 0 : 1) * scale,
          },
        ]} numberOfLines={1}>
          {abv || ' '}
        </Text>
        {servingLines.map((line, index) => (
          <Text key={`${index}:${line}`} style={[
            styles.serving,
            {
              color: palette.accent,
              fontSize: (single ? 19 : 21) * scale,
              lineHeight: SERVING_LINE_HEIGHT[columns] * scale,
            },
          ]} numberOfLines={1}>
            {line}
          </Text>
        ))}
        {status ? (
          <Text style={[
            styles.status,
            {
              color: soldOut ? palette.sold : palette.muted,
              fontSize: (single ? 18 : 20) * scale,
              lineHeight: SERVING_LINE_HEIGHT[columns] * scale,
            },
          ]}>
            {status}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

function LandscapeDrinkRow({ item, rows, isLast, palette, scale, onArtworkLoaded }: {
  item: PosterDrink
  rows: number
  isLast: boolean
  palette: Palette
  scale: number
  onArtworkLoaded: (drinkId: string) => void
}) {
  const { drink, servingLines, designHeight } = item
  const style = landscapeDrawStyle(rows)
  const soldOut = drink.public_status === 'sold_out'
  const abv = typeof drink.profile.abv === 'number' ? `${formatNumber(drink.profile.abv)}%` : ''
  const brewery = landscapeBreweryName(drink)
  const status = !servingLines.length && drink.public_status !== 'available'
    ? STATUS_LABELS[drink.public_status]
    : ''

  return (
    <View style={{
      height: designHeight * scale,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: isLast ? 0 : Math.max(1, scale),
      borderBottomColor: palette.rule,
    }}>
      <View style={{ width: style.numberWidth * scale, height: style.artwork * scale }}>
        <Text style={[
          styles.tapNumber,
          {
            color: soldOut ? palette.sold : palette.accent,
            fontSize: style.numberFont * scale,
            lineHeight: (style.numberFont + 6) * scale,
          },
        ]}>
          {String(drink.public_sort_order ?? 0).padStart(2, '0')}
        </Text>
      </View>
      <PosterArtwork
        drinkId={drink.id}
        imageUrl={drink.image_url}
        size={style.artwork * scale}
        placeholderColor={palette.pale}
        onReady={onArtworkLoaded}
      />
      <View style={{ flex: 1, minWidth: 0, marginLeft: style.gap * scale, justifyContent: 'center' }}>
        <Text style={[
          styles.drinkName,
          {
            color: soldOut ? palette.sold : palette.text,
            fontSize: style.nameFont * scale,
            lineHeight: style.nameLine * scale,
          },
        ]} numberOfLines={1}>
          {displayDrinkName(drink)}
        </Text>
        {drink.profile.beer_style?.trim() ? (
          <Text style={[
            styles.drinkStyle,
            { color: palette.accent, fontSize: style.styleFont * scale, lineHeight: style.styleLine * scale },
          ]} numberOfLines={1}>
            {drink.profile.beer_style.trim()}
          </Text>
        ) : null}
        {brewery ? (
          <Text style={[
            styles.brewery,
            { color: palette.muted, fontSize: style.breweryFont * scale, lineHeight: style.breweryLine * scale },
          ]} numberOfLines={1}>
            {brewery}
          </Text>
        ) : null}
        {abv ? (
          <Text style={[
            styles.abv,
            { color: palette.muted, fontSize: style.abvFont * scale, lineHeight: style.abvLine * scale },
          ]} numberOfLines={1}>
            {abv}
          </Text>
        ) : null}
        {servingLines.map((line, index) => (
          <Text key={`${index}:${line}`} style={[
            styles.serving,
            { color: palette.accent, fontSize: style.servingFont * scale, lineHeight: style.servingLine * scale },
          ]} numberOfLines={1}>
            {line}
          </Text>
        ))}
        {status ? (
          <Text style={[
            styles.status,
            { color: soldOut ? palette.sold : palette.muted, fontSize: style.abvFont * scale, lineHeight: style.servingLine * scale },
          ]} numberOfLines={1}>
            {status}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

function landscapeDrawStyle(rows: number) {
  if (rows <= 1) return { artwork: 180, numberWidth: 52, gap: 24, numberFont: 30, nameFont: 42, nameLine: 50, styleFont: 28, styleLine: 34, breweryFont: 24, breweryLine: 30, abvFont: 22, abvLine: 28, servingFont: 24, servingLine: 34 }
  if (rows === 2) return { artwork: 146, numberWidth: 46, gap: 20, numberFont: 27, nameFont: 34, nameLine: 42, styleFont: 24, styleLine: 30, breweryFont: 21, breweryLine: 27, abvFont: 19, abvLine: 25, servingFont: 21, servingLine: 30 }
  if (rows === 3) return { artwork: 112, numberWidth: 40, gap: 18, numberFont: 24, nameFont: 30, nameLine: 36, styleFont: 22, styleLine: 28, breweryFont: 20, breweryLine: 25, abvFont: 18, abvLine: 23, servingFont: 20, servingLine: 28 }
  if (rows === 4) return { artwork: 92, numberWidth: 36, gap: 16, numberFont: 22, nameFont: 26, nameLine: 32, styleFont: 19, styleLine: 24, breweryFont: 17, breweryLine: 22, abvFont: 16, abvLine: 20, servingFont: 18, servingLine: 24 }
  return { artwork: 76, numberWidth: 34, gap: 14, numberFont: 20, nameFont: 23, nameLine: 29, styleFont: 17, styleLine: 23, breweryFont: 16, breweryLine: 21, abvFont: 15, abvLine: 20, servingFont: 16, servingLine: 20 }
}

function landscapeBreweryName(drink: DraftDrink): string {
  const primary = (drink.profile.brewery || drink.brand_name || '').trim()
  const collabs = (drink.profile.collab_breweries ?? [])
    .map((name) => name.trim())
    .filter((name) => name && name !== primary)
    .slice(0, 3)
  return [primary, ...collabs].filter(Boolean).join(' × ')
}

function PosterArtwork({ drinkId, imageUrl, size, placeholderColor, onReady }: {
  drinkId: string
  imageUrl?: string | null
  size: number
  placeholderColor: string
  onReady: (drinkId: string) => void
}) {
  const sourceUrl = withOssImageStyle(imageUrl, 'nm-poster')
  const [failed, setFailed] = useState(false)
  const readyRef = useRef(false)

  useEffect(() => {
    readyRef.current = false
    setFailed(false)
    if (!sourceUrl) {
      readyRef.current = true
      onReady(drinkId)
      return
    }
    const timeout = setTimeout(() => {
      if (readyRef.current) return
      readyRef.current = true
      setFailed(true)
      onReady(drinkId)
    }, 8000)
    return () => clearTimeout(timeout)
  }, [drinkId, onReady, sourceUrl])

  return (
    <View style={{ width: size, height: size, overflow: 'hidden', backgroundColor: placeholderColor }}>
      {sourceUrl && !failed ? (
        <Image
          source={{ uri: sourceUrl }}
          resizeMode="cover"
          style={{ width: size, height: size }}
          onLoad={() => {
            readyRef.current = true
            onReady(drinkId)
          }}
          onError={() => {
            readyRef.current = true
            setFailed(true)
            onReady(drinkId)
          }}
        />
      ) : null}
    </View>
  )
}

function PosterFooter({ pageIndex, pageCount, palette, qrImageUrl, qrFailed, layout, scale, onQrLoad, onQrLoadError }: {
  pageIndex: number
  pageCount: number
  palette: Palette
  qrImageUrl?: string | null
  qrFailed: boolean
  layout: FullTaplistLayout
  scale: number
  onQrLoad: () => void
  onQrLoadError: () => void
}) {
  const landscape = layout === 'landscape'
  const qrSize = landscape ? 96 : layout === 'single' ? 108 : 124
  const footerHeight = landscape ? LANDSCAPE_FOOTER_HEIGHT : FOOTER_HEIGHT
  const sidePadding = landscape ? LANDSCAPE_SIDE_PADDING : SIDE_PADDING
  const qrMargin = landscape ? 24 : 32
  return (
    <View style={{ height: footerHeight * scale }}>
      <Text style={[
        styles.footerBrand,
        {
          position: 'absolute',
          left: sidePadding * scale,
          bottom: 49 * scale,
          color: palette.text,
          fontSize: 22 * scale,
          lineHeight: 28 * scale,
        },
      ]}>
        NO MENU
      </Text>
      {pageCount > 1 ? (
        <Text style={[
          styles.pageNumber,
          {
            color: palette.muted,
            fontSize: 20 * scale,
            lineHeight: 26 * scale,
            bottom: 51 * scale,
          },
        ]}>
          {pageIndex + 1} / {pageCount}
        </Text>
      ) : null}
      {qrImageUrl && !qrFailed ? (
        <Image
          source={{ uri: qrImageUrl }}
          resizeMode="contain"
          style={{
            position: 'absolute',
            width: qrSize * scale,
            height: qrSize * scale,
            right: qrMargin * scale,
            bottom: qrMargin * scale,
            backgroundColor: '#FFFFFF',
          }}
          onLoad={onQrLoad}
          onError={onQrLoadError}
        />
      ) : null}
    </View>
  )
}

function buildPosterPages(drinks: DraftDrink[], showPrices: boolean, layout: FullTaplistLayout, output: FullTaplistOutput): PosterPage[] {
  if (layout === 'landscape') return buildLandscapePages(drinks, showPrices)

  const columns: FullTaplistColumns = layout === 'single' ? 1 : 2
  const captureWidth = PAGE_WIDTH[columns]
  const items = drinks.map((drink) => {
    const servingLines = menuServingLines(drink, showPrices, true)
    return {
      drink,
      servingLines,
      designHeight: BASE_ROW_HEIGHT[columns] + Math.max(0, servingLines.length - 1) * SERVING_LINE_HEIGHT[columns],
    }
  })
  const batches = output === 'pages' ? balancedPages(items, PAGE_CAPACITY[columns]) : [items]

  return (batches.length ? batches : [[]]).map((batch) => {
    const rowsPerColumn = Math.max(1, Math.ceil(batch.length / columns))
    const unalignedColumns = Array.from({ length: columns }, (_, index) =>
      batch.slice(index * rowsPerColumn, (index + 1) * rowsPerColumn),
    )
    const pageColumns = columns === 2
      ? alignDoubleColumnRowHeights(unalignedColumns)
      : unalignedColumns
    const contentHeight = Math.max(
      BASE_ROW_HEIGHT[columns],
      ...pageColumns.map((column) => column.reduce((total, item) => total + item.designHeight, 0)),
    )
    return {
      layout,
      captureWidth,
      captureHeight: CONTENT_TOP + contentHeight + FOOTER_HEIGHT,
      contentHeight,
      contentTop: CONTENT_TOP,
      sidePadding: SIDE_PADDING,
      columnGap: COLUMN_GAP,
      rowCount: rowsPerColumn,
      columns: pageColumns,
    }
  })
}

function buildLandscapePages(drinks: DraftDrink[], showPrices: boolean): PosterPage[] {
  const items: PosterDrink[] = drinks.map((drink) => ({
    drink,
    servingLines: menuServingLines(drink, showPrices, false),
    designHeight: 0,
  }))
  const batches = landscapeBatches(items)
  return batches.map((batch) => {
    const page = landscapePageLayout(batch)
    return {
      layout: 'landscape',
      captureWidth: LANDSCAPE_PAGE_WIDTH,
      captureHeight: LANDSCAPE_PAGE_HEIGHT,
      contentHeight: LANDSCAPE_CONTENT_HEIGHT,
      contentTop: LANDSCAPE_CONTENT_TOP,
      sidePadding: LANDSCAPE_SIDE_PADDING,
      columnGap: LANDSCAPE_COLUMN_GAP,
      rowCount: page.rows,
      columns: page.columns,
    }
  })
}

function landscapePageLayout(items: PosterDrink[]) {
  const rows = Math.max(1, Math.ceil(items.length / LANDSCAPE_COLUMNS))
  const size = LANDSCAPE_SIZES[Math.min(rows, 5) as keyof typeof LANDSCAPE_SIZES]
  const rawColumns = rowMajorColumns(items, LANDSCAPE_COLUMNS)
  const rowExtraHeights = Array.from({ length: rows }, (_, rowIndex) =>
    Math.max(
      0,
      ...rawColumns.map((column) =>
        Math.max(0, (column[rowIndex]?.servingLines.length ?? 0) - 1) * size.servingLineHeight,
      ),
    ),
  )
  const totalExtraHeight = rowExtraHeights.reduce((sum, height) => sum + height, 0)
  const availableBaseHeight = Math.floor((LANDSCAPE_CONTENT_HEIGHT - totalExtraHeight) / rows)
  const baseHeight = Math.max(size.minBaseHeight, availableBaseHeight)
  return {
    rows,
    fits: availableBaseHeight >= size.minBaseHeight,
    columns: rawColumns.map((column) => column.map((item, rowIndex) => ({
      ...item,
      designHeight: baseHeight + rowExtraHeights[rowIndex],
    }))),
  }
}

function landscapeBatches(items: PosterDrink[]): PosterDrink[][] {
  if (!items.length) return [[]]
  let pageCount = Math.ceil(items.length / LANDSCAPE_MAX_ITEMS)
  while (pageCount <= items.length) {
    const capacity = Math.ceil(items.length / pageCount)
    const batches = balancedPages(items, capacity)
    if (batches.every((batch) => landscapePageLayout(batch).fits) || pageCount === items.length) {
      return batches
    }
    pageCount += 1
  }
  return [items]
}

function rowMajorColumns<T>(items: T[], count: number): T[][] {
  const columns = Array.from({ length: count }, () => [] as T[])
  items.forEach((item, index) => columns[index % count].push(item))
  return columns
}

function alignDoubleColumnRowHeights(columns: PosterDrink[][]): PosterDrink[][] {
  const rowCount = Math.max(0, ...columns.map((column) => column.length))
  const rowHeights = Array.from({ length: rowCount }, (_, rowIndex) =>
    Math.max(...columns.map((column) => column[rowIndex]?.designHeight ?? 0)),
  )
  return columns.map((column) =>
    column.map((item, rowIndex) => ({ ...item, designHeight: rowHeights[rowIndex] })),
  )
}

function balancedPages<T>(items: T[], capacity: number): T[][] {
  if (!items.length) return [[]]
  const pageCount = Math.ceil(items.length / capacity)
  const baseSize = Math.floor(items.length / pageCount)
  const remainder = items.length % pageCount
  const pages: T[][] = []
  let offset = 0
  for (let index = 0; index < pageCount; index += 1) {
    const size = baseSize + (index < remainder ? 1 : 0)
    pages.push(items.slice(offset, offset + size))
    offset += size
  }
  return pages
}

function menuServingLines(drink: DraftDrink, showPrices: boolean, sortByPublicOrder: boolean): string[] {
  if (!showPrices) return []
  const servings = drink.servings
    .filter((serving) => !serving._deleted && serving.is_active && Number(serving.price) > 0)
  if (sortByPublicOrder) servings.sort((a, b) => a.public_sort_order - b.public_sort_order)
  return servings.map((serving) => {
      const label = serving.label?.trim() || ''
      const volume = serving.volume_ml ? `${formatNumber(serving.volume_ml)}ml` : ''
      const price = `¥${formatNumber(Number(serving.price))}`
      return [label, volume, price].filter(Boolean).join(' · ')
    })
}

function columnWidth(pageWidth: number, columns: number, sidePadding: number, columnGap: number): number {
  return (pageWidth - sidePadding * 2 - columnGap * (columns - 1)) / columns
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)))
}

function themePalette(theme: FullTaplistTheme) {
  return theme === 'dark'
    ? { background: '#0D0D0D', text: '#F5F1E8', muted: '#8F887D', accent: '#D39A45', rule: '#292724', pale: '#171614', sold: '#706A62' }
    : { background: '#FFFFFF', text: '#171612', muted: '#776F63', accent: '#B47B2B', rule: '#D8D0C2', pale: '#E9E2D6', sold: '#9B9489' }
}

const styles = StyleSheet.create({
  pageStack: { gap: 18 },
  pageWrap: { alignItems: 'center' },
  pageLabel: { color: '#81796D', fontSize: 12, lineHeight: 17, marginBottom: 8 },
  poster: { width: PREVIEW_WIDTH, overflow: 'hidden' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  barName: { flex: 1, fontFamily: SANS_MEDIUM, letterSpacing: -0.4 },
  headerStats: { flexShrink: 0, flexDirection: 'row', alignItems: 'baseline' },
  headerDate: { fontFamily: SANS_MEDIUM },
  headerCount: { fontFamily: SANS },
  tapNumber: { flexShrink: 0, fontFamily: SANS_MEDIUM },
  drinkName: { fontFamily: SANS_MEDIUM },
  drinkStyle: { fontFamily: SANS_MEDIUM },
  brewery: { fontFamily: SANS },
  abv: { fontFamily: SANS },
  serving: { fontFamily: SANS_MEDIUM },
  status: { fontFamily: SANS },
  footerBrand: { fontFamily: SANS_MEDIUM, letterSpacing: 2 },
  pageNumber: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: SANS },
})
