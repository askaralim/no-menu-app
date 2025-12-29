'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Drink, Category } from '@/lib/types'

export default function DrinksPage() {
  const [drinks, setDrinks] = useState<Drink[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    category_id: '',
    name: '',
    price: 0,
    price_unit: '杯',
    price_bottle: null as number | null,
    price_unit_bottle: '瓶',
    sort_order: 0,
  })

  const fetchDrinks = async () => {
    try {
      const { data, error } = await supabase
        .from('drinks')
        .select('*')
        .order('sort_order', { ascending: true })

      if (error) throw error
      setDrinks(data || [])
    } catch (error) {
      console.error('Error fetching drinks:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true })

      if (error) throw error
      setCategories(data || [])
    } catch (error) {
      console.error('Error fetching categories:', error)
    }
  }

  useEffect(() => {
    fetchDrinks()
    fetchCategories()

    // 订阅实时更新
    const channel = supabase
      .channel('drinks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'drinks',
        },
        () => {
          fetchDrinks()
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
      if (editingId) {
        const { error } = await supabase
          .from('drinks')
          .update(formData)
          .eq('id', editingId)

        if (error) throw error
        setEditingId(null)
      } else {
        const { error } = await supabase.from('drinks').insert([formData])
        if (error) throw error
      }
      setFormData({ category_id: '', name: '', price: 0, price_unit: '杯', price_bottle: null, price_unit_bottle: '瓶', sort_order: 0 })
      fetchDrinks()
    } catch (error) {
      console.error('Error saving drink:', error)
      alert('保存失败，请重试')
    }
  }

  const handleEdit = (drink: Drink) => {
    setEditingId(drink.id)
    setFormData({
      category_id: drink.category_id,
      name: drink.name,
      price: drink.price,
      price_unit: drink.price_unit || '杯',
      price_bottle: drink.price_bottle,
      price_unit_bottle: drink.price_unit_bottle || '瓶',
      sort_order: drink.sort_order,
    })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个酒品吗？')) return

    try {
      const { error } = await supabase.from('drinks').delete().eq('id', id)
      if (error) throw error
      fetchDrinks()
    } catch (error) {
      console.error('Error deleting drink:', error)
      alert('删除失败，请重试')
    }
  }

  const handleToggleEnabled = async (drink: Drink) => {
    try {
      const { error } = await supabase
        .from('drinks')
        .update({ enabled: !drink.enabled })
        .eq('id', drink.id)

      if (error) throw error
      fetchDrinks()
    } catch (error) {
      console.error('Error toggling drink:', error)
    }
  }

  const getCategoryName = (categoryId: string) => {
    return categories.find((c) => c.id === categoryId)?.name || '未知分类'
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
        <h1>酒品管理</h1>
      </div>

      <div className="admin-section">
        <h2>{editingId ? '编辑酒品' : '新增酒品'}</h2>
        <form onSubmit={handleSubmit} className="admin-form">
          <select
            value={formData.category_id}
            onChange={(e) =>
              setFormData({ ...formData, category_id: e.target.value })
            }
            className="admin-input"
            required
          >
            <option value="">选择分类</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="酒品名称"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="admin-input"
            required
          />
          <input
            type="number"
            placeholder="价格"
            step="0.01"
            value={formData.price}
            onChange={(e) =>
              setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })
            }
            className="admin-input"
            style={{ width: '120px' }}
            required
          />
          <input
            type="text"
            placeholder="价格单位（如：杯、份）"
            value={formData.price_unit}
            onChange={(e) =>
              setFormData({ ...formData, price_unit: e.target.value })
            }
            className="admin-input"
            style={{ width: '120px' }}
          />
          <input
            type="number"
            placeholder="瓶装价格（可选）"
            step="0.01"
            value={formData.price_bottle || ''}
            onChange={(e) =>
              setFormData({ ...formData, price_bottle: e.target.value ? parseFloat(e.target.value) : null })
            }
            className="admin-input"
            style={{ width: '130px' }}
          />
          <input
            type="text"
            placeholder="瓶装单位"
            value={formData.price_unit_bottle}
            onChange={(e) =>
              setFormData({ ...formData, price_unit_bottle: e.target.value })
            }
            className="admin-input"
            style={{ width: '100px' }}
          />
          <input
            type="number"
            placeholder="排序"
            value={formData.sort_order}
            onChange={(e) =>
              setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })
            }
            className="admin-input"
            style={{ width: '100px' }}
          />
          <button type="submit" className="admin-button admin-button-primary">
            {editingId ? '更新' : '添加'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null)
                setFormData({ category_id: '', name: '', price: 0, price_unit: '杯', price_bottle: null, price_unit_bottle: '瓶', sort_order: 0 })
              }}
              className="admin-button admin-button-secondary"
            >
              取消
            </button>
          )}
        </form>
      </div>

      <div className="admin-section">
        <h2>酒品列表</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>分类</th>
              <th>名称</th>
              <th>价格（杯）</th>
              <th>价格（瓶）</th>
              <th>排序</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {drinks.map((drink) => (
              <tr key={drink.id}>
                <td>{getCategoryName(drink.category_id)}</td>
                <td>{drink.name}</td>
                <td>¥{drink.price.toFixed(2)}/{drink.price_unit || '杯'}</td>
                <td>
                  {drink.price_bottle ? (
                    <>¥{drink.price_bottle.toFixed(2)}/{drink.price_unit_bottle || '瓶'}</>
                  ) : (
                    <span style={{ color: '#9ca3af' }}>—</span>
                  )}
                </td>
                <td>{drink.sort_order}</td>
                <td>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={drink.enabled}
                      onChange={() => handleToggleEnabled(drink)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </td>
                <td>
                  <button
                    onClick={() => handleEdit(drink)}
                    className="admin-button admin-button-secondary"
                    style={{ marginRight: '0.5rem' }}
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(drink.id)}
                    className="admin-button admin-button-danger"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

