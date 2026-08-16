import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Task } from '../types'
import { Screen } from '../components/Screen'
import { Ring } from '../components/Ring'
import { Sheet } from '../components/Sheet'
import { TaskForm } from '../components/TaskForm'
import { GoalForm } from '../components/GoalForm'
import { TaskRow } from '../components/TaskRow'
import { Heatmap } from '../components/Heatmap'
import { Button, EmptyState, SectionTitle } from '../components/ui'
import { accentColor } from '../lib/accents'
import { formatHours, plural, today as todayISO } from '../lib/date'
import { currentStreak, goalProgress, scheduleLabel } from '../lib/progress'
import { bindBackButton, haptic } from '../lib/telegram'

export function GoalDetail({ goalId, onBack }: { goalId: string; onBack: () => void }) {
  const store = useStore()
  const { goals, tasks, months, timer } = store
  const date = todayISO()

  const [taskSheet, setTaskSheet] = useState<{ task?: Task } | null>(null)
  const [goalSheet, setGoalSheet] = useState(false)

  const goal = goals.find((g) => g.id === goalId)
  const goalTasks = useMemo(() => tasks.filter((t) => t.goalId === goalId), [tasks, goalId])

  const progress = useMemo(
    () => (goal ? goalProgress(goal, tasks, months) : null),
    [goal, tasks, months],
  )
  const streak = useMemo(() => currentStreak(goalTasks, months, date), [goalTasks, months, date])

  useEffect(() => bindBackButton(onBack), [onBack])

  // Цель могли удалить из формы — возвращаемся к списку.
  useEffect(() => {
    if (!goal) onBack()
  }, [goal, onBack])

  if (!goal || !progress) return null

  const color = accentColor(goal.accent)
  const running = timer?.goalId === goal.id

  return (
    <Screen>
      <header className="flex items-start gap-3 px-1 pt-1">
        <button
          type="button"
          onClick={onBack}
          aria-label="Назад"
          className="press -ml-2 grid size-9 shrink-0 place-items-center rounded-full text-hint"
        >
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="m15 5-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="min-w-0 flex-1 pt-1 text-[24px] leading-tight font-bold">
          {goal.emoji} {goal.title}
        </h1>
        <button
          type="button"
          onClick={() => setGoalSheet(true)}
          aria-label="Настройки цели"
          className="press -mr-2 grid size-9 shrink-0 place-items-center rounded-full text-hint"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </header>

      <section className="card flex items-center gap-4 p-4">
        <Ring value={progress.ratio} size={84} stroke={8} color={color}>
          <span className="tabular text-[20px] font-bold">{Math.round(progress.ratio * 100)}%</span>
        </Ring>
        <div className="min-w-0 space-y-0.5 text-[14px] text-hint">
          <div className="text-[17px] font-semibold text-ink">
            {progress.doneCount} из {progress.totalCount}
          </div>
          <div>задач закрыто за всё время</div>
          {streak > 0 && <div className="pt-1">🔥 Серия: {streak} {plural(streak, 'день', 'дня', 'дней')}</div>}
          {progress.seconds > 0 && <div>⏱ Всего: {formatHours(progress.seconds)}</div>}
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <SectionTitle>Последние 13 недель</SectionTitle>
        <Heatmap tasks={goalTasks} months={months} color={color} endDate={date} />
      </section>

      <Button
        onClick={() => {
          haptic('tap')
          if (running) store.stopTimer()
          else store.startTimer(goal.id)
        }}
        accent={running ? 'var(--color-danger)' : color}
      >
        {running ? 'Остановить таймер' : 'Запустить таймер'}
      </Button>

      <section>
        <SectionTitle>Задачи</SectionTitle>
        {goalTasks.length === 0 ? (
          <div className="card">
            <EmptyState
              emoji="📝"
              title="Задач ещё нет"
              hint="Разбей цель на маленькие шаги, которые можно отмечать каждый день."
              action={<Button accent={color} onClick={() => setTaskSheet({})}>Добавить задачу</Button>}
            />
          </div>
        ) : (
          <div className="card divide-y divide-line overflow-hidden">
            {goalTasks.map((task) => (
              <div key={task.id}>
                <TaskRow
                  task={task}
                  goal={goal}
                  done={store.isDone(date, task.id)}
                  onToggle={() => store.toggleTask(date, task.id)}
                  onEdit={() => setTaskSheet({ task })}
                />
                {scheduleLabel(task) && (
                  <div className="px-4 pb-2.5 -mt-1.5 pl-14 text-[12px] text-hint">
                    {task.date && '📅 '}
                    {scheduleLabel(task)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {goalTasks.length > 0 && (
        <Button variant="ghost" onClick={() => setTaskSheet({})}>
          + Задача
        </Button>
      )}

      <Sheet
        open={taskSheet !== null}
        title={taskSheet?.task ? 'Задача' : 'Новая задача'}
        onClose={() => setTaskSheet(null)}
      >
        {taskSheet && (
          <TaskForm
            goals={goals}
            task={taskSheet.task}
            defaultGoalId={goal.id}
            onSave={(data) =>
              taskSheet.task ? store.updateTask(taskSheet.task.id, data) : store.addTask(data)
            }
            onDelete={taskSheet.task ? () => store.removeTask(taskSheet.task!.id) : undefined}
            onClose={() => setTaskSheet(null)}
          />
        )}
      </Sheet>

      <Sheet open={goalSheet} title="Цель" onClose={() => setGoalSheet(false)}>
        <GoalForm
          goal={goal}
          onSave={(data) => store.updateGoal(goal.id, data)}
          onDelete={() => store.removeGoal(goal.id)}
          onClose={() => setGoalSheet(false)}
        />
      </Sheet>
    </Screen>
  )
}
