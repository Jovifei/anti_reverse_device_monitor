'use client'

import { useRouter } from 'next/navigation'

type Props = {
  currentSn: string
  options: string[]
}

export function DeviceSnSwitcher({ currentSn, options }: Props) {
  const router = useRouter()
  const sns = options.includes(currentSn) ? options : [currentSn, ...options]

  return (
    <form className="device-switcher" onSubmit={(event) => event.preventDefault()}>
      <label htmlFor="device-sn-select">设备 SN</label>
      <select
        id="device-sn-select"
        aria-label="选择设备"
        value={currentSn}
        onChange={(event) => {
          const next = event.target.value.trim()
          if (next && next !== currentSn) router.push(`/devices/${encodeURIComponent(next)}`)
        }}
      >
        {sns.map((sn) => (
          <option key={sn} value={sn}>
            {sn}
          </option>
        ))}
      </select>
    </form>
  )
}
