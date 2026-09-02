import { useMemo, useState } from 'react'
import { daysInMonth, monthOf, shortWeekdayIndex, today as todayISO, weekdayOf } from './date'

export type GridCell = { date: string } | null

/**
 * Сетка дат месяца с ведущими пустыми ячейками до первого понедельника —
 * общая для всех календарных виджетов приложения.
 */
export function useMonthGrid() {
  const currentMonth = monthOf(todayISO())
  const [cursor, setCursor] = useState(currentMonth)

  const grid = useMemo(() => {
    const lead = shortWeekdayIndex(weekdayOf(`${cursor}-01`))
    const total = daysInMonth(cursor)

    const cells: GridCell[] = Array.from({ length: lead }, () => null)
    for (let d = 1; d <= total; d++) {
      cells.push({ date: `${cursor}-${String(d).padStart(2, '0')}` })
    }
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [cursor])

  return { cursor, setCursor, grid, currentMonth, atCurrentMonth: cursor >= currentMonth }
}
