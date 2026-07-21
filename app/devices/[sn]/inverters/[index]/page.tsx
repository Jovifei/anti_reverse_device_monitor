import Link from 'next/link'
import { DeviceService } from '@/src/services/device-service'

const EMPTY = '—'

export default async function InverterPage({
  params
}: {
  params: Promise<{ sn: string; index: string }>
}) {
  const { sn, index } = await params
  const service = new DeviceService()
  const inverterSummary = await service.getInverterSummary(sn, index)

  if (!inverterSummary) {
    return <main>Inverter not found</main>
  }

  const latest = inverterSummary.latestRows.slice(0, 12)

  return (
    <main>
      <h1>Inverter {inverterSummary.inverterIndex}</h1>
      <p>Device SN: {inverterSummary.deviceSn}</p>
      <p>Inverter SN: {inverterSummary.inverterSn ?? EMPTY}</p>
      <section>
        <h2>Latest rows</h2>
        <ul>
          {latest.map((row) => (
            <li key={`${row.metricKey}-${row.reportedAt.toISOString()}`}>
              {row.metricKey}: {row.valueNumber ?? row.valueText ?? EMPTY}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Recent fault flags</h2>
        {inverterSummary.faults.length > 0 ? (
          <ul>
            {inverterSummary.faults.map((fault) => (
              <li key={`${fault.metricKey}-${fault.reportedAt}`}>
                {fault.metricKey} @ {fault.reportedAt}
                {' '}
                critical: {fault.critical ? 'yes' : 'no'}
                {fault.faults.length > 0
                  ? ` (${fault.faults.map((item) => `${item.bit}-${item.name}`).join(', ')})`
                  : ' (none)'}
              </li>
            ))}
          </ul>
        ) : (
          <p>No explicit fault metric available.</p>
        )}
      </section>
      <section>
        <h2>7-day continuity</h2>
        <p>
          Online: {inverterSummary.connectivity.isOnline ? 'online' : 'offline'}
          {' '}
          | last seen: {inverterSummary.connectivity.lastSeenAt ?? EMPTY}
          {' '}
          | offline total: {inverterSummary.connectivity.offlineMinutes} min
        </p>
        {inverterSummary.connectivity.offlineWindows.length > 0 ? (
          <ul>
            {inverterSummary.connectivity.offlineWindows.map((window) => (
              <li key={`${window.startAt}-${window.endAt}`}>
                {window.startAt} ~ {window.endAt} ({window.durationMinutes} min)
              </li>
            ))}
          </ul>
        ) : (
          <p>No offline interval in this window.</p>
        )}
      </section>
      <section>
        <h3>7-day transitions</h3>
        {inverterSummary.connectivity.transitions.length > 0 ? (
          <ul>
            {inverterSummary.connectivity.transitions.map((transition) => (
              <li key={`${transition.at}-${transition.state}`}>
                {transition.at}: {transition.state}
                {' '}
                {transition.value !== null ? `(${transition.value})` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p>No transition records in this window.</p>
        )}
      </section>
      <section>
        <h2>7-day fault changes</h2>
        {inverterSummary.faultChanges.length > 0 ? (
          <ul>
            {inverterSummary.faultChanges.map((event) => (
              <li key={`${event.at}-${event.eventType}-${event.fromMask}-${event.toMask}`}>
                {event.at}: {event.eventType} {event.fromHex} -> {event.toHex}
                {' '}
                {event.fromFaults.length > 0 ? `from ${event.fromFaults.join(', ')}` : ''}
                {' '}
                -> {event.toFaults.length > 0 ? event.toFaults.join(', ') : 'none'}
              </li>
            ))}
          </ul>
        ) : (
          <p>No fault changes in this window.</p>
        )}
      </section>
      <Link href={`/devices/${encodeURIComponent(inverterSummary.deviceSn)}`}>Back to device</Link>
    </main>
  )
}
