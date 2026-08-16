import { useMemo, useState } from 'react'
import type { Months } from '../lib/progress'
import { dayStats } from '../lib/progress'
import type { Task } from '../types'
import {
  MONTHS_NOM,
  addMonths,
  daysInMonth,
  monthOf,
  shortWeekdayIndex,
  today as todayISO,
  weekdayOf,
} from '../lib/date'
import { haptic } from '../lib/telegram'

type Cell = { date: string } | null

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
  const currentMonth = monthOf(todayDate)
  const [cursor, setCursor] = useState(currentMonth)

  const grid = useMemo(() => {
    const lead = shortWeekdayIndex(weekdayOf(`${cursor}-01`))
    const total = daysInMonth(cursor)

    const cells: Cell[] = Array.from({ length: lead }, () => null)
    for (let d = 1; d <= total; d++) {
      cells.push({ date: `${cursor}-${String(d).padStart(2, '0')}` })
    }
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [cursor])

  const [y, m] = cursor.split('-').map(Number)
  const atCurrentMonth = cursor >= currentMonth

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            haptic('select')
            setCursor((c) => addMonths(c, -1))
          }}
          aria-label="Предыдущий месяц"
          className="press grid size-8 place-items-center rounded-full text-hint"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2}>
            <path d="m15 5-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="text-[14px] font-medium capitalize">
          {MONTHS_NOM[m - 1]} {y}
        </span>
        <button
          type="button"
          onClick={() => {
            haptic('select')
            setCursor((c) => addMonths(c, 1))
          }}
          disabled={atCurrentMonth}
          aria-label="Следующий месяц"
          className="press grid size-8 place-items-center rounded-full text-hint disabled:opacity-30"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2}>
            <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

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
