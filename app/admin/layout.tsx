'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  const navItems = [
    { href: '/admin', label: '概览' },
    { href: '/admin/categories', label: '分类管理' },
    { href: '/admin/drinks', label: '酒品管理' },
    { href: '/admin/settings', label: '设置' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa' }}>
      <nav
        style={{
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          padding: '1.25rem 2rem',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backdropFilter: 'blur(10px)',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '2.5rem',
            alignItems: 'center',
            maxWidth: '1400px',
            margin: '0 auto',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.3px', color: '#1a1a1a' }}>
            管理后台
          </h1>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flex: 1 }}>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: '0.5rem 1rem',
                  textDecoration: 'none',
                  color: pathname === item.href ? '#3b82f6' : '#6b7280',
                  borderRadius: '8px',
                  fontWeight: pathname === item.href ? 500 : 400,
                  backgroundColor: pathname === item.href ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  if (pathname !== item.href) {
                    e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.04)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (pathname !== item.href) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }
                }}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/display"
              target="_blank"
              style={{
                padding: '0.5rem 1rem',
                textDecoration: 'none',
                color: '#6b7280',
                marginLeft: 'auto',
                borderRadius: '8px',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.04)'
                e.currentTarget.style.color = '#3b82f6'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = '#6b7280'
              }}
            >
              查看展示页 →
            </Link>
          </div>
        </div>
      </nav>
      <main>{children}</main>
    </div>
  )
}

