import './globals.css'

export const metadata = {
  title: 'Anti-Reverse Device Monitor',
  description: 'Phase-1 SQLite web platform for CT and 8 inverters.'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
