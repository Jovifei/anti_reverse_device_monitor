import { decodeFaultMask, toHexMask } from '@/src/domain/faults'
import { parseTelemetryQuery, parseSn } from '@/src/domain/validation'
import { TelemetryRepository } from '@/src/repositories/telemetry-repository'

export interface TimelinePoint {
  timestamp: string
  valueNumber: number | null
  valueText: string | null
}

export interface ConnectivityTransition {
  at: string
  state: 'online' | 'offline'
  value: number | null
}

export interface OfflineWindow {
  startAt: string
  endAt: string
  durationMinutes: number
}

export interface ConnectivitySummary {
  windowStart: string
  windowEnd: string
  samples: number
  lastSeenAt: string | null
  isOnline: boolean
  offlineMinutes: number
  transitions: ConnectivityTransition[]
  offlineWindows: OfflineWindow[]
}

export interface FaultChange {
  at: string
  eventType: 'appeared' | 'changed' | 'recovered'
  fromMask: number
  toMask: number
  fromFaults: string[]
  toFaults: string[]
  fromHex: string
  toHex: string
}

export interface InverterHistorySummary {
  inverterIndex: number
  inverterSn: string | null
  windowStart: string
  windowEnd: string
  connectivity: ConnectivitySummary
  faultChanges: FaultChange[]
}

const OFFLINE_THRESHOLD_MINUTES = 15
const OFFLINE_THRESHOLD_MS = OFFLINE_THRESHOLD_MINUTES * 60 * 1000

function parseNumericValue(valueNumber: number | null, valueText: string | null | undefined) {
  if (valueNumber === null || Number.isNaN(valueNumber)) {
    if (valueText == null) {
      return null
    }
    const parsed = Number(valueText.trim())
    return Number.isNaN(parsed) ? null : parsed
  }
  return valueNumber
}

function roundMinutes(deltaMs: number) {
  return Math.max(0, Math.round(deltaMs / 60000))
}

function toIso(value: Date | null) {
  return value ? value.toISOString() : null
}

function clampInterval(startAt: Date, endAt: Date, windowStart: Date, windowEnd: Date) {
  const start = new Date(Math.max(startAt.getTime(), windowStart.getTime()))
  const end = new Date(Math.min(endAt.getTime(), windowEnd.getTime()))
  if (end <= start) {
    return null
  }
  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    durationMinutes: roundMinutes(end.getTime() - start.getTime())
  }
}

function normalizeFaultMask(rawMask: number) {
  const integer = Math.trunc(rawMask)
  return Number.isFinite(integer) ? integer >>> 0 : 0
}

function bitSet(mask: number) {
  const active = new Set<number>()
  for (let bit = 0; bit < 32; bit += 1) {
    if (((mask >>> bit) & 1) === 1) {
      active.add(bit)
    }
  }
  return active
}

function toFaultsFromMask(mask: number) {
  return decodeFaultMask(mask).map((item) => item.name)
}

function diffFaultBits(prevMask: number, nextMask: number) {
  const prevSet = bitSet(prevMask)
  const nextSet = bitSet(nextMask)
  const added: number[] = []
  const removed: number[] = []

  for (const bit of nextSet) {
    if (!prevSet.has(bit)) {
      added.push(bit)
    }
  }

  for (const bit of prevSet) {
    if (!nextSet.has(bit)) {
      removed.push(bit)
    }
  }

  return { added, removed }
}

export class TelemetryService {
  constructor(private readonly repo = new TelemetryRepository()) {}

  async getTimeline(deviceSn: string, metricKey: string, rawQuery: unknown, inverterIndex?: number | null) {
    const parsed = parseTelemetryQuery(rawQuery)
    const now = new Date()
    const startAt = new Date(now)
    startAt.setDate(now.getDate() - parsed.days)
    const validatedSn = parseSn(deviceSn)

    const rows = await this.repo.listTelemetryByMetric({
      deviceSn: validatedSn,
      metricKey,
      inverterIndex,
      startAt,
      endAt: now
    })

    return rows.map((row) => ({
      timestamp: row.reportedAt.toISOString(),
      valueNumber: row.valueNumber,
      valueText: row.valueText
    })) as TimelinePoint[]
  }

