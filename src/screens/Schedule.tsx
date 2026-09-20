import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Task } from '../types'
import { Screen, ScreenHeader } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import { TaskForm } from '../components/TaskForm'
import { TaskRow } from '../components/TaskRow'
import { Button, EmptyState, SectionTitle } from '../components/ui'
import { accentColor } from '../lib/accents'
import {
  MONTHS_NOM,
  WEEKDAYS_SHORT,
  addDays,
  formatDayMonth,
  formatFullDate,
  startOfWeek,
  today as todayISO,
} from '../lib/date'
import { tasksForDate } from '../lib/progress'
import { endTime, findOverlaps, sortByTime } from '../lib/schedule'
import { haptic } from '../lib/telegram'

/** «14–20 сентября» или, если неделя пересекает месяц, «28 сентября – 4 октября». */
function weekLabel(start: string): string {
  const end = addDays(start, 6)
  return start.slice(0, 7) === end.slice(0, 7)
    ? `${Number(start.slice(8))}–${formatDayMonth(end)}`
    : `${formatDayMonth(start)} – ${formatDayMonth(end)}`
}

export function Schedule() {
  const store = useStore()
  const { goals, tasks } = store
  const today = todayISO()

  const [selected, setSelected] = useState(today)
  const [taskSheet, setTaskSheet] = useState<{ task?: Task } | null>(null)

  const weekStart = startOfWeek(selected)
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  /** Сколько задач стоит на каждый день недели — для точки под числом. */
  const counts = useMemo(
    () => Object.fromEntries(week.map((d) => [d, tasksForDate(tasks, d).length])),
    [week, tasks],
  )

  const { timed, untimed, clashes } = useMemo(() => {
    const day = sortByTime(tasksForDate(tasks, selected))
    return {
      timed: day.filter((t) => t.time),
      untimed: day.filter((t) => !t.time),
      clashes: findOverlaps(day),
    }
  }, [tasks, selected])

  const [y, m] = selected.split('-').map(Number)
  const isFuture = selected > today
  const goalOf = (t: Task) => goals.find((g) => g.id === t.goalId)

  const shiftWeek = (dir: 1 | -1) => {
    haptic('select')
    setSelected((s) => addDays(s, 7 * dir))
  }

  if (goals.length === 0) {
    return (
      <Screen>
        <ScreenHeader title="План" />
        <div className="card">
          <EmptyState
            emoji="🗓"
            title="Сначала создай цель"
            hint="Расписание собирается из задач цели. Создай цель на вкладке «Цели» или попроси помощника — потом расставим время."
          />
        </div>
      </Screen>
    )
  }

  return (
    <Screen>
      <ScreenHeader title="План" subtitle={`${MONTHS_NOM[m - 1]} ${y}`} />

      <section className="card p-3">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => shiftWeek(-1)}
            aria-label="Предыдущая неделя"
            className="press grid size-8 place-items-center rounded-full text-hint"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path d="m15 5-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="text-[14px] font-medium">{weekLabel(weekStart)}</span>
          <button
            type="button"
            onClick={() => shiftWeek(1)}
            aria-label="Следующая неделя"
            className="press grid size-8 place-items-center rounded-full text-hint"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {week.map((d, i) => {
            const active = d === selected
            const isToday = d === today
            return (
              <button
                key={d}
                type="button"
                onClick={() => {
                  haptic('select')
                  setSelected(d)
                }}
                aria-label={formatFullDate(d)}
                aria-pressed={active}
                className="press flex flex-col items-center gap-0.5 rounded-xl py-2"
                style={{
                  background: active ? 'var(--color-accent)' : 'transparent',
                  color: active ? 'var(--color-accent-ink)' : undefined,
                  boxShadow: isToday && !active ? 'inset 0 0 0 1.5px var(--color-accent)' : undefined,
                }}
              >
                <span className="text-[10px] uppercase opacity-70">{WEEKDAYS_SHORT[i]}</span>
                <span className="tabular text-[16px] font-semibold">{Number(d.slice(8, 10))}</span>
                <span
                  className="size-1 rounded-full"
                  style={{
                    background: counts[d] > 0 ? (active ? 'currentColor' : 'var(--color-accent)') : 'transparent',
                  }}
                />
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <SectionTitle
          action={
            selected !== today && (
              <button
                type="button"
                onClick={() => {
                  haptic('select')
                  setSelected(today)
                }}
                className="press text-[13px] font-semibold text-accent"
              >
                К сегодня
              </button>
            )
          }
        >
          {formatFullDate(selected)}
        </SectionTitle>

        {timed.length === 0 && untimed.length === 0 ? (
          <div className="card">
            <EmptyState
              emoji="🗓"
              title="На этот день пусто"
              hint="Добавь блок с временем — или попроси помощника составить расписание на неделю."
            />
          </div>
        ) : (
          <div className="space-y-3">
            {timed.length > 0 && (
              <div className="space-y-2">
                {timed.map((task) => {
                  const goal = goalOf(task)
                  const end = endTime(task.time!, task.duration)
                  return (
                    <div key={task.id} className="flex gap-3">
                      <div className="tabular w-11 shrink-0 pt-3.5 text-right">
                        <div className="text-[14px] leading-tight font-semibold">{task.time}</div>
                        {end && <div className="text-[12px] leading-tight text-hint">{end}</div>}
                      </div>
                      <div
                        className="card min-w-0 flex-1 overflow-hidden"
                        style={{ boxShadow: `inset 3px 0 0 ${accentColor(goal?.accent)}` }}
                      >
                        <TaskRow
                          task={task}
                          goal={goal}
                          showGoal
                          hideTime
                          disabled={isFuture}
                          done={store.isDone(selected, task.id)}
                          onToggle={() => store.toggleTask(selected, task.id)}
                          onEdit={() => setTaskSheet({ task })}
                        />
                        {clashes.has(task.id) && (
                          <div className="-mt-1.5 px-4 pb-2.5 pl-14 text-[12px] text-danger">
                            Пересекается с другим блоком
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {untimed.length > 0 && (
              <div>
                <div className="mb-1.5 px-1 text-[12px] font-medium text-hint">Без времени</div>
                <div className="card divide-y divide-line overflow-hidden">
                  {untimed.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      goal={goalOf(task)}
                      showGoal
                      disabled={isFuture}
                      done={store.isDone(selected, task.id)}
                      onToggle={() => store.toggleTask(selected, task.id)}
                      onEdit={() => setTaskSheet({ task })}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <Button variant="ghost" onClick={() => setTaskSheet({})}>
        + В расписание
      </Button>

      <Sheet
        open={taskSheet !== null}
        title={taskSheet?.task ? 'Задача' : 'Новый блок'}
        onClose={() => setTaskSheet(null)}
      >
        {taskSheet && (
          <TaskForm
            goals={goals}
            task={taskSheet.task}
            defaults={{ mode: 'once', date: selected }}
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
