/** Все даты в приложении — локальные, в формате YYYY-MM-DD. */

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function today(): string {
  return toISO(new Date())
}

/** "2026-08-16" → "2026-08" */
export function monthOf(iso: string): string {
  return iso.slice(0, 7)
}

/** "2026-08-16" → "16" (без ведущего нуля — так короче в хранилище) */
export function dayOf(iso: string): string {
  return String(Number(iso.slice(8, 10)))
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

/** Последние N месяцев в формате YYYY-MM, начиная с текущего. */
export function recentMonths(n: number, from = new Date()): string[] {
  const out: string[] = []
  const d = new Date(from.getFullYear(), from.getMonth(), 1)
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() - 1)
  }
  return out
}

/** 0 = вс … 6 = сб */
export function weekdayOf(iso: string): number {
  return fromISO(iso).getDay()
}

/** Понедельник недели, в которую попадает дата. */
export function startOfWeek(iso: string): string {
  const wd = weekdayOf(iso)
  return addDays(iso, wd === 0 ? -6 : 1 - wd)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86_400_000)
}

const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

const WEEKDAYS_FULL = [
  'воскресенье', 'понедельник', 'вторник', 'среда',
  'четверг', 'пятница', 'суббота',
]

export const WEEKDAYS_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

/** Индекс в WEEKDAYS_SHORT (пн-первый) для номера дня недели (вс = 0). */
export function shortWeekdayIndex(weekday: number): number {
  return (weekday + 6) % 7
}

export function formatDayMonth(iso: string): string {
  const d = fromISO(iso)
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`
}

export function formatFullDate(iso: string): string {
  const d = fromISO(iso)
  return `${WEEKDAYS_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`
}

/** Склонение: plural(5, 'день', 'дня', 'дней') → 'дней' */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

/** 3725 → "1:02:05", 125 → "2:05" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
  return h > 0
    ? `${h}:${mm}:${String(sec).padStart(2, '0')}`
    : `${mm}:${String(sec).padStart(2, '0')}`
}

/** 5400 → "1 ч 30 мин" */
export function formatHours(totalSeconds: number): string {
  const mins = Math.round(totalSeconds / 60)
  if (mins < 60) return `${mins} мин`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`
}
