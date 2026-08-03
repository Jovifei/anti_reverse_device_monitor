import { formatOnlineInverterCountHtml, normalizeInverterCounts } from '@/src/domain/online-inverter-count'

type Props = {
  online: number
  /** Paired (or total slot) count used in `online/total`. */
  total: number
  className?: string
}

/** Display: `online/total`. All green when complete; online green + total red when any offline. */
export function OnlineInverterCount({ online, total, className = '' }: Props) {
  const counts = normalizeInverterCounts(online, total)
  const onlineClass =
    counts.allOnline || counts.online > 0 ? 'online-inverter-count-online is-ok' : 'online-inverter-count-online'
  const totalClass = counts.allOnline ? 'online-inverter-count-total is-ok' : 'online-inverter-count-total is-alert'
  return (
    <span
      className={`online-inverter-count ${className}`.trim()}
      title={`在线 ${counts.online}，离线 ${counts.offline}（共 ${counts.total}）`}
    >
      <span className={onlineClass}>{counts.online}</span>
      <span className="online-inverter-count-sep">/</span>
      <span className={totalClass}>{counts.total}</span>
    </span>
  )
}

export { formatOnlineInverterCountHtml }