  async getTimelineCount(
    deviceSn: string,
    metricKey: string,
    rawQuery: unknown,
    inverterIndex?: number | null
  ) {
    const parsed = parseTelemetryQuery(rawQuery)
    const now = new Date()
    const startAt = new Date(now)
    startAt.setDate(now.getDate() - parsed.days)
    const validatedSn = parseSn(deviceSn)

    return this.repo.countTelemetry({
      deviceSn: validatedSn,
      metricKey,
      inverterIndex,
      startAt,
      endAt: now
    })
  }

  async getPlatformConnectivity(deviceSn: string, rawQuery: unknown): Promise<ConnectivitySummary> {
    const parsed = parseTelemetryQuery(rawQuery)
    const endAt = new Date()
    const startAt = new Date(endAt)
    startAt.setDate(endAt.getDate() - parsed.days)
    const validatedSn = parseSn(deviceSn)

    const rows = await this.repo.listTelemetryWindow({
      deviceSn: validatedSn,
      startAt,
      endAt
    })

    const beforeRow = await this.repo.getLatestAnyBefore({
      deviceSn: validatedSn,
      beforeAt: startAt
    })

    const uniqueTimes = Array.from(
      new Set(rows.map((row) => row.reportedAt.getTime()))
    )
      .sort((a, b) => a - b)
      .map((value) => new Date(value))

    const transitions: ConnectivityTransition[] = []
    const offlineWindows: OfflineWindow[] = []

    if (uniqueTimes.length === 0) {
      const baselineSeenAt = beforeRow?.reportedAt ?? null
      if (baselineSeenAt) {
        const baselineGap = endAt.getTime() - baselineSeenAt.getTime()
        if (baselineGap > OFFLINE_THRESHOLD_MS) {
          const window = clampInterval(
            new Date(baselineSeenAt.getTime() + OFFLINE_THRESHOLD_MS),
            endAt,
            startAt,
            endAt
          )
          if (window) {
            offlineWindows.push(window)
            transitions.push({
              at: window.startAt,
              state: 'offline',
              value: null
            })
          }
        } else {
          transitions.push({
            at: baselineSeenAt.toISOString(),
            state: 'online',
            value: null
          })
        }
      }

      return {
        windowStart: startAt.toISOString(),
        windowEnd: endAt.toISOString(),
        samples: 0,
        lastSeenAt: toIso(baselineSeenAt),
        isOnline: baselineSeenAt
          ? endAt.getTime() - baselineSeenAt.getTime() <= OFFLINE_THRESHOLD_MS
          : false,
        offlineMinutes: offlineWindows.reduce((sum, item) => sum + item.durationMinutes, 0),
        transitions,
        offlineWindows
      }
    }

    transitions.push({
      at: uniqueTimes[0].toISOString(),
      state: 'online',
      value: null
    })

    let cursor = uniqueTimes[0]
    if (beforeRow) {
      const beforeGap = cursor.getTime() - beforeRow.reportedAt.getTime()
      if (beforeGap > OFFLINE_THRESHOLD_MS) {
        const fromBefore = new Date(beforeRow.reportedAt.getTime() + OFFLINE_THRESHOLD_MS)
        const fallback = clampInterval(fromBefore, cursor, startAt, endAt)
        if (fallback) {
          offlineWindows.push(fallback)
          transitions.unshift({
            at: fallback.startAt,
            state: 'offline',
            value: null
          })
          transitions.push({
            at: cursor.toISOString(),
            state: 'online',
            value: null
          })
        }
      }
    }

    for (let i = 1; i < uniqueTimes.length; i += 1) {
      const next = uniqueTimes[i]
      const gap = next.getTime() - cursor.getTime()
      if (gap > OFFLINE_THRESHOLD_MS) {
        const window = clampInterval(
          new Date(cursor.getTime() + OFFLINE_THRESHOLD_MS),
          next,
          startAt,
          endAt
        )
        if (window) {
          offlineWindows.push(window)
          transitions.push({
            at: window.startAt,
            state: 'offline',
            value: null
          })
          transitions.push({
            at: next.toISOString(),
            state: 'online',
            value: null
          })
        }
      }
      cursor = next
    }

    const lastSeenAt = uniqueTimes[uniqueTimes.length - 1]
    const lastGap = endAt.getTime() - lastSeenAt.getTime()
    if (lastGap > OFFLINE_THRESHOLD_MS) {
      const endWindow = clampInterval(
        new Date(lastSeenAt.getTime() + OFFLINE_THRESHOLD_MS),
        endAt,
        startAt,
        endAt
      )
      if (endWindow) {
        offlineWindows.push(endWindow)
        transitions.push({
          at: endWindow.startAt,
          state: 'offline',
          value: null
        })
      }
    }

    return {
      windowStart: startAt.toISOString(),
      windowEnd: endAt.toISOString(),
      samples: rows.length,
      lastSeenAt: toIso(lastSeenAt),
      isOnline: lastGap <= OFFLINE_THRESHOLD_MS,
      offlineMinutes: offlineWindows.reduce((sum, item) => sum + item.durationMinutes, 0),
      transitions,
      offlineWindows
    }
  }

