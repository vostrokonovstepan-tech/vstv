import { MONTHS_NOM, addMonths } from '../lib/date'
import { haptic } from '../lib/telegram'

/** Заголовок «‹ Август 2026 ›» — общий для всех календарей приложения. */
export function MonthNav({
  cursor,
  onChange,
  atCurrentMonth,
}: {
  cursor: string
  onChange: (next: string) => void
  atCurrentMonth: boolean
}) {
  const [y, m] = cursor.split('-').map(Number)

  return (
    <div className="mb-3 flex items-center justify-between">
      <button
        type="button"
        onClick={() => {
          haptic('select')
          onChange(addMonths(cursor, -1))
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
          onChange(addMonths(cursor, 1))
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
  )
}
