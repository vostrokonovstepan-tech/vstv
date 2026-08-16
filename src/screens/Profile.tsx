import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { Screen, ScreenHeader } from '../components/Screen'
import { Heatmap } from '../components/Heatmap'
import { Sheet } from '../components/Sheet'
import { AiSettingsForm } from '../components/AiSettingsForm'
import { EmptyState, SectionTitle } from '../components/ui'
import { aiConfigured } from '../lib/ai'
import { accentColor } from '../lib/accents'
import {
  WEEKDAYS_SHORT,
  formatHours,
  plural,
  shortWeekdayIndex,
  today as todayISO,
  weekdayOf,
} from '../lib/date'
import { currentStreak, daySeries, goalProgress, longestStreak, totalSeconds } from '../lib/progress'
import { telegramUser } from '../lib/telegram'

const CHART_DAYS = 14

export function Profile() {
  const { goals, tasks, months, ai, setAi } = useStore()
  const date = todayISO()
  const user = telegramUser()
  const [aiSheet, setAiSheet] = useState(false)

  const streak = useMemo(() => currentStreak(tasks, months, date), [tasks, months, date])
  const best = useMemo(() => longestStreak(tasks, months, date), [tasks, months, date])
  const seconds = useMemo(() => totalSeconds(months), [months])
  const series = useMemo(
    () => daySeries(tasks, months, CHART_DAYS, date),
    [tasks, months, date],
  )

  const overall = useMemo(() => {
    let done = 0
    let total = 0
    for (const goal of goals) {
      const p = goalProgress(goal, tasks, months, date)
      done += p.doneCount
      total += p.totalCount
    }
    return { done, total, ratio: total === 0 ? 0 : done / total }
  }, [goals, tasks, months, date])

  return (
    <Screen>
      <ScreenHeader title="Прогресс" subtitle={user?.first_name ? `Привет, ${user.first_name}` : undefined} />

      {goals.length === 0 ? (
        <div className="card">
          <EmptyState
            emoji="📈"
            title="Пока нечего показывать"
            hint="Создай цель и начни отмечать задачи — здесь появится статистика."
          />
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3">
            <Stat value={String(streak)} unit={plural(streak, 'день', 'дня', 'дней')} label="Серия сейчас" emoji="🔥" />
            <Stat value={String(best)} unit={plural(best, 'день', 'дня', 'дней')} label="Лучшая серия" emoji="🏅" />
            <Stat value={`${Math.round(overall.ratio * 100)}%`} label="Задач закрыто" emoji="✅" />
            <Stat value={formatHours(seconds)} label="Времени вложено" emoji="⏱" />
          </section>

          <section className="card space-y-3 p-4">
            <SectionTitle>Последние 2 недели</SectionTitle>
            <div className="flex h-28 items-end gap-1.5">
              {series.map((point) => {
                const isToday = point.date === date
                const height = point.total === 0 ? 0 : Math.max(6, point.ratio * 100)
                return (
                  <div key={point.date} className="flex flex-1 flex-col items-center gap-1.5">
                    <div className="flex h-full w-full items-end">
                      <div
                        className="w-full rounded-md"
                        style={{
                          height: `${height}%`,
                          minHeight: point.total === 0 ? 3 : undefined,
                          background:
                            point.total === 0
                              ? 'color-mix(in srgb, var(--color-hint) 18%, transparent)'
                              : point.ratio >= 1
                                ? 'var(--color-accent)'
                                : 'color-mix(in srgb, var(--color-accent) 45%, transparent)',
                          transition: 'height 320ms cubic-bezier(0.32, 0.72, 0, 1)',
                        }}
                      />
                    </div>
                    <span className={`text-[9px] ${isToday ? 'font-bold text-ink' : 'text-hint'}`}>
                      {WEEKDAYS_SHORT[shortWeekdayIndex(weekdayOf(point.date))]}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="card space-y-3 p-4">
            <SectionTitle>Активность по всем целям</SectionTitle>
            <Heatmap tasks={tasks} months={months} color="var(--color-accent)" endDate={date} />
          </section>

          <section className="card space-y-4 p-4">
            <SectionTitle>По целям</SectionTitle>
            {goals.map((goal) => {
              const p = goalProgress(goal, tasks, months, date)
              const color = accentColor(goal.accent)
              return (
                <div key={goal.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="truncate text-[15px]">
                      {goal.emoji} {goal.title}
                    </span>
                    <span className="tabular shrink-0 text-[13px] font-semibold" style={{ color }}>
                      {Math.round(p.ratio * 100)}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round(p.ratio * 100)}%`,
                        background: color,
                        transition: 'width 420ms cubic-bezier(0.32, 0.72, 0, 1)',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </section>
        </>
      )}

      <section>
        <SectionTitle>Настройки</SectionTitle>
        <button
          type="button"
          onClick={() => setAiSheet(true)}
          className="press card flex w-full items-center gap-3 p-4 text-left"
        >
          <span className="text-[22px]">✨</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">Помощник</span>
            <span className="block truncate text-[13px] text-hint">
              {aiConfigured(ai) ? ai.model : 'Не подключён'}
            </span>
          </span>
          <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-hint" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </section>

      <Sheet open={aiSheet} title="Помощник" onClose={() => setAiSheet(false)}>
        <AiSettingsForm value={ai} onSave={setAi} onClose={() => setAiSheet(false)} />
      </Sheet>
    </Screen>
  )
}

function Stat({
  value,
  unit,
  label,
  emoji,
}: {
  value: string
  unit?: string
  label: string
  emoji: string
}) {
  return (
    <div className="card p-4">
      <div className="text-[15px]">{emoji}</div>
      <div className="tabular mt-1 text-[24px] leading-tight font-bold">
        {value}
        {unit && <span className="ml-1 text-[13px] font-medium text-hint">{unit}</span>}
      </div>
      <div className="mt-0.5 text-[13px] text-hint">{label}</div>
    </div>
  )
}
