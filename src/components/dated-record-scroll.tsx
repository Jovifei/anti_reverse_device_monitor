import { ReactNode } from 'react'

type DayGroup<T> = {
  date: string
  items: T[]
}

type Props<T> = {
  groups: DayGroup<T>[]
  emptyText: string
  /** Extra class on the scroll shell, e.g. record-scroll-tall */
  scrollClassName?: string
  renderItem: (item: T, index: number) => ReactNode
  itemKey: (item: T, index: number) => string
}

export function DatedRecordScroll<T>({
  groups,
  emptyText,
  scrollClassName = '',
  renderItem,
  itemKey
}: Props<T>) {
  if (!groups.length) return <p className="muted">{emptyText}</p>
  return (
    <div className={`record-scroll ${scrollClassName}`.trim()}>
      {groups.map((group) => (
        <section key={group.date} className="record-day-group">
          <h4 className="record-day-heading">{group.date}</h4>
          <ul className="record-list">
            {group.items.map((item, index) => (
              <li key={itemKey(item, index)}>{renderItem(item, index)}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
