import { useState } from 'react'
import { useStore } from '../store'
import { Screen, ScreenHeader } from '../components/Screen'
import { MonthNav } from '../components/MonthNav'
import { NoteEditor } from '../components/NoteEditor'
import { Sheet } from '../components/Sheet'
import { SectionTitle } from '../components/ui'
import { useMonthGrid } from '../lib/useMonthGrid'
import { formatFullDate, today as todayISO } from '../lib/date'
import { haptic } from '../lib/telegram'

export function Notes() {
  const { getNote } = useStore()
  const date = todayISO()
  const { cursor, setCursor, grid, atCurrentMonth } = useMonthGrid()
  const [openDate, setOpenDate] = useState<string | null>(null)

  return (
    <Screen>
      <ScreenHeader title="Заметки" subtitle="Что полезного сделал сегодня" />

      <section className="card space-y-3 p-4">
        <SectionTitle>Сегодня</SectionTitle>
        <NoteEditor date={date} />
      </section>

      <section className="card space-y-3 p-4">
        <SectionTitle>Календарь</SectionTitle>
        <MonthNav cursor={cursor} onChange={setCursor} atCurrentMonth={atCurrentMonth} />

        <div className="grid grid-cols-7 gap-1">
          {grid.map((cell, i) => {
            if (!cell) return <div key={`pad-${i}`} />

            const isFuture = cell.date > date
            const isToday = cell.date === date
            const hasNote = Boolean(getNote(cell.date))

            return (
              <button
                key={cell.date}
                type="button"
                disabled={isFuture}
                onClick={() => {
                  haptic('select')
                  setOpenDate(cell.date)
                }}
                className="press tabular flex aspect-square items-center justify-center rounded-lg text-[13px] disabled:opacity-30"
                style={{
                  background: hasNote
                    ? 'color-mix(in srgb, var(--color-accent) 22%, transparent)'
                    : 'var(--color-surface)',
                  color: hasNote ? 'var(--color-accent)' : undefined,
                  fontWeight: hasNote ? 600 : 400,
                  boxShadow: isToday ? 'inset 0 0 0 1.5px var(--color-accent)' : undefined,
                }}
              >
                {Number(cell.date.slice(8, 10))}
              </button>
            )
          })}
        </div>
      </section>

      <Sheet
        open={openDate !== null}
        title={openDate ? formatFullDate(openDate) : ''}
        onClose={() => setOpenDate(null)}
      >
        {openDate && <NoteEditor date={openDate} autoFocus />}
      </Sheet>
    </Screen>
  )
}
