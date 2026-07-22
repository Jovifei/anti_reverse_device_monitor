import './globals.css'

export const metadata = {
  title: '防逆流设备运行总览',
  description: '用于 CT 与微型逆变器运行验收的本地 SQLite 演示平台。'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
