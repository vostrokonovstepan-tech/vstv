import type { Goal, Task } from '../types'
import { accentColor } from '../lib/accents'
import { haptic } from '../lib/telegram'

type Props = {
  task: Task
  goal?: Goal
  done: boolean
  onToggle: () => void
  /** Показывать эмодзи и название цели — на экране «Сегодня», где задачи вперемешку. */
  showGoal?: boolean
  onEdit?: () => void
}

export function TaskRow({ task, goal, done, onToggle, showGoal, onEdit }: Props) {
  const color = accentColor(goal?.accent)

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={task.title}
        onClick={() => {
          haptic(done ? 'select' : 'success')
          onToggle()
        }}
        className="press grid size-7 shrink-0 place-items-center rounded-full border-2"
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
        onClick={onToggle}
        className="min-w-0 flex-1 text-left"
      >
        <div className={`truncate text-[15px] ${done ? 'text-hint line-through' : ''}`}>
          {task.title}
        </div>
        {showGoal && goal && (
          <div className="mt-0.5 truncate text-[13px] text-hint">
            {goal.emoji} {goal.title}
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
