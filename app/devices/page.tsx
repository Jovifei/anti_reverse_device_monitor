import Link from 'next/link'
import { DeviceService } from '@/src/services/device-service'

export default async function DeviceListPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; q?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const service = new DeviceService()
  const result = await service.listDevices(resolvedSearchParams)

  const currentPage = Number(resolvedSearchParams.page || '1')
  const currentPageSize = Number(resolvedSearchParams.pageSize || '20')
  const q = resolvedSearchParams.q || ''

  return (
    <main>
      <h1>Device Overview</h1>
      <form action="/devices" method="get">
        <label>
          SN 查询:
          <input name="q" defaultValue={q} />
        </label>
        <button type="submit">查询</button>
      </form>
      <section>
        <p>Total devices: {result.total}</p>
        <p>Current page: {currentPage}</p>
        <p>Page size: {currentPageSize}</p>
        <ul>
          {result.items.map((device) => (
            <li key={device.id}>
              <Link href={`/devices/${encodeURIComponent(device.deviceSn)}`}>
                {device.deviceSn}
              </Link>
              {' '}
              (Inverters {device.inverterCount})
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
