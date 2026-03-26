'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import AuthGuard from '@/components/AuthGuard'
import { supabase } from '@/lib/supabaseClient'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  const navItems = [
    { href: '/admin', label: '概览' },
    { href: '/admin/orders', label: '订单管理' },
    { href: '/admin/customers', label: '客户消费' },
    { href: '/admin/ordering', label: '点单' },
    { href: '/admin/categories', label: '分类管理' },
    { href: '/admin/drinks', label: '酒品管理' },
    { href: '/admin/settings', label: '设置' },
  ]

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthGuard>
      <div className="admin-wrapper">
        <nav className="admin-nav">
          <div className="admin-nav-container">
            <h1 className="admin-nav-title">管理后台</h1>
            <div className="admin-nav-links">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`admin-nav-link ${pathname === item.href ? 'active' : ''}`}
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href="/display"
                target="_blank"
                className="admin-nav-link admin-nav-link-external"
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
