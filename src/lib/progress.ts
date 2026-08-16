import type { DayLog, Goal, MonthLog, Task } from '../types'
import {
  WEEKDAYS_SHORT,
  addDays,
  dayOf,
  daysBetween,
  formatDayMonth,
  monthOf,
  shortWeekdayIndex,
  today,
  weekdayOf,
} from './date'

/** Дальше этого в прошлое не считаем — истории всё равно столько не загружено. */
const MAX_LOOKBACK_DAYS = 366

export type Months = Record<string, MonthLog>

export function getDayLog(months: Months, date: string): DayLog {
  return months[monthOf(date)]?.[dayOf(date)] ?? {}
}

/** Задача запланирована на этот день? Пустой days = каждый день. */
export function isScheduled(task: Task, date: string): boolean {
  if (task.archived) return false
  // Разовая задача живёт ровно один день. На createdAt не смотрим намеренно:
  // дату можно поставить и задним числом, чтобы отметить уже сделанное.
  if (task.date) return task.date === date
  if (date < task.createdAt) return false
  return task.days.length === 0 || task.days.includes(weekdayOf(date))
}

/**
 * Подпись расписания под задачей: «16 августа» для разовой,
 * «пн, ср, пт» для выборочных дней, null для ежедневной — там подпись лишняя.
 */
export function scheduleLabel(task: Task): string | null {
  if (task.date) return formatDayMonth(task.date)
  if (task.days.length === 0) return null
  return task.days
    .slice()
    .sort((a, b) => shortWeekdayIndex(a) - shortWeekdayIndex(b))
    .map((d) => WEEKDAYS_SHORT[shortWeekdayIndex(d)])
    .join(', ')
}

export function tasksForDate(tasks: Task[], date: string): Task[] {
  return tasks.filter((t) => isScheduled(t, date))
}

export type DayStats = {
  total: number
  done: number
  /** 0…1; для дня без задач — 0 */
  ratio: number
}

export function dayStats(tasks: Task[], months: Months, date: string): DayStats {
  const scheduled = tasksForDate(tasks, date)
  const doneIds = getDayLog(months, date).d ?? []
  const done = scheduled.filter((t) => doneIds.includes(t.id)).length
  return {
    total: scheduled.length,
    done,
    ratio: scheduled.length === 0 ? 0 : done / scheduled.length,
  }
}

/**
 * Длина текущей серии: сколько дней подряд закрыты все запланированные задачи.
 * Дни без задач серию не рвут и не удлиняют. Незакрытый сегодняшний день
 * тоже не рвёт — серия ещё в силе до конца суток.
 */
export function currentStreak(tasks: Task[], months: Months, from = today()): number {
  let streak = 0
  let date = from
  for (let i = 0; i < MAX_LOOKBACK_DAYS; i++) {
    const { total, done } = dayStats(tasks, months, date)
    if (total > 0) {
      if (done >= total) streak++
      else if (date !== from) break
    }
    date = addDays(date, -1)
  }
  return streak
}

export function longestStreak(tasks: Task[], months: Months, from = today()): number {
  let best = 0
  let run = 0
  let date = from
  for (let i = 0; i < MAX_LOOKBACK_DAYS; i++) {
    const { total, done } = dayStats(tasks, months, date)
    if (total > 0) {
      if (done >= total) {
        run++
        if (run > best) best = run
      } else {
        run = 0
      }
    }
    date = addDays(date, -1)
  }
  return best
}

export type GoalProgress = {
  /** 0…1 — доля закрытых задач за всё время существования цели */
  ratio: number
  doneCount: number
  totalCount: number
  seconds: number
  /** Дней до дедлайна; отрицательное — просрочено. undefined, если дедлайна нет. */
  daysLeft?: number
}

export function goalProgress(goal: Goal, tasks: Task[], months: Months, upTo = today()): GoalProgress {
  const goalTasks = tasks.filter((t) => t.goalId === goal.id)
  const span = Math.min(daysBetween(goal.createdAt, upTo), MAX_LOOKBACK_DAYS)

  let doneCount = 0
  let totalCount = 0
  let seconds = 0

  for (let i = 0; i <= Math.max(0, span); i++) {
    const date = addDays(upTo, -i)
    if (date < goal.createdAt) break
    const log = getDayLog(months, date)
    seconds += log.s?.[goal.id] ?? 0
    const scheduled = goalTasks.filter((t) => isScheduled(t, date))
    totalCount += scheduled.length
    const doneIds = log.d ?? []
    doneCount += scheduled.filter((t) => doneIds.includes(t.id)).length
  }

  return {
    ratio: totalCount === 0 ? 0 : doneCount / totalCount,
    doneCount,
    totalCount,
    seconds,
    daysLeft: goal.deadline ? daysBetween(upTo, goal.deadline) : undefined,
  }
}

/** Секунды по всем целям (или по одной) за загруженную историю. */
export function totalSeconds(months: Months, goalId?: string): number {
  let sum = 0
  for (const month of Object.values(months)) {
    for (const day of Object.values(month)) {
      if (!day.s) continue
      if (goalId) sum += day.s[goalId] ?? 0
      else for (const v of Object.values(day.s)) sum += v
    }
  }
  return sum
}

export type DayPoint = { date: string; ratio: number; total: number; done: number; seconds: number }

/** Ряд из `days` последних дней, от старых к новым — для графиков и хитмапа. */
export function daySeries(
  tasks: Task[],
  months: Months,
  days: number,
  endDate = today(),
  goalId?: string,
): DayPoint[] {
  const scope = goalId ? tasks.filter((t) => t.goalId === goalId) : tasks
  const out: DayPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(endDate, -i)
    const stats = dayStats(scope, months, date)
    const log = getDayLog(months, date)
    const seconds = goalId
      ? (log.s?.[goalId] ?? 0)
      : Object.values(log.s ?? {}).reduce((a, b) => a + b, 0)
    out.push({ date, ratio: stats.ratio, total: stats.total, done: stats.done, seconds })
  }
  return out
}
