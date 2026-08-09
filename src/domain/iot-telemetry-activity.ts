export const IOT_ACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export type TelemetryActivitySource = 'iot-online' | 'mongo-recent' | 'iot-online+mongo-recent' | 'mongo-stale' | 'never-reported'

export type TelemetryActivity = {
  active: boolean
  bucket: 'recent_7d' | 'stale_7d_plus' | 'never_reported'
  source: TelemetryActivitySource
}

export function classifyTelemetryActivity(input: { online: boolean; lastTime: number | null; nowMs: number }): TelemetryActivity {
  const hasRecentMongo = input.lastTime != null && input.nowMs - input.lastTime * 1000 <= IOT_ACTIVITY_WINDOW_MS
  const active = input.online || hasRecentMongo
  return {
    active,
    bucket: active ? 'recent_7d' : input.lastTime == null ? 'never_reported' : 'stale_7d_plus',
    source: input.online ? (hasRecentMongo ? 'iot-online+mongo-recent' : 'iot-online') : hasRecentMongo ? 'mongo-recent' : input.lastTime == null ? 'never-reported' : 'mongo-stale'
  }
}
