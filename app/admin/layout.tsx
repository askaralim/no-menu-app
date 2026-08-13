'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import AuthGuard from '@/components/AuthGuard'
import { supabase } from '@/lib/supabaseClient'
import type { UserRole } from '@/lib/types'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [userRole, setUserRole] = useState<UserRole | null>(null)

  useEffect(() => {
    const fetchRole = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: rows } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
      const list = rows ?? []
      if (list.some((r) => r.role === 'super_admin')) {
        setUserRole('super_admin')
      } else if (list[0]) {
        setUserRole(list[0].role as UserRole)
      } else {
        setUserRole(null)
      }
    }
    fetchRole()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchRole()
    })
    return () => subscription.unsubscribe()
  }, [])

  const navItems = [
    { href: '/admin', label: '概览' },
    { href: '/admin/orders', label: '订单管理' },
    { href: '/admin/customers', label: '客户消费' },
    { href: '/admin/ordering', label: '点单' },
    { href: '/admin/categories', label: '分类管理' },
    { href: '/admin/drinks', label: '酒品管理' },
    { href: '/admin/taplist', label: 'Tap List' },
    { href: '/admin/events', label: '活动管理' },
    { href: '/admin/settings', label: '设置' },
  ]

  if (userRole === 'super_admin') {
    navItems.push({ href: '/admin/platform', label: '🔧 平台管理' })
    navItems.push({ href: '/admin/platform/cities', label: '城市管理' })
    navItems.push({ href: '/admin/platform/companies', label: '品牌/酒厂' })
    navItems.push({ href: '/admin/platform/products', label: '产品池' })
    navItems.push({ href: '/admin/platform/unlinked-drinks', label: '待关联酒款' })
    navItems.push({ href: '/admin/platform/support', label: '支持请求' })
  }

  const currentLabel =
    navItems.find((item) => item.href === pathname)?.label ??
    (pathname.startsWith('/admin/platform/cities')
      ? '城市管理'
      : pathname.startsWith('/admin/platform/companies')
        ? '品牌/酒厂'
        : pathname.startsWith('/admin/platform/unlinked-drinks')
          ? '待关联酒款'
          : pathname.startsWith('/admin/platform/products')
            ? '产品池'
            : pathname.startsWith('/admin/platform/support')
              ? '支持请求'
              : '管理后台')

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthGuard>
      <div className="admin-wrapper">
        <nav className="admin-nav">
          <div className="admin-nav-container">
            <h1 className="admin-nav-title">管理后台</h1>
            <span className="admin-nav-current">{currentLabel}</span>
            <button
              className={`admin-nav-toggle ${menuOpen ? 'open' : ''}`}
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle navigation"
            >
              <span />
              <span />
              <span />
            </button>
            <div className={`admin-nav-links ${menuOpen ? 'open' : ''}`}>
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`admin-nav-link ${pathname === item.href ? 'active' : ''}`}
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href="/display"
                target="_blank"
                className="admin-nav-link admin-nav-link-external"
                onClick={() => setMenuOpen(false)}
              >
                查看展示页 →
              </Link>
              <button
                onClick={handleLogout}
                className="admin-nav-link admin-nav-logout"
              >
                退出登录
              </button>
            </div>
          </div>
        </nav>
        <main>{children}</main>
      </div>
    </AuthGuard>
  )
}
