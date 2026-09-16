import { addDays, dayOf, formatDayMonth, monthOf, today } from './date'

/** Та же форма, что в сторе: месяц → день → текст заметки. */
export type NotesStore = Record<string, Record<string, string>>

export function getNoteFor(notes: NotesStore, date: string): string {
  return notes[monthOf(date)]?.[dayOf(date)] ?? ''
}

/**
 * Заметки за последние `days` дней, от старых к новым, с датами — то, что можно
 * подать модели как есть. Пустые дни пропускаются, а не подставляются пустой строкой,
 * иначе промпт раздувается зря.
 */
export function recentNotesText(notes: NotesStore, days: number, upTo = today()): string | null {
  const lines: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(upTo, -i)
    const text = getNoteFor(notes, date)
    if (text) lines.push(`${formatDayMonth(date)}: ${text}`)
  }
  return lines.length > 0 ? lines.join('\n') : null
}
