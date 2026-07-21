import Link from 'next/link'
import { DeviceService } from '@/src/services/device-service'

const EMPTY = '—'

function renderDuration(value: number | null) {
  if (value === null) {
    return EMPTY
  }

  return `${value} min`
}

export default async function DeviceDetailPage({
  params
}: {
  params: Promise<{ sn: string }>
}) {
  const { sn } = await params
  const service = new DeviceService()
  const device = await service.getDeviceSummary(sn)
  const health = await service.getDeviceHealth(sn)
  const alarms = await service.getReverseFlowAlarms(sn, { days: '7' })
  const history = await service.getDeviceHistory(sn, { days: '7' })

  if (!device || !history) {
    return (
      <main>
        <p>Device not found: {sn}</p>
        <a href="/devices">Back to devices</a>
      </main>
    )
  }

  const latestRows = device.latestRows?.slice(0, 10) ?? []
  const historyByInverter = new Map(
    history.inverters.map((item) => [item.inverterIndex, item])
  )

  return (
    <main>
      <h1>CT Device {device.deviceSn}</h1>
      <p>
        Window: {history.windowStart} ~ {history.windowEnd}
      </p>
      <p>Platform online: {history.platform.isOnline ? 'online' : 'offline'}</p>
      <p>Last seen: {history.platform.lastSeenAt ?? EMPTY}</p>
      <p>7-day offline total: {renderDuration(history.platform.offlineMinutes)}</p>
      <section>
        <h2>7-day platform continuity</h2>
        {history.platform.offlineWindows.length > 0 ? (
          <ul>
            {history.platform.offlineWindows.map((item) => (
              <li key={`${item.startAt}-${item.endAt}`}>
                offline {item.startAt} ~ {item.endAt} ({item.durationMinutes} min)
              </li>
            ))}
          </ul>
        ) : (
          <p>No offline interval detected in this window.</p>
        )}
      </section>
      <section>
        <h3>Platform online transitions</h3>
        {history.platform.transitions.length > 0 ? (
          <ul>
            {history.platform.transitions.map((transition) => (
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
        <h2>Reverse flow alarms (7 days)</h2>
        {alarms.alerts.length > 0 ? (
          <ul>
            {alarms.alerts.map(
              (alert: {
                metricKey: string
                sampleCount: number
                minimumPower: number
                severity: string
                firstAt: string
                lastAt: string
              }) => (
                <li key={alert.metricKey}>
                  {alert.metricKey}: {alert.sampleCount} sample(s), min={alert.minimumPower}
                  {' '}
                  [{alert.severity}] {alert.firstAt} ~ {alert.lastAt}
                </li>
              )
            )}
          </ul>
        ) : (
          <p>No reverse-flow alarms in window.</p>
        )}
      </section>
      <section>
        <h2>Inverters</h2>
        <ul>
          {device.inverterBindings.map(
            (binding: { inverterIndex: number; inverterSn?: string | null }) => {
              const historyItem = historyByInverter.get(binding.inverterIndex)
              const healthRow = health?.inverters.find((item) => item.inverterIndex === binding.inverterIndex)
              const connectivity = historyItem?.connectivity
              const faultChanges = historyItem?.faultChanges ?? []

              return (
                <li key={binding.inverterIndex}>
                  <Link href={`/devices/${encodeURIComponent(device.deviceSn)}/inverters/${binding.inverterIndex}`}>
                    Inverter {binding.inverterIndex}
                    {binding.inverterSn ? ` (${binding.inverterSn})` : ''}
                  </Link>
                  {' '}
                  | latest online state: {healthRow?.isOnline ? 'online' : 'offline'}
                  {healthRow?.offlineMinutes !== null
                    ? ` (${healthRow.offlineMinutes} min from latest heartbeat)`
                    : ''}
                  <br />
                  7-day status: {connectivity?.isOnline ? 'online' : 'offline'}
                  , offline total {renderDuration(connectivity?.offlineMinutes ?? null)}
                  {connectivity && connectivity.offlineWindows.length > 0 ? (
                    <ul>
                      {connectivity.offlineWindows.slice(0, 3).map((window) => (
                        <li key={`${window.startAt}-${window.endAt}`}>
                          {window.startAt} ~ {window.endAt} ({window.durationMinutes} min)
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div>No offline interval in this window.</div>
                  )}
                  {connectivity && connectivity.transitions.length > 0 ? (
                    <ul>
                      {connectivity.transitions.slice(0, 3).map((transition) => (
                        <li key={`${transition.at}-${transition.state}`}>
                          {transition.at}: {transition.state}
                          {' '}
                          {transition.value !== null ? `(${transition.value})` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div>No transition records in this window.</div>
                  )}
                  <p>Recent fault changes (max 5):</p>
                  {faultChanges.length > 0 ? (
                    <ul>
                      {faultChanges.slice(0, 5).map((event) => (
                        <li
                          key={`${event.at}-${event.eventType}-${event.fromMask}-${event.toMask}`}
                        >
                          {event.at}: {event.eventType} {event.toMask} ({event.toHex})
                          {event.fromFaults.length > 0 ? ` from ${event.fromFaults.join(', ')}` : ''}
                          {' '}
                          -> {event.toFaults.length > 0 ? event.toFaults.join(', ') : 'none'}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div>No fault changes in 7 days.</div>
                  )}
                </li>
              )
            }
          )}
        </ul>
      </section>
      <section>
        <h2>Latest metrics</h2>
        <ul>
          {latestRows.map(
            (item: { metricKey: string; valueNumber: number | null; valueText: string | null; reportedAt: Date }) => (
              <li key={`${item.metricKey}-${item.reportedAt.toString()}`}>
                {item.metricKey}: {item.valueNumber ?? item.valueText ?? EMPTY}
                {' '}
                {item.reportedAt ? `(${new Date(item.reportedAt).toLocaleString()})` : ''}
              </li>
            )
          )}
        </ul>
      </section>
      <a href="/devices">Back</a>
    </main>
  )
}
