import type { Goal, Task } from '../types'
import { accentColor } from '../lib/accents'
import { timeRange } from '../lib/schedule'
import { haptic } from '../lib/telegram'

type Props = {
  task: Task
  goal?: Goal
  done: boolean
  onToggle: () => void
  /** Показывать эмодзи и название цели — на экране «Сегодня», где задачи вперемешку. */
  showGoal?: boolean
  /** Не показывать время: там, где расписание уже подписано отдельной строкой. */
  hideTime?: boolean
  /** Отметить нельзя — например, задача на будущий день. */
  disabled?: boolean
  onEdit?: () => void
}

export function TaskRow({ task, goal, done, onToggle, showGoal, hideTime, disabled, onEdit }: Props) {
  const color = accentColor(goal?.accent)

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={task.title}
        disabled={disabled}
        onClick={() => {
          haptic(done ? 'select' : 'success')
          onToggle()
        }}
        className="press grid size-7 shrink-0 place-items-center rounded-full border-2 disabled:opacity-40"
        style={{
          borderColor: done ? color : 'var(--color-line)',
          background: done ? color : 'transparent',
        }}
      >
        {done && (
          <svg viewBox="0 0 24 24" className="animate-pop size-4" fill="none" stroke="#fff" strokeWidth={3.5}>
            <path d="M4 12.5 9.5 18 20 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        className="min-w-0 flex-1 text-left"
      >
        <div className={`truncate text-[15px] ${done ? 'text-hint line-through' : ''}`}>
          {task.title}
        </div>
        {((task.time && !hideTime) || (showGoal && goal)) && (
          <div className="mt-0.5 flex items-center gap-2 text-[13px] text-hint">
            {task.time && !hideTime && (
              <span className="tabular shrink-0 font-medium" style={{ color }}>
                {timeRange(task.time, task.duration)}
              </span>
            )}
            {showGoal && goal && (
              <span className="truncate">
                {goal.emoji} {goal.title}
              </span>
            )}
          </div>
        )}
      </button>

      {onEdit && (
        <button
          type="button"
          aria-label="Изменить задачу"
          onClick={onEdit}
          className="press -mr-1 grid size-8 shrink-0 place-items-center rounded-full text-hint"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  )
}
