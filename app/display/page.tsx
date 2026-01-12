'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { CategoryWithDrinks, Settings } from '@/lib/types'
import CategorySection from '@/components/menu/CategorySection'

export default function DisplayPage() {
  const [categories, setCategories] = useState<CategoryWithDrinks[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMenu = async () => {
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
        .order('sort_order', { ascending: true })

      if (error) throw error

      // 对每个分类的酒品进行排序，只显示已启用的酒品
      const sortedData: CategoryWithDrinks[] = (data || [])
        .map((category: any) => ({
          id: category.id,
          name: category.name,
          sort_order: category.sort_order,
          enabled: category.enabled,
          created_at: category.created_at,
          drinks: (category.drinks || [])
            .filter((drink: any) => drink.enabled === true) // 只显示已启用的饮品
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
        .filter((category: CategoryWithDrinks) => category.drinks.length > 0) // 只显示有饮品的分类

      setCategories(sortedData)
    } catch (error) {
      console.error('Error fetching menu:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .limit(1)
        .single()

      if (error) throw error
      setSettings(data)
    } catch (error) {
      console.error('Error fetching settings:', error)
    }
  }

  useEffect(() => {
    fetchMenu()
    fetchSettings()
  }, [])

  // 应用主题
  useEffect(() => {
    if (settings) {
      document.body.className = ''
      document.body.classList.add(`theme-${settings.theme}`)
    }
  }, [settings])

  // 设置自动刷新
  useEffect(() => {
    if (settings?.auto_refresh) {
      const interval = setInterval(() => {
        fetchMenu()
      }, (settings.refresh_interval || 3600) * 1000)

      return () => clearInterval(interval)
    }
  }, [settings])

  // 订阅实时更新
  useEffect(() => {
    const channel = supabase
      .channel('menu-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'categories',
        },
        () => {
          fetchMenu()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'drinks',
        },
        () => {
          fetchMenu()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'settings',
        },
        () => {
          fetchSettings()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // iPad自动滚动脚本
  useEffect(() => {
    // 检查内容高度是否超过视口高度
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

    // 如果不需要滚动，直接返回
    if (!checkIfScrollingNeeded()) {
      return
    }

    let scrollPosition = window.scrollY || window.pageYOffset
    let direction: 'down' | 'up' = 'down'
    let isPaused = false
    let pauseTimeout: NodeJS.Timeout | null = null

    const scrollStep = 1 // px
    const scrollInterval = 80 // ms
    const bottomPause = 6000 // ms
    const topPause = 3000 // ms

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
      // 允许1px的误差
      return scrollTop >= scrollBottom - 1
    }

    const scroll = (): void => {
      if (isPaused) {
        return
      }

      // 重新检查是否需要滚动（内容可能已改变）
      if (!checkIfScrollingNeeded()) {
        return
      }

      if (direction === 'down') {
        window.scrollBy(0, scrollStep)
        scrollPosition = getScrollTop()

        if (isAtBottom()) {
          isPaused = true
          // 清除之前的暂停定时器
          if (pauseTimeout) {
            clearTimeout(pauseTimeout)
          }
          pauseTimeout = setTimeout(() => {
            isPaused = false
            direction = 'up'
            pauseTimeout = null
          }, bottomPause)
        }
      } else {
        // direction === 'up'
        window.scrollBy(0, -scrollStep)
        scrollPosition = getScrollTop()

        if (isAtTop()) {
          isPaused = true
          // 清除之前的暂停定时器
          if (pauseTimeout) {
            clearTimeout(pauseTimeout)
          }
          pauseTimeout = setTimeout(() => {
            isPaused = false
            direction = 'down'
            pauseTimeout = null
          }, topPause)
        }
      }
    }

    // 初始滚动到顶部
    window.scrollTo(0, 0)

    // 设置滚动间隔
    const intervalId = setInterval(scroll, scrollInterval)

    // 清理函数
    return () => {
      clearInterval(intervalId)
      if (pauseTimeout) {
        clearTimeout(pauseTimeout)
      }
    }
  }, [categories, loading]) // 当内容加载完成后重新初始化滚动

  if (loading) {
    return (
      <>
        <header className="brand-header">
          <div className="brand-name">淡水路226</div>
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
        <div className="brand-name">淡水路226</div>
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

