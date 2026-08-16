import { useState } from 'react'
import { useStore } from '../store'
import { Screen, ScreenHeader } from '../components/Screen'
import { Ring } from '../components/Ring'
import { Sheet } from '../components/Sheet'
import { GoalForm } from '../components/GoalForm'
import { Button, EmptyState } from '../components/ui'
import { accentColor } from '../lib/accents'
import { formatHours, plural } from '../lib/date'
import { goalProgress } from '../lib/progress'

export function Goals({ onOpen }: { onOpen: (goalId: string) => void }) {
  const store = useStore()
  const { goals, tasks, months } = store
  const [sheet, setSheet] = useState(false)

  return (
    <Screen>
      <ScreenHeader title="Цели" subtitle={goals.length > 0 ? `${goals.length} ${plural(goals.length, 'цель', 'цели', 'целей')}` : undefined} />

      {goals.length === 0 ? (
        <div className="card">
          <EmptyState
            emoji="🎯"
            title="Целей пока нет"
            hint="Большая цель, к которой ты идёшь маленькими шагами каждый день."
            action={<Button onClick={() => setSheet(true)}>Создать цель</Button>}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map((goal) => {
            const progress = goalProgress(goal, tasks, months)
            const color = accentColor(goal.accent)
            const goalTasks = tasks.filter((t) => t.goalId === goal.id).length

            return (
              <button
                key={goal.id}
                type="button"
                onClick={() => onOpen(goal.id)}
                className="press card flex w-full items-center gap-4 p-4 text-left"
              >
                <Ring value={progress.ratio} size={64} stroke={7} color={color}>
                  <span className="text-[22px]">{goal.emoji}</span>
                </Ring>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] font-semibold">{goal.title}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[13px] text-hint">
                    <span className="tabular">{Math.round(progress.ratio * 100)}% выполнено</span>
                    <span>{goalTasks} {plural(goalTasks, 'задача', 'задачи', 'задач')}</span>
                    {progress.seconds > 0 && <span>{formatHours(progress.seconds)}</span>}
                  </div>
                  {progress.daysLeft !== undefined && (
                    <div
                      className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[12px] font-medium"
                      style={{
                        background: `color-mix(in srgb, ${progress.daysLeft < 0 ? 'var(--color-danger)' : color} 16%, transparent)`,
                        color: progress.daysLeft < 0 ? 'var(--color-danger)' : color,
                      }}
                    >
                      {progress.daysLeft < 0
                        ? `просрочено на ${-progress.daysLeft} ${plural(-progress.daysLeft, 'день', 'дня', 'дней')}`
                        : progress.daysLeft === 0
                          ? 'дедлайн сегодня'
                          : `${progress.daysLeft} ${plural(progress.daysLeft, 'день', 'дня', 'дней')} до дедлайна`}
                    </div>
                  )}
                </div>

                <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-hint" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )
          })}

          <Button variant="ghost" onClick={() => setSheet(true)}>
            + Цель
          </Button>
        </div>
      )}

      <Sheet open={sheet} title="Новая цель" onClose={() => setSheet(false)}>
        <GoalForm onSave={store.addGoal} onClose={() => setSheet(false)} />
      </Sheet>
    </Screen>
  )
}