  async getInverterConnectivity(deviceSn: string, inverterIndex: number, rawQuery: unknown): Promise<ConnectivitySummary> {
    const parsed = parseTelemetryQuery(rawQuery)
    const endAt = new Date()
    const startAt = new Date(endAt)
    startAt.setDate(endAt.getDate() - parsed.days)
    const validatedSn = parseSn(deviceSn)

    const states = await this.repo.listTelemetryByMetricContains({
      deviceSn: validatedSn,
      metricKeyContains: 'online_state',
      inverterIndex,
      startAt,
      endAt
    })

    if (states.length > 0) {
      const before = await this.repo.getLatestBefore({
        deviceSn: validatedSn,
        metricKey: 'inverter.online_state',
        inverterIndex,
        beforeAt: startAt
      })

      const ordered = states
        .map((row) => ({
          at: row.reportedAt,
          value: parseNumericValue(row.valueNumber, row.valueText)
        }))
        .filter((row): row is { at: Date; value: number } => row.value !== null)
        .sort((a, b) => a.at.getTime() - b.at.getTime())

      const unique = Array.from(new Map(ordered.map((row) => [row.at.getTime(), row]).entries()).values())
      const points = unique.sort((a, b) => a.at.getTime() - b.at.getTime())

      const transitions: ConnectivityTransition[] = []
      const offlineWindows: OfflineWindow[] = []

      const samples = points.length
      if (samples === 0) {
        return this.getInverterHeartbeatConnectivity(validatedSn, inverterIndex, startAt, endAt, parsed.days)
      }

      const initialState = before ? parseNumericValue(before.valueNumber, before.valueText) === 1 : points[0].value === 1
      let currentState: boolean = initialState
      let lastStateAt = before?.reportedAt ?? points[0].at
      let currentOfflineStart: Date | null = currentState ? null : lastStateAt
      let lastSeenAt = points[points.length - 1].at
      transitions.push({
        at: lastStateAt.toISOString(),
        state: currentState ? 'online' : 'offline',
        value: parseNumericValue(before?.valueNumber, before?.valueText)
      })

      for (const point of points) {
        const nextState = point.value === 1
        if (nextState === currentState) {
          if (point.at > lastStateAt) {
            lastStateAt = point.at
          }
          continue
        }

        if (!currentState && nextState) {
          if (currentOfflineStart && point.at > currentOfflineStart) {
            const window = clampInterval(currentOfflineStart, point.at, startAt, endAt)
            if (window) {
              offlineWindows.push(window)
            }
            transitions.push({
              at: point.at.toISOString(),
              state: 'online',
              value: point.value
            })
          }
          currentOfflineStart = null
        } else {
          currentOfflineStart = point.at
          transitions.push({
            at: point.at.toISOString(),
            state: 'offline',
            value: point.value
          })
        }

        currentState = nextState
        lastStateAt = point.at
      }

      const isStale = endAt.getTime() - lastStateAt.getTime() > OFFLINE_THRESHOLD_MS
      if (currentState && isStale) {
        const timeoutStart = new Date(lastStateAt.getTime() + OFFLINE_THRESHOLD_MS)
        if (endAt > timeoutStart) {
          const window = clampInterval(timeoutStart, endAt, startAt, endAt)
          if (window) {
            offlineWindows.push(window)
            transitions.push({
              at: window.startAt,
              state: 'offline',
              value: null
            })
            currentState = false
          }
        }
      }
      if (currentOfflineStart && currentState === false && endAt > currentOfflineStart) {
        const window = clampInterval(currentOfflineStart, endAt, startAt, endAt)
        if (window) {
          offlineWindows.push(window)
          transitions.push({
            at: window.startAt,
            state: 'offline',
            value: null
          })
        }
      }

      return {
        windowStart: startAt.toISOString(),
        windowEnd: endAt.toISOString(),
        samples,
        lastSeenAt: toIso(lastSeenAt),
        isOnline: currentState && !isStale,
        offlineMinutes: offlineWindows.reduce((sum, item) => sum + item.durationMinutes, 0),
        transitions,
        offlineWindows
      }
    }

    return this.getInverterHeartbeatConnectivity(validatedSn, inverterIndex, startAt, endAt, parsed.days)
  }

