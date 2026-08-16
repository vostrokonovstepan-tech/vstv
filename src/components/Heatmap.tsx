import { useMemo } from 'react'
import type { Months } from '../lib/progress'
import { dayStats } from '../lib/progress'
import type { Task } from '../types'
import { WEEKDAYS_SHORT, addDays, formatDayMonth, startOfWeek, today as todayISO } from '../lib/date'

const WEEKS = 13

type Props = {
  tasks: Task[]
  months: Months
  color: string
  endDate?: string
}

/** Сетка «неделя-колонка»: 13 недель × 7 дней, как в календаре активности. */
export function Heatmap({ tasks, months, color, endDate = todayISO() }: Props) {
  const columns = useMemo(() => {
    const firstMonday = addDays(startOfWeek(endDate), -7 * (WEEKS - 1))
    return Array.from({ length: WEEKS }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const date = addDays(firstMonday, w * 7 + d)
        const stats = dayStats(tasks, months, date)
        return { date, ...stats, future: date > endDate }
      }),
    )
  }, [tasks, months, endDate])

  return (
    <div className="flex gap-1.5">
      <div className="flex flex-col justify-between py-px text-[9px] text-hint">
        {WEEKDAYS_SHORT.map((d, i) => (
          <span key={d} className="h-3 leading-3">
            {i % 2 === 0 ? d : ''}
          </span>
        ))}
      </div>

      <div className="flex flex-1 justify-between gap-1">
        {columns.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day) => (
              <div
                key={day.date}
                title={`${formatDayMonth(day.date)} — ${day.total === 0 ? 'нет задач' : `${day.done}/${day.total}`}`}
                className="size-3 rounded-[3px]"
                style={{
                  background:
                    day.future || day.total === 0
                      ? 'color-mix(in srgb, var(--color-hint) 12%, transparent)'
                      : day.ratio === 0
                        ? 'color-mix(in srgb, var(--color-hint) 22%, transparent)'
                        : `color-mix(in srgb, ${color} ${25 + Math.round(day.ratio * 75)}%, transparent)`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
