export function shardTimeRange(from: Date, to: Date, shardMs: number): Array<{ from: Date; to: Date }> {
  if (to.getTime() <= from.getTime()) return []
  const shards: Array<{ from: Date; to: Date }> = []
  let cursor = to.getTime()
  while (cursor > from.getTime()) {
    const start = Math.max(from.getTime(), cursor - shardMs)
    shards.push({ from: new Date(start), to: new Date(cursor) })
    cursor = start
  }
  return shards
}
