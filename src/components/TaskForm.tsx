import { useState } from 'react'
import type { Goal, Task } from '../types'
import { accentColor } from '../lib/accents'
import { WEEKDAYS_SHORT, formatDayMonth, today } from '../lib/date'
import { timeRange } from '../lib/schedule'
import { Button, Field, TextInput } from './ui'
import { confirmDialog } from '../lib/telegram'

/** Порядок кнопок — пн…вс, а значения — как в Date.getDay(): вс = 0. */
const WEEKDAY_VALUES = [1, 2, 3, 4, 5, 6, 0]

type Props = {
  goals: Goal[]
  task?: Task
  defaultGoalId?: string
  /** Предзаполнение для новой задачи — например, дата, выбранная в календаре расписания. */
  defaults?: { mode?: Mode; date?: string }
  onSave: (data: {
    goalId: string
    title: string
    days: number[]
    date?: string
    time?: string
    duration?: number
  }) => void
  onDelete?: () => void
  onClose: () => void
}

type Mode = 'repeat' | 'once'

/** [минуты, подпись]. Нестандартную длительность (например, от помощника) добавляем отдельной кнопкой. */
const DURATIONS: [number, string][] = [
  [15, '15 мин'],
  [30, '30 мин'],
  [45, '45 мин'],
  [60, '1 ч'],
  [90, '1,5 ч'],
  [120, '2 ч'],
]

export function TaskForm({ goals, task, defaultGoalId, defaults, onSave, onDelete, onClose }: Props) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [goalId, setGoalId] = useState(task?.goalId ?? defaultGoalId ?? goals[0]?.id ?? '')
  const [days, setDays] = useState<number[]>(task?.days ?? [])
  const [mode, setMode] = useState<Mode>(
    task ? (task.date ? 'once' : 'repeat') : (defaults?.mode ?? 'repeat'),
  )
  const [date, setDate] = useState(task?.date ?? defaults?.date ?? today())
  const [time, setTime] = useState(task?.time ?? '')
  const [duration, setDuration] = useState<number | undefined>(task?.duration)

  const trimmed = title.trim()
  const goal = goals.find((g) => g.id === goalId)
  const color = accentColor(goal?.accent)
  const everyDay = days.length === 0
  const valid = Boolean(trimmed) && Boolean(goalId) && (mode === 'repeat' || Boolean(date))

  const toggleDay = (value: number) => {
    setDays((prev) => {
      const next = prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]
      // Все семь дней — это и есть «каждый день», храним как пустой массив.
      return next.length === 7 ? [] : next
    })
  }

  const submit = () => {
    if (!valid) return
    onSave({
      goalId,
      title: trimmed,
      days: mode === 'once' ? [] : days,
      // undefined важен: при переключении обратно на повтор он стирает дату.
      date: mode === 'once' ? date : undefined,
      // Так же undefined: убранное время должно стереться, а не остаться от прошлого сохранения.
      time: time || undefined,
      duration: time ? duration : undefined,
    })
    onClose()
  }

  const remove = async () => {
    if (!onDelete) return
    const ok = await confirmDialog(`Удалить задачу «${task?.title}»?`)
    if (!ok) return
    onDelete()
    onClose()
  }

  return (
    <div className="space-y-5">
      <Field label="Что делаешь">
        <TextInput
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Например, 30 слов в Anki"
          maxLength={80}
          autoFocus={!task}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </Field>

      {goals.length > 1 && (
        <Field label="К какой цели">
          <div className="flex flex-wrap gap-2">
            {goals.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGoalId(g.id)}
                className="press rounded-full px-3.5 py-2 text-[14px] font-medium"
                style={
                  g.id === goalId
                    ? { background: accentColor(g.accent), color: '#fff' }
                    : { background: 'var(--color-surface)' }
                }
              >
                {g.emoji} {g.title}
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field label="Когда">
        <div className="mb-3 flex gap-1.5 rounded-2xl bg-surface p-1">
          {(
            [
              ['repeat', 'Повторять'],
              ['once', 'Один раз'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className="press flex-1 rounded-xl py-2 text-[14px] font-medium"
              style={
                mode === key
                  ? { background: color, color: '#fff' }
                  : { color: 'var(--color-hint)' }
              }
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'repeat' ? (
          <>
            <div className="flex gap-1.5">
              {WEEKDAY_VALUES.map((value, i) => {
                const active = everyDay || days.includes(value)
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleDay(value)}
                    className="press flex-1 rounded-xl py-2.5 text-[13px] font-medium capitalize"
                    style={
                      active
                        ? { background: color, color: '#fff' }
                        : { background: 'var(--color-surface)', color: 'var(--color-hint)' }
                    }
                  >
                    {WEEKDAYS_SHORT[i]}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 px-1 text-[13px] text-hint">
              {everyDay
                ? 'Каждый день'
                : `${days.length} ${days.length === 1 ? 'день' : 'дн.'} в неделю`}
            </p>
          </>
        ) : (
          <>
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <p className="mt-2 px-1 text-[13px] text-hint">
              {date
                ? `Появится один раз — ${formatDayMonth(date)}`
                : 'Выбери дату, когда нужно это сделать'}
            </p>
          </>
        )}
      </Field>

      <Field label="Время — необязательно">
        <div className="flex items-center gap-2">
          <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          {time && (
            <button
              type="button"
              onClick={() => {
                setTime('')
                setDuration(undefined)
              }}
              className="press shrink-0 rounded-xl px-3 py-3 text-[14px] text-hint"
            >
              Убрать
            </button>
          )}
        </div>

        {time && (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              {(duration && !DURATIONS.some(([m]) => m === duration)
                ? [...DURATIONS, [duration, `${duration} мин`] as [number, string]]
                : DURATIONS
              ).map(([mins, label]) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setDuration(duration === mins ? undefined : mins)}
                  className="press rounded-full px-3.5 py-2 text-[14px] font-medium"
                  style={
                    duration === mins
                      ? { background: color, color: '#fff' }
                      : { background: 'var(--color-surface)' }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 px-1 text-[13px] text-hint">
              {duration ? timeRange(time, duration) : `С ${time} — без длительности`}
            </p>
          </>
        )}
      </Field>

      <Button onClick={submit} disabled={!valid} accent={color}>
        {task ? 'Сохранить' : 'Добавить задачу'}
      </Button>

      {onDelete && (
        <Button variant="danger" onClick={remove}>
          Удалить задачу
        </Button>
      )}
    </div>
  )
}