  private async getInverterHeartbeatConnectivity(
    deviceSn: string,
    inverterIndex: number,
    startAt: Date,
    endAt: Date,
    _: number
  ) {
    const rows = await this.repo.listTelemetryWindow({
      deviceSn,
      inverterIndex,
      startAt,
      endAt
    })

    const uniqueTimes = Array.from(
      new Set(rows.map((row) => row.reportedAt.getTime()))
    )
      .sort((a, b) => a - b)
      .map((value) => new Date(value))

    const transitions: ConnectivityTransition[] = []
    const offlineWindows: OfflineWindow[] = []

    if (uniqueTimes.length === 0) {
      return {
        windowStart: startAt.toISOString(),
        windowEnd: endAt.toISOString(),
        samples: 0,
        lastSeenAt: null,
        isOnline: false,
        offlineMinutes: 0,
        transitions,
        offlineWindows
      }
    }

    transitions.push({
      at: uniqueTimes[0].toISOString(),
      state: 'online',
      value: null
    })

    let cursor = uniqueTimes[0]
    for (let i = 1; i < uniqueTimes.length; i += 1) {
      const next = uniqueTimes[i]
      const gap = next.getTime() - cursor.getTime()
      if (gap > OFFLINE_THRESHOLD_MS) {
        const window = clampInterval(
          new Date(cursor.getTime() + OFFLINE_THRESHOLD_MS),
          next,
          startAt,
          endAt
        )
        if (window) {
          offlineWindows.push(window)
          transitions.push({
            at: window.startAt,
            state: 'offline',
            value: null
          })
          transitions.push({
            at: window.endAt,
            state: 'online',
            value: null
          })
        }
      }
      cursor = next
    }

    const lastSeenAt = uniqueTimes[uniqueTimes.length - 1]
    const trailingGap = endAt.getTime() - lastSeenAt.getTime()
    if (trailingGap > OFFLINE_THRESHOLD_MS) {
      const window = clampInterval(
        new Date(lastSeenAt.getTime() + OFFLINE_THRESHOLD_MS),
        endAt,
        startAt,
        endAt
      )
      if (window) {
        offlineWindows.push(window)
        transitions.push({
          at: window.startAt,
          state: 'offline',
          value: null
        })
      }
    }

    return {
      windowStart: startAt.toISOString(),
      windowEnd: endAt.toISOString(),
      samples: rows.length,
      lastSeenAt: toIso(lastSeenAt),
      isOnline: trailingGap <= OFFLINE_THRESHOLD_MS,
      offlineMinutes: offlineWindows.reduce((sum, item) => sum + item.durationMinutes, 0),
      transitions,
      offlineWindows
    }
  }

