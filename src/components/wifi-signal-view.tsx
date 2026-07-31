export function WifiSignalView({ value, bars }: { value: string; bars: 0 | 1 | 2 | 3 | 4 }) {
  if (!value || value === '—') {
    return <span className="wifi-signal is-empty"><span className="wifi-signal-value">—</span><span className="wifi-signal-note">暂无上报</span></span>
  }
  return (
    <span className="wifi-signal" title={`WiFi 信号强度 ${value}`} aria-label={`WiFi 信号强度 ${value}`}>
      <span className="wifi-bars" aria-hidden="true">
        {[1, 2, 3, 4].map((level) => (
          <i key={level} className={bars >= level ? 'on' : undefined} />
        ))}
      </span>
      <strong className="wifi-signal-value">{value}</strong>
    </span>
  )
}
