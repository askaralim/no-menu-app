'use client'

import { useCallback, useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import type { CategoryWithDrinks, Drink, Settings } from '@/lib/types'
import CategorySection from '@/components/menu/CategorySection'

type RpcErrorPayload = { ok: false; code: 'not_found' | 'suspended'; name?: string }

type RpcOkPayload = {
  ok: true
  tenant: { id: string; name: string }
  settings: Settings | null
  categories: Array<{
    id: string
    name: string
    sort_order: number
    enabled: boolean
    created_at: string
    drinks: Drink[]
  }>
}

type DisplayRpcPayload = RpcErrorPayload | RpcOkPayload

function isOkPayload(p: DisplayRpcPayload): p is RpcOkPayload {
  return p.ok === true
}

function DisplayPageContent() {
  const searchParams = useSearchParams()
  const slug = searchParams.get('slug')

  const [categories, setCategories] = useState<CategoryWithDrinks[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [tenantName, setTenantName] = useState<string>('No Menu')
  const [loading, setLoading] = useState(true)

  const loadPayload = useCallback(async (quiet = false) => {
    const rawSlug = slug?.trim() ? slug.trim() : null
    if (!quiet) setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_public_display_payload', {
        p_slug: rawSlug,
      })
      if (error) throw error

      const payload = data as DisplayRpcPayload

      if (!isOkPayload(payload)) {
        if (payload.code === 'suspended') {
          setTenantName('此酒吧已暂停服务')
        } else {
          setTenantName('酒吧未找到')
        }
        setCategories([])
        setSettings(null)
        return
      }

      setTenantName(payload.tenant.name)

      const sortedData: CategoryWithDrinks[] = (payload.categories || [])
        .map((category) => ({
          id: category.id,
          name: category.name,
          sort_order: category.sort_order,
          enabled: category.enabled,
          created_at: category.created_at,
          drinks: (category.drinks || [])
            .filter((drink) => drink.enabled === true)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((drink) => ({
              id: drink.id,
              name: drink.name,
              price: drink.price,
              price_unit: drink.price_unit,
              price_bottle: drink.price_bottle,
              price_unit_bottle: drink.price_unit_bottle,
              sort_order: drink.sort_order,
              enabled: drink.enabled,
              created_at: drink.created_at,
              category_id: category.id,
            })),
        }))
        .filter((category) => category.drinks.length > 0)

      setCategories(sortedData)
      setSettings(payload.settings as Settings | null)
    } catch (e) {
      console.error('Error loading display payload:', e)
      setTenantName('加载失败')
      setCategories([])
      setSettings(null)
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    loadPayload(false)
  }, [loadPayload])

  useEffect(() => {
    if (settings) {
      document.body.className = ''
      document.body.classList.add(`theme-${settings.theme}`)
    }
  }, [settings])

  useEffect(() => {
    if (!settings?.auto_refresh) return
    const interval = setInterval(() => {
      loadPayload(true)
    }, (settings.refresh_interval || 3600) * 1000)

    return () => clearInterval(interval)
  }, [settings?.auto_refresh, settings?.refresh_interval, loadPayload])

  useEffect(() => {
    const checkIfScrollingNeeded = (): boolean => {
      const documentHeight = Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.clientHeight,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      )
      const viewportHeight = window.innerHeight
      return documentHeight > viewportHeight
    }

    if (!checkIfScrollingNeeded()) {
      return
    }

    let direction: 'down' | 'up' = 'down'
    let isPaused = false
    let pauseTimeout: ReturnType<typeof setTimeout> | null = null

    const scrollStep = 1
    const scrollInterval = 80
    const bottomPause = 6000
    const topPause = 3000

    const getScrollTop = (): number => {
      return window.scrollY || window.pageYOffset || 0
    }

    const getScrollBottom = (): number => {
      const documentHeight = Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.clientHeight,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      )
      const viewportHeight = window.innerHeight
      return documentHeight - viewportHeight
    }

    const isAtTop = (): boolean => {
      return getScrollTop() <= 0
    }

    const isAtBottom = (): boolean => {
      const scrollTop = getScrollTop()
      const scrollBottom = getScrollBottom()
      return scrollTop >= scrollBottom - 1
    }

    const scroll = (): void => {
      if (isPaused) return

      if (!checkIfScrollingNeeded()) return

      if (direction === 'down') {
        window.scrollBy(0, scrollStep)

        if (isAtBottom()) {
          isPaused = true
          if (pauseTimeout) clearTimeout(pauseTimeout)
          pauseTimeout = setTimeout(() => {
            isPaused = false
            direction = 'up'
            pauseTimeout = null
          }, bottomPause)
        }
      } else {
        window.scrollBy(0, -scrollStep)

        if (isAtTop()) {
          isPaused = true
          if (pauseTimeout) clearTimeout(pauseTimeout)
          pauseTimeout = setTimeout(() => {
            isPaused = false
            direction = 'down'
            pauseTimeout = null
          }, topPause)
        }
      }
    }

    window.scrollTo(0, 0)
    const intervalId = setInterval(scroll, scrollInterval)

    return () => {
      clearInterval(intervalId)
      if (pauseTimeout) clearTimeout(pauseTimeout)
    }
  }, [categories, loading])

  if (loading) {
    return (
      <>
        <header className="brand-header">
          <div className="brand-name">{tenantName}</div>
          <div className="brand-sub">COCKTAIL · WHISKY · BEER</div>
        </header>
        <main className="menu-grid">
          <div style={{
            textAlign: 'center',
            padding: '8rem 1rem',
            color: 'inherit',
            opacity: 0.6,
            gridColumn: '1 / -1'
          }}>
            <p style={{ fontSize: '18px', fontWeight: 400 }}>加载中...</p>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <header className="brand-header">
        <div className="brand-name">{tenantName}</div>
        <div className="brand-sub">COCKTAIL · WHISKY · BEER</div>
      </header>
      <main className="menu-grid">
        {categories.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '8rem 1rem',
            color: 'inherit',
            opacity: 0.5,
            gridColumn: '1 / -1'
          }}>
            <p style={{ fontSize: '18px', fontWeight: 400 }}>暂无酒单数据</p>
          </div>
        ) : (
          categories.map((category) => (
            <CategorySection
              key={category.id}
              name={category.name}
              drinks={category.drinks}
            />
          ))
        )}
      </main>
    </>
  )
}

export default function DisplayPage() {
  return (
    <Suspense fallback={
      <>
        <header className="brand-header">
          <div className="brand-name">加载中...</div>
        </header>
      </>
    }>
      <DisplayPageContent />
    </Suspense>
  )
}
