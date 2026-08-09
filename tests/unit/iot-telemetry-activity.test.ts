import { describe, expect, it } from 'vitest'
import { classifyTelemetryActivity, IOT_ACTIVITY_WINDOW_MS } from '@/src/domain/iot-telemetry-activity'

const nowMs = Date.parse('2026-08-09T08:00:00.000Z')

describe('classifyTelemetryActivity', () => {
  it('keeps an IoT-online device active without Mongo telemetry', () => {
    expect(classifyTelemetryActivity({ online: true, lastTime: null, nowMs })).toEqual({ active: true, bucket: 'recent_7d', source: 'iot-online' })
  })

  it('keeps a recent Mongo device active when IoT is offline', () => {
    const lastTime = (nowMs - 2 * 24 * 60 * 60 * 1000) / 1000
    expect(classifyTelemetryActivity({ online: false, lastTime, nowMs })).toEqual({ active: true, bucket: 'recent_7d', source: 'mongo-recent' })
  })

  it('includes the exact seven-day boundary', () => {
    const lastTime = (nowMs - IOT_ACTIVITY_WINDOW_MS) / 1000
    expect(classifyTelemetryActivity({ online: false, lastTime, nowMs }).active).toBe(true)
  })

  it('marks an offline device without telemetry as never reported', () => {
    expect(classifyTelemetryActivity({ online: false, lastTime: null, nowMs })).toEqual({ active: false, bucket: 'never_reported', source: 'never-reported' })
  })
})
