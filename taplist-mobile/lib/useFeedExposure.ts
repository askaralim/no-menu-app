import { useEffect, useRef } from 'react'
import { AppState, Dimensions, View } from 'react-native'

import type { FeedResult } from '@/lib/api/beerFeed'
import { recordFeedEvent } from '@/lib/intelligenceAnalytics'

type Rect = { x: number; y: number; width: number; height: number }
const measure = (view: View) => new Promise<Rect>((resolve) => {
  view.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }))
})
const intersection = (a: Rect, b: Rect): Rect => ({
  x: Math.max(a.x, b.x), y: Math.max(a.y, b.y),
  width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)),
  height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)),
})

// Measure the actual card area against BOTH axes of its clipped viewport.
// FlatList's axis-only viewability is insufficient for a rail in a home scroll.
export function useFeedExposure(result: FeedResult | undefined, active: boolean, top: number, bottom: number, stickyHeaderHeight = 0) {
  const viewport = useRef<View>(null)
  const cards = useRef(new Map<string, View>())
  const since = useRef(new Map<string, number>())
  const emitted = useRef(new Set<string>())
  const shown = useRef(false)
  const generation = useRef(0)
  const invalidate = () => { generation.current++; since.current.clear() }

  useEffect(() => {
    emitted.current.clear()
    shown.current = false
    invalidate()
  }, [result?.feed_instance_id])

  useEffect(() => {
    if (!active || !result?.analyticsContext) { invalidate(); return }
    let disposed = false
    let measuring = false
    let lastSample = 0
    const appState = AppState.addEventListener('change', invalidate)
    const sample = async () => {
      if (disposed || measuring || AppState.currentState !== 'active' || !viewport.current) return
      measuring = true
      const epoch = generation.current
      try {
        const now = Date.now()
        if (now - lastSample > 600) since.current.clear()
        lastSample = now
        const window = Dimensions.get('window')
        const viewportBounds = await measure(viewport.current)
        // Sticky dates cover the top of the list, rather than reducing its layout height.
        viewportBounds.y += stickyHeaderHeight
        viewportBounds.height = Math.max(0, viewportBounds.height - stickyHeaderHeight)
        const bounds = intersection(viewportBounds, { x: 0, y: top, width: window.width, height: Math.max(0, window.height - top - bottom) })
        if (disposed || epoch !== generation.current) return
        if (bounds.width > 0 && bounds.height > 0 && !shown.current) {
          recordFeedEvent('feed_shown', result.feed_instance_id, result.analyticsContext)
          shown.current = true
        }
        await Promise.all(result.items.map(async (item, index) => {
          if (emitted.current.has(item.item_id)) return
          const view = cards.current.get(item.item_id)
          if (!view) { since.current.delete(item.item_id); return }
          const rect = await measure(view)
          if (disposed || epoch !== generation.current || AppState.currentState !== 'active') return
          const visible = intersection(rect, bounds)
          if (rect.width * rect.height <= 0 || visible.width * visible.height / (rect.width * rect.height) < 0.5) {
            since.current.delete(item.item_id)
            return
          }
          const start = since.current.get(item.item_id)
          if (start === undefined) since.current.set(item.item_id, now)
          else if (now - start >= 750) {
            recordFeedEvent('feed_item_impression', result.feed_instance_id, result.analyticsContext, item.item_id, index + 1, now - start)
            emitted.current.add(item.item_id)
          }
        }))
      } finally { measuring = false }
    }
    const timer = setInterval(() => { void sample() }, 200)
    void sample()
    return () => { disposed = true; clearInterval(timer); appState.remove(); invalidate() }
  }, [active, result, top, bottom, stickyHeaderHeight])

  return { viewport, invalidate, register: (id: string, view: View | null) => {
    if (view) cards.current.set(id, view)
    else { cards.current.delete(id); since.current.delete(id) }
  } }
}
