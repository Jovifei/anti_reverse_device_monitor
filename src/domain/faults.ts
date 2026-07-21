import { faultDictionaryMap } from './dictionaries'

export interface DecodedFault {
  bit: number
  name: string
}

export function decodeFaultMask(faultMask: number): DecodedFault[] {
  const bitEntries = Object.entries(faultDictionaryMap.bits ?? {})
  const active: DecodedFault[] = []

  for (let bit = 0; bit < 32; bit += 1) {
    const isActive = (faultMask >>> bit) % 2 === 1
    if (!isActive) {
      continue
    }

    const name = bitEntries.find(([index]) => Number(index) === bit)?.[1] ?? `Fault bit ${bit}`
    active.push({ bit, name })
  }

  return active
}

export function toHexMask(value: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(8, '0')}`
}

export function hasCriticalFault(faultMask: number): boolean {
  const faults = decodeFaultMask(faultMask)
  return faults.some(({ name }) =>
    /over|abnormal|under|frequency|overcurrent|overtemperature|islanding/i.test(name)
  )
}
