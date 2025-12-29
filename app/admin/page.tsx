'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Category, Drink } from '@/lib/types'

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    categories: 0,
    drinks: 0,
    enabledDrinks: 0,
  })

  useEffect(() => {
    const fetchStats = async () => {
      const { data: categories } = await supabase
        .from('categories')
        .select('id', { count: 'exact' })

      const { data: drinks } = await supabase
        .from('drinks')
        .select('id, enabled', { count: 'exact' })

      setStats({
        categories: categories?.length || 0,
        drinks: drinks?.length || 0,
        enabledDrinks: drinks?.filter((d) => d.enabled).length || 0,
      })
    }

    fetchStats()
  }, [])

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>管理概览</h1>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
        <div className="admin-section">
          <h3>分类总数</h3>
          <p style={{ fontSize: '2rem', fontWeight: 600 }}>{stats.categories}</p>
        </div>
        <div className="admin-section">
          <h3>酒品总数</h3>
          <p style={{ fontSize: '2rem', fontWeight: 600 }}>{stats.drinks}</p>
        </div>
        <div className="admin-section">
          <h3>在售酒品</h3>
          <p style={{ fontSize: '2rem', fontWeight: 600 }}>{stats.enabledDrinks}</p>
        </div>
      </div>
    </div>
  )
}

