import type { Months } from '../lib/progress'
import { dayStats } from '../lib/progress'
import type { Task } from '../types'
import { today as todayISO } from '../lib/date'
import { useMonthGrid } from '../lib/useMonthGrid'
import { MonthNav } from './MonthNav'

type Props = {
  tasks: Task[]
  months: Months
  color: string
}

/**
 * Календарь месяца с числами вместо абстрактных точек — сразу видно, какого
 * числа что было сделано, а не только «где-то во второй неделе».
 */
export function MonthCalendar({ tasks, months, color }: Props) {
  const todayDate = todayISO()
  const { cursor, setCursor, grid, atCurrentMonth } = useMonthGrid()

  return (
    <div>
      <MonthNav cursor={cursor} onChange={setCursor} atCurrentMonth={atCurrentMonth} />

      <div className="grid grid-cols-7 gap-1">
        {grid.map((cell, i) => {
          if (!cell) return <div key={`pad-${i}`} />

          const isFuture = cell.date > todayDate
          const isToday = cell.date === todayDate
          const stats = dayStats(tasks, months, cell.date)
          const empty = stats.total === 0

          const bg = isFuture || empty
            ? 'transparent'
            : stats.ratio === 0
              ? 'color-mix(in srgb, var(--color-hint) 18%, transparent)'
              : `color-mix(in srgb, ${color} ${25 + Math.round(stats.ratio * 75)}%, transparent)`

          return (
            <div
              key={cell.date}
              title={empty ? undefined : `${stats.done}/${stats.total}`}
              className="tabular flex aspect-square items-center justify-center rounded-lg text-[13px]"
              style={{
                background: bg,
                color: !isFuture && !empty && stats.ratio > 0.5 ? '#fff' : undefined,
                opacity: isFuture ? 0.35 : 1,
                boxShadow: isToday ? `inset 0 0 0 1.5px ${color}` : undefined,
              }}
            >
              {Number(cell.date.slice(8, 10))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
