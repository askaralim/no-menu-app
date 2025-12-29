'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Category } from '@/lib/types'

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    sort_order: 0,
  })

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
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCategories()

    // 订阅实时更新
    const channel = supabase
      .channel('categories-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'categories',
        },
        () => {
          fetchCategories()
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
          .from('categories')
          .update(formData)
          .eq('id', editingId)

        if (error) throw error
        setEditingId(null)
      } else {
        const { error } = await supabase.from('categories').insert([formData])
        if (error) throw error
      }
      setFormData({ name: '', sort_order: 0 })
      fetchCategories()
    } catch (error) {
      console.error('Error saving category:', error)
      alert('保存失败，请重试')
    }
  }

  const handleEdit = (category: Category) => {
    setEditingId(category.id)
    setFormData({
      name: category.name,
      sort_order: category.sort_order,
    })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个分类吗？')) return

    try {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) throw error
      fetchCategories()
    } catch (error) {
      console.error('Error deleting category:', error)
      alert('删除失败，请重试')
    }
  }

  const handleToggleEnabled = async (category: Category) => {
    try {
      const { error } = await supabase
        .from('categories')
        .update({ enabled: !category.enabled })
        .eq('id', category.id)

      if (error) throw error
      fetchCategories()
    } catch (error) {
      console.error('Error toggling category:', error)
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
        <h1>分类管理</h1>
      </div>

      <div className="admin-section">
        <h2>{editingId ? '编辑分类' : '新增分类'}</h2>
        <form onSubmit={handleSubmit} className="admin-form">
          <input
            type="text"
            placeholder="分类名称"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="admin-input"
            required
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
                setFormData({ name: '', sort_order: 0 })
              }}
              className="admin-button admin-button-secondary"
            >
              取消
            </button>
          )}
        </form>
      </div>

      <div className="admin-section">
        <h2>分类列表</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>排序</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id}>
                <td>{category.name}</td>
                <td>{category.sort_order}</td>
                <td>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={category.enabled}
                      onChange={() => handleToggleEnabled(category)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </td>
                <td>
                  <button
                    onClick={() => handleEdit(category)}
                    className="admin-button admin-button-secondary"
                    style={{ marginRight: '0.5rem' }}
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(category.id)}
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

