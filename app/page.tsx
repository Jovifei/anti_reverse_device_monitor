import Link from 'next/link'

export default function HomePage() {
  return (
    <main>
      <h1>Anti-Reverse Device Monitor</h1>
      <p>Phase-1 scaffolded web platform for CT devices and 8 inverters.</p>
      <nav>
        <ul>
          <li>
            <Link href="/devices">Open device dashboard</Link>
          </li>
        </ul>
      </nav>
    </main>
  )
}
