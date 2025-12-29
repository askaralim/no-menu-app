import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '酒吧实时酒单系统',
  description: '实时更新的酒吧酒单展示和管理系统',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}

