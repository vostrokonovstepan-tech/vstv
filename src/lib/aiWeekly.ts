import { chat, type AiSettings } from './ai'
import { formatHours, plural, today } from './date'
import { currentStreak, daySeries, type Months } from './progress'
import type { Goal, Task } from '../types'

const SYSTEM = `Ты анализируешь неделю пользователя в трекере целей. Тебе дают цифры —
проценты выполнения, серии дней подряд, потраченное время — по каждой цели за
последние 7 дней.

Дай короткий честный разбор: что получилось хорошо, что систематически не
получается, и ровно одну конкретную рекомендацию — не общие слова вроде «старайся
лучше», а что именно сделать (перенести задачу на другой день, уменьшить нагрузку,
убрать то, что не делается неделями).

3–5 предложений, без списков и заголовков, тем же языком, на котором названы цели
пользователя. Если данных мало (цели только созданы) — так и скажи, без выдумывания
выводов на пустом месте.`

/** Текстовая сводка по одной цели за последние 7 дней — то, что уходит в промпт. */
function goalWeekSummary(goal: Goal, tasks: Task[], months: Months): string | null {
  const goalTasks = tasks.filter((t) => t.goalId === goal.id)
  const series = daySeries(goalTasks, months, 7, today(), goal.id)

  const done = series.reduce((a, d) => a + d.done, 0)
  const total = series.reduce((a, d) => a + d.total, 0)
  const seconds = series.reduce((a, d) => a + d.seconds, 0)

  if (total === 0 && seconds === 0) return null

  const streak = currentStreak(goalTasks, months)
  const ratio = total === 0 ? 0 : Math.round((done / total) * 100)

  const parts = [`${goal.title}: за неделю ${done} из ${total} задач (${ratio}%)`]
  if (streak > 0) parts.push(`серия ${streak} ${plural(streak, 'день', 'дня', 'дней')}`)
  if (seconds > 0) parts.push(`потрачено ${formatHours(seconds)}`)
  return parts.join(', ')
}

export async function askWeeklyReview(
  settings: AiSettings,
  goals: Goal[],
  tasks: Task[],
  months: Months,
): Promise<string> {
  const lines = goals
    .map((g) => goalWeekSummary(g, tasks, months))
    .filter((l): l is string => l !== null)

  const body =
    lines.length > 0
      ? lines.join('\n')
      : 'За последнюю неделю нет ни одной отметки о выполнении и потраченном времени.'

  return chat(settings, [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: body },
  ], { maxTokens: 500 })
}
