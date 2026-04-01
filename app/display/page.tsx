'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { CategoryWithDrinks, Settings } from '@/lib/types'
import CategorySection from '@/components/menu/CategorySection'

function DisplayPageContent() {
  const searchParams = useSearchParams()
  const slug = searchParams.get('slug')

  const [categories, setCategories] = useState<CategoryWithDrinks[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [tenantName, setTenantName] = useState<string>('Bar Console')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const resolveTenant = async () => {
      if (!slug) {
        setTenantId('00000000-0000-0000-0000-000000000001')
        const { data } = await supabase
          .from('tenants')
          .select('name')
          .eq('id', '00000000-0000-0000-0000-000000000001')
          .single()
        if (data) setTenantName(data.name)
        return
      }
      const { data } = await supabase
        .from('tenants')
        .select('id, name, status')
        .eq('slug', slug)
        .single()
      if (data) {
        if (data.status === 'suspended') {
          setTenantName('此酒吧已暂停服务')
          setLoading(false)
          return
        }
        setTenantId(data.id)
        setTenantName(data.name)
      } else {
        setTenantName('酒吧未找到')
        setLoading(false)
      }
    }
    resolveTenant()
  }, [slug])

  const fetchMenu = async () => {
    if (!tenantId) return
    try {
      const { data, error } = await supabase
        .from('categories')
        .select(
          `
          id,
          name,
          sort_order,
          enabled,
          created_at,
          drinks (
            id,
            name,
            price,
            price_unit,
            price_bottle,
            price_unit_bottle,
            enabled,
            sort_order,
            created_at
          )
        `
        )
        .eq('enabled', true)
        .eq('tenant_id', tenantId)
        .order('sort_order', { ascending: true })

      if (error) throw error

      const sortedData: CategoryWithDrinks[] = (data || [])
        .map((category: any) => ({
          id: category.id,
          name: category.name,
          sort_order: category.sort_order,
          enabled: category.enabled,
          created_at: category.created_at,
          drinks: (category.drinks || [])
            .filter((drink: any) => drink.enabled === true)
            .sort((a: any, b: any) => a.sort_order - b.sort_order)
            .map((drink: any) => ({
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
        .filter((category: CategoryWithDrinks) => category.drinks.length > 0)

      setCategories(sortedData)
    } catch (error) {
      console.error('Error fetching menu:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchSettings = async () => {
    if (!tenantId) return
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .limit(1)
        .single()

      if (error) throw error
      setSettings(data)
    } catch (error) {
      console.error('Error fetching settings:', error)
    }
  }

  useEffect(() => {
    if (!tenantId) return
    fetchMenu()
    fetchSettings()
  }, [tenantId])

  useEffect(() => {
    if (settings) {
      document.body.className = ''
      document.body.classList.add(`theme-${settings.theme}`)
    }
  }, [settings])

  useEffect(() => {
    if (settings?.auto_refresh) {
      const interval = setInterval(() => {
        fetchMenu()
      }, (settings.refresh_interval || 3600) * 1000)

      return () => clearInterval(interval)
    }
  }, [settings])

  useEffect(() => {
    const channel = supabase
      .channel('menu-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories' },
        () => { fetchMenu() }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drinks' },
        () => { fetchMenu() }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settings' },
        () => { fetchSettings() }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

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

    let scrollPosition = window.scrollY || window.pageYOffset
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
        scrollPosition = getScrollTop()

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
        scrollPosition = getScrollTop()

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
