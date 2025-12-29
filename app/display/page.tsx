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

      // 对每个分类的酒品进行排序
      const sortedData: CategoryWithDrinks[] = (data || []).map((category: any) => ({
        id: category.id,
        name: category.name,
        sort_order: category.sort_order,
        enabled: category.enabled,
        created_at: category.created_at,
        drinks: (category.drinks || [])
          .filter((d: any) => d.enabled)
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

  if (loading) {
    return (
      <main className="menu">
        <div style={{ 
          textAlign: 'center', 
          padding: '8rem 1rem',
          color: 'inherit',
          opacity: 0.6
        }}>
          <p style={{ fontSize: '18px', fontWeight: 400 }}>加载中...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="menu">
      {categories.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '8rem 1rem',
          color: 'inherit',
          opacity: 0.5
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
  )
}