  async getInverterFaultChanges(
    deviceSn: string,
    inverterIndex: number,
    rawQuery: unknown
  ): Promise<FaultChange[]> {
    const parsed = parseTelemetryQuery(rawQuery)
    const endAt = new Date()
    const startAt = new Date(endAt)
    startAt.setDate(endAt.getDate() - parsed.days)
    const validatedSn = parseSn(deviceSn)

    const rows = await this.repo.listTelemetryByMetricContains({
      deviceSn: validatedSn,
      metricKeyContains: 'fault_param',
      inverterIndex,
      startAt,
      endAt
    })

    const transitions: FaultChange[] = []
    let prevMask: number | null = null

    const rowsOrdered = rows
      .map((row) => ({
        at: row.reportedAt,
        mask: parseNumericValue(row.valueNumber, row.valueText)
      }))
      .filter((row): row is { at: Date; mask: number } => row.mask !== null)
      .sort((a, b) => a.at.getTime() - b.at.getTime())

    for (const row of rowsOrdered) {
      const nextMask = normalizeFaultMask(row.mask)
      const nextFaults = toFaultsFromMask(nextMask)

      if (prevMask === null) {
        if (nextMask === 0) {
          prevMask = nextMask
          continue
        }

        transitions.push({
          at: row.at.toISOString(),
          eventType: 'appeared',
          fromMask: 0,
          toMask: nextMask,
          fromFaults: [],
          toFaults: nextFaults,
          fromHex: toHexMask(0),
          toHex: toHexMask(nextMask)
        })
        prevMask = nextMask
        continue
      }

      if (nextMask === prevMask) {
        continue
      }

      const fromFaults = toFaultsFromMask(prevMask)
      const { added, removed } = diffFaultBits(prevMask, nextMask)

      if (added.length === 0 && removed.length === 0) {
        continue
      }

      const type: FaultChange['eventType'] =
        added.length > 0 && removed.length === 0
          ? 'appeared'
          : added.length === 0 && removed.length > 0
            ? 'recovered'
            : 'changed'

      transitions.push({
        at: row.at.toISOString(),
        eventType: type,
        fromMask: prevMask,
        toMask: nextMask,
        fromFaults,
        toFaults: nextFaults,
        fromHex: toHexMask(prevMask),
        toHex: toHexMask(nextMask)
      })
      prevMask = nextMask
    }

    return transitions
  }

  async getInverterHistory(
    deviceSn: string,
    inverterIndex: number,
    inverterSn: string | null,
    rawQuery: unknown
  ): Promise<InverterHistorySummary> {
    const validatedSn = parseSn(deviceSn)
    const parsed = parseTelemetryQuery(rawQuery)
    const endAt = new Date()
    const startAt = new Date(endAt)
    startAt.setDate(endAt.getDate() - parsed.days)

    const connectivity = await this.getInverterConnectivity(validatedSn, inverterIndex, rawQuery)
    const faultChanges = await this.getInverterFaultChanges(validatedSn, inverterIndex, rawQuery)

    return {
      inverterIndex,
      inverterSn,
      windowStart: startAt.toISOString(),
      windowEnd: endAt.toISOString(),
      connectivity,
      faultChanges
    }
  }
}
