import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Task } from '../types'
import { Screen, ScreenHeader } from '../components/Screen'
import { Ring } from '../components/Ring'
import { TaskRow } from '../components/TaskRow'
import { Sheet } from '../components/Sheet'
import { TaskForm } from '../components/TaskForm'
import { GoalForm } from '../components/GoalForm'
import { Button, EmptyState, SectionTitle } from '../components/ui'
import { accentColor } from '../lib/accents'
import { formatFullDate, formatHours, plural, today as todayISO } from '../lib/date'
import { currentStreak, dayStats, getDayLog, tasksForDate } from '../lib/progress'
import { haptic } from '../lib/telegram'

export function Today() {
  const store = useStore()
  const { goals, tasks, months, timer } = store
  const date = todayISO()

  const [taskSheet, setTaskSheet] = useState<{ task?: Task; goalId?: string } | null>(null)
  const [goalSheet, setGoalSheet] = useState(false)

  const stats = useMemo(() => dayStats(tasks, months, date), [tasks, months, date])
  const streak = useMemo(() => currentStreak(tasks, months, date), [tasks, months, date])
  const todaySeconds = useMemo(() => {
    const log = getDayLog(months, date)
    return Object.values(log.s ?? {}).reduce((a, b) => a + b, 0)
  }, [months, date])

  /** Задачи на сегодня, сгруппированные по целям — порядок целей сохраняем. */
  const groups = useMemo(() => {
    const due = tasksForDate(tasks, date)
    return goals
      .map((goal) => ({ goal, items: due.filter((t) => t.goalId === goal.id) }))
      .filter((group) => group.items.length > 0)
  }, [goals, tasks, date])

  if (goals.length === 0) {
    return (
      <Screen>
        <ScreenHeader title="Сегодня" subtitle={formatFullDate(date)} />
        <div className="card">
          <EmptyState
            emoji="🎯"
            title="Начни с большой цели"
            hint="Одна цель — и маленькие задачи, которыми ты идёшь к ней каждый день."
            action={<Button onClick={() => setGoalSheet(true)}>Создать цель</Button>}
          />
        </div>
        <Sheet open={goalSheet} title="Новая цель" onClose={() => setGoalSheet(false)}>
          <GoalForm onSave={store.addGoal} onClose={() => setGoalSheet(false)} />
        </Sheet>
      </Screen>
    )
  }

  return (
    <Screen>
      <ScreenHeader title="Сегодня" subtitle={formatFullDate(date)} />

      <section className="card flex items-center gap-4 p-4">
        <Ring value={stats.ratio} size={84} stroke={8}>
          <span className="tabular text-[20px] font-bold">{Math.round(stats.ratio * 100)}%</span>
        </Ring>
        <div className="min-w-0">
          <div className="text-[17px] font-semibold">
            {stats.total === 0
              ? 'Задач на сегодня нет'
              : `${stats.done} из ${stats.total} ${plural(stats.total, 'задачи', 'задач', 'задач')}`}
          </div>
          <div className="mt-1 space-y-0.5 text-[14px] text-hint">
            {streak > 0 && <div>🔥 Серия: {streak} {plural(streak, 'день', 'дня', 'дней')}</div>}
            {todaySeconds > 0 && <div>⏱ Сегодня: {formatHours(todaySeconds)}</div>}
            {streak === 0 && todaySeconds === 0 && stats.total > 0 && <div>Закрой все задачи — начнётся серия</div>}
          </div>
        </div>
      </section>

      {!timer && (
        <section>
          <SectionTitle>Таймер</SectionTitle>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {goals.map((goal) => (
              <button
                key={goal.id}
                type="button"
                onClick={() => {
                  haptic('tap')
                  store.startTimer(goal.id)
                }}
                className="press flex shrink-0 items-center gap-2 rounded-2xl px-3.5 py-2.5 text-[14px] font-medium"
                style={{
                  background: `color-mix(in srgb, ${accentColor(goal.accent)} 16%, transparent)`,
                  color: accentColor(goal.accent),
                }}
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
                  <path d="M8 5.5v13l11-6.5-11-6.5Z" />
                </svg>
                {goal.emoji} {goal.title}
              </button>
            ))}
          </div>
        </section>
      )}

      {groups.length === 0 ? (
        <div className="card">
          <EmptyState
            emoji="🌤"
            title="На сегодня свободно"
            hint="Ни одна задача не запланирована на этот день недели."
            action={<Button variant="ghost" onClick={() => setTaskSheet({})}>Добавить задачу</Button>}
          />
        </div>
      ) : (
        groups.map(({ goal, items }) => {
          const done = items.filter((t) => store.isDone(date, t.id)).length
          return (
            <section key={goal.id}>
              <SectionTitle
                action={
                  <span className="tabular text-[13px] font-semibold" style={{ color: accentColor(goal.accent) }}>
                    {done}/{items.length}
                  </span>
                }
              >
                {goal.emoji} {goal.title}
              </SectionTitle>
              <div className="card divide-y divide-line overflow-hidden">
                {items.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    goal={goal}
                    done={store.isDone(date, task.id)}
                    onToggle={() => store.toggleTask(date, task.id)}
                    onEdit={() => setTaskSheet({ task })}
                  />
                ))}
              </div>
            </section>
          )
        })
      )}

      <Button variant="ghost" onClick={() => setTaskSheet({})}>
        + Задача
      </Button>

      <Sheet
        open={taskSheet !== null}
        title={taskSheet?.task ? 'Задача' : 'Новая задача'}
        onClose={() => setTaskSheet(null)}
      >
        {taskSheet && (
          <TaskForm
            goals={goals}
            task={taskSheet.task}
            defaultGoalId={taskSheet.goalId}
            onSave={(data) =>
              taskSheet.task ? store.updateTask(taskSheet.task.id, data) : store.addTask(data)
            }
            onDelete={taskSheet.task ? () => store.removeTask(taskSheet.task!.id) : undefined}
            onClose={() => setTaskSheet(null)}
          />
        )}
      </Sheet>
    </Screen>
  )
}
