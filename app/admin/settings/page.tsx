'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Settings } from '@/lib/types'

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [formData, setFormData] = useState({
    theme: 'dark' as 'dark' | 'minimal' | 'luxury',
    auto_refresh: true,
    refresh_interval: 3600,
  })

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('*')
          .limit(1)
          .single()

        if (error) throw error
        if (data) {
          setSettings(data)
          setFormData({
            theme: data.theme,
            auto_refresh: data.auto_refresh,
            refresh_interval: data.refresh_interval,
          })
        }
      } catch (error) {
        console.error('Error fetching settings:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSettings()

    // 订阅实时更新
    const channel = supabase
      .channel('settings-changes')
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (settings) {
        const { error } = await supabase
          .from('settings')
          .update({
            ...formData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', settings.id)

        if (error) throw error
        alert('设置已保存')
      } else {
        const { error } = await supabase.from('settings').insert([formData])
        if (error) throw error
        alert('设置已创建')
      }
    } catch (error) {
      console.error('Error saving settings:', error)
      alert('保存失败，请重试')
    }
  }

  if (loading) {
    return (
      <div className="admin-container">
        <p>加载中...</p>
      </div>
    )
  }

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>系统设置</h1>
      </div>

      <div className="admin-section">
        <h2>展示页设置</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label className="admin-label">
              主题
            </label>
            <select
              value={formData.theme}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  theme: e.target.value as 'dark' | 'minimal' | 'luxury',
                })
              }
              className="admin-input"
              style={{ width: '200px' }}
            >
              <option value="dark">深色夜店风</option>
              <option value="minimal">简约黑白</option>
              <option value="luxury">高端酒吧</option>
            </select>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label className="admin-label admin-label-checkbox">
              <input
                type="checkbox"
                checked={formData.auto_refresh}
                onChange={(e) =>
                  setFormData({ ...formData, auto_refresh: e.target.checked })
                }
              />
              <span>自动刷新</span>
            </label>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label className="admin-label">
              刷新间隔（秒）
            </label>
            <input
              type="number"
              value={formData.refresh_interval}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  refresh_interval: parseInt(e.target.value) || 3600,
                })
              }
              className="admin-input"
              style={{ width: '200px' }}
              min="60"
            />
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
              当前设置：{formData.refresh_interval} 秒（{formData.refresh_interval / 60} 分钟）
            </p>
          </div>

          <button type="submit" className="admin-button admin-button-primary">
            保存设置
          </button>
        </form>
      </div>
    </div>
  )
}

