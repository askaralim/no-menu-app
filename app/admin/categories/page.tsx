'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { resolvePosAdminTenantId } from '@/lib/adminTenant'
import { Category } from '@/lib/types'

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    sort_order: 0,
  })

  const fetchCategories = useCallback(async (tid: string) => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('tenant_id', tid)
        .order('sort_order', { ascending: true })

      if (error) throw error
      setCategories(data || [])
    } catch (error) {
      console.error('Error fetching categories:', error)
    }
  }, [])

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    const init = async () => {
      setLoading(true)
      const tid = await resolvePosAdminTenantId(supabase)
      setTenantId(tid)
      if (!tid) {
        setCategories([])
        setLoading(false)
        return
      }
      await fetchCategories(tid)
      setLoading(false)

      channel = supabase
        .channel(`categories-changes-${tid}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'categories',
            filter: `tenant_id=eq.${tid}`,
          },
          () => {
            void fetchCategories(tid)
          }
        )
        .subscribe()
    }

    void init()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [fetchCategories])

  const refresh = () => {
    if (tenantId) void fetchCategories(tenantId)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId) {
      alert('未绑定门店，无法保存分类')
      return
    }
    try {
      if (editingId) {
        const { error } = await supabase
          .from('categories')
          .update(formData)
          .eq('id', editingId)
          .eq('tenant_id', tenantId)

        if (error) throw error
        setEditingId(null)
      } else {
        const { error } = await supabase
          .from('categories')
          .insert([{ ...formData, tenant_id: tenantId }])
        if (error) throw error
      }
      setFormData({ name: '', sort_order: 0 })
      refresh()
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
    if (!tenantId) return
    if (!confirm('确定要删除这个分类吗？')) return

    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId)
      if (error) throw error
      refresh()
    } catch (error) {
      console.error('Error deleting category:', error)
      alert('删除失败，请重试')
    }
  }

  const handleToggleEnabled = async (category: Category) => {
    if (!tenantId) return
    try {
      const { error } = await supabase
        .from('categories')
        .update({ enabled: !category.enabled })
        .eq('id', category.id)
        .eq('tenant_id', tenantId)

      if (error) throw error
      refresh()
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

  if (!tenantId) {
    return (
      <div className="admin-container">
        <div className="admin-header">
          <h1>分类管理</h1>
        </div>
        <p>当前账号未绑定门店（需要店主或员工角色）。</p>
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
        <div className="admin-table-wrapper">
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
                <td className="name-cell">{category.name}</td>
                <td className="sort-cell">{category.sort_order}</td>
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
    </div>
  )
}
