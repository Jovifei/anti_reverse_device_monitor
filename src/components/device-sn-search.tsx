'use client'

import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'

export function DeviceSnSearch({ initialSn }: { initialSn: string }) {
  const router = useRouter()
  const [value, setValue] = useState(initialSn)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const lookup = value.trim()
    if (lookup) router.push(`/devices/${encodeURIComponent(lookup)}`)
  }

  return <form className="sn-search" onSubmit={submit}><label htmlFor="device-sn-search">设备 SN</label><input id="device-sn-search" value={value} onChange={(event) => setValue(event.target.value)} placeholder="完整 SN 或末尾编号，如 252" /><button type="submit">查询设备</button></form>
}
