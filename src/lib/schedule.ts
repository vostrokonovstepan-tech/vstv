import type { Task } from '../types'

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export const MIN_DURATION = 5
export const MAX_DURATION = 720

export const isValidTime = (v: unknown): v is string => typeof v === 'string' && TIME_RE.test(v)

/** «9:00», «09:00», «18:00:00» → «HH:MM»; всё непохожее на время — undefined. */
export function normalizeTime(v: unknown): string | undefined {
  const m = typeof v === 'string' ? v.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/) : null
  if (!m) return undefined
  const t = `${m[1].padStart(2, '0')}:${m[2]}`
  return TIME_RE.test(t) ? t : undefined
}

/** Длительность в минутах — целое в разумных пределах, иначе undefined. */
export function cleanDuration(v: unknown): number | undefined {
  const n = Number(v)
  return Number.isInteger(n) && n >= MIN_DURATION && n <= MAX_DURATION ? n : undefined
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function fromMinutes(total: number): string {
  const t = ((total % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/** «18:00–19:30», а без длительности — просто «18:00». */
export function timeRange(time: string, duration?: number): string {
  return duration ? `${time}–${fromMinutes(toMinutes(time) + duration)}` : time
}

/** Время окончания «HH:MM» или null, если длительность не задана. */
export function endTime(time: string, duration?: number): string | null {
  return duration ? fromMinutes(toMinutes(time) + duration) : null
}

/** Совпадают ли дни, дата и время — без учёта названия и длительности. */
export function sameSchedule(a: Task, b: Task): boolean {
  return (
    (a.date ?? '') === (b.date ?? '') &&
    (a.time ?? '') === (b.time ?? '') &&
    [...a.days].sort().join() === [...b.days].sort().join()
  )
}

/** Конец блока в минутах от полуночи; блок без длительности занимает одну точку. */
const endMinutes = (t: Task) => toMinutes(t.time!) + (t.duration ?? 0)

/** Сначала задачи со временем по возрастанию, затем без времени — в исходном порядке. */
export function sortByTime<T extends Task>(tasks: T[]): T[] {
  return tasks
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      if (a.t.time && b.t.time) return toMinutes(a.t.time) - toMinutes(b.t.time) || a.i - b.i
      if (a.t.time) return -1
      if (b.t.time) return 1
      return a.i - b.i
    })
    .map((x) => x.t)
}

/**
 * id задач, чьё время пересекается с другой задачей этого же дня.
 * Блоки, стыкующиеся встык (конец = начало следующего), пересечением не считаются.
 * Блок без длительности пересекается только если попадает строго внутрь чужого.
 */
export function findOverlaps(tasks: Task[]): Set<string> {
  const timed = sortByTime(tasks.filter((t) => t.time))
  const clash = new Set<string>()
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i]
      const b = timed[j]
      if (toMinutes(b.time!) >= endMinutes(a)) break
      clash.add(a.id)
      clash.add(b.id)
    }
  }
  return clash
}
