import { chat, type AiSettings } from './ai'
import { addDays, dayOf, formatDayMonth, formatHours, monthOf, plural, today } from './date'
import { currentStreak, daySeries, type Months } from './progress'
import type { Goal, Task } from '../types'

const SYSTEM = `Ты анализируешь неделю пользователя в трекере целей. Тебе дают цифры —
проценты выполнения, серии дней подряд, потраченное время — по каждой цели за
последние 7 дней, а также собственные заметки пользователя за эти дни, если он
их писал: что он сам считает сделанным полезного.

Опирайся на заметки, а не только на цифры — если пользователь писал, что именно
делал, упомяни это конкретно, а не общими словами. Цифры показывают, что было
сделано формально; заметки — было ли это осмысленно. Если между ними расхождение
(например, задачи отмечены выполненными, но заметок нет, или наоборот) — это
тоже стоит заметить.

Дай короткий честный разбор: что получилось хорошо, что систематически не
получается, и ровно одну конкретную рекомендацию — не общие слова вроде «старайся
лучше», а что именно сделать (перенести задачу на другой день, уменьшить нагрузку,
убрать то, что не делается неделями).

3–5 предложений, без списков и заголовков, тем же языком, на котором названы цели
пользователя. Если данных мало (цели только созданы, заметок нет) — так и скажи,
без выдумывания выводов на пустом месте.`

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

/** Заметки за последние `days` дней, от старых к новым — то, что реально писал пользователь. */
function recentNotesText(notes: Record<string, Record<string, string>>, days = 7): string | null {
  const lines: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today(), -i)
    const text = notes[monthOf(date)]?.[dayOf(date)]
    if (text) lines.push(`${formatDayMonth(date)}: ${text}`)
  }
  return lines.length > 0 ? lines.join('\n') : null
}

export async function askWeeklyReview(
  settings: AiSettings,
  goals: Goal[],
  tasks: Task[],
  months: Months,
  notes: Record<string, Record<string, string>>,
): Promise<string> {
  const statLines = goals
    .map((g) => goalWeekSummary(g, tasks, months))
    .filter((l): l is string => l !== null)

  const stats =
    statLines.length > 0
      ? statLines.join('\n')
      : 'За последнюю неделю нет ни одной отметки о выполнении и потраченном времени.'

  const notesText = recentNotesText(notes)

  const body = notesText
    ? `Цифры по целям:\n${stats}\n\nЗаметки пользователя за неделю:\n${notesText}`
    : `Цифры по целям:\n${stats}\n\nЗаметок за эту неделю пользователь не писал.`

  return chat(settings, [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: body },
  ], { maxTokens: 500 })
}
