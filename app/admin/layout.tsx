'use client'

import { useState } from 'react'
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
  const [menuOpen, setMenuOpen] = useState(false)

  const navItems = [
    { href: '/admin', label: '概览' },
    { href: '/admin/orders', label: '订单管理' },
    { href: '/admin/customers', label: '客户消费' },
    { href: '/admin/ordering', label: '点单' },
    { href: '/admin/categories', label: '分类管理' },
    { href: '/admin/drinks', label: '酒品管理' },
    { href: '/admin/settings', label: '设置' },
  ]

  const currentLabel = navItems.find((item) => item.href === pathname)?.label ?? '管理后台'

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
