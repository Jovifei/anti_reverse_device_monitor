import { durationEmphasisParts, formatOfflineWindowRange } from '@/src/domain/monitoring'

export function OfflineDurationEmphasis({ minutes }: { minutes: number | null | undefined }) {
  return (
    <span className="offline-duration">
      {durationEmphasisParts(minutes).map((part, index) =>
        part.kind === 'num' ? (
          <strong key={`${part.value}-${index}`} className="offline-duration-emphasis">
            {part.value}
          </strong>
        ) : (
          <span key={`${part.value}-${index}`}>{part.value}</span>
        )
      )}
    </span>
  )
}

export function OfflineWindowLabel({
  startAt,
  endAt,
  durationMinutes
}: {
  startAt: string
  endAt: string | null
  durationMinutes: number
}) {
  return (
    <>
      {formatOfflineWindowRange(startAt, endAt)} · <OfflineDurationEmphasis minutes={durationMinutes} />
    </>
  )
}
