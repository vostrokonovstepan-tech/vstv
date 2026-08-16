import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { accentColor } from '../lib/accents'
import { formatDuration } from '../lib/date'
import { haptic } from '../lib/telegram'

/** Секунды с момента старта, тикают раз в секунду. */
export function useElapsed(startedAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!startedAt) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    // Пока вкладка в фоне таймеры замедляются — при возврате пересчитываем от startedAt.
    const resync = () => setNow(Date.now())
    document.addEventListener('visibilitychange', resync)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', resync)
    }
  }, [startedAt])

  return startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0
}

/** Плавающая плашка активного таймера — видна на всех экранах. */
export function TimerBar() {
  const { timer, goals, tasks, stopTimer } = useStore()
  const elapsed = useElapsed(timer?.startedAt)

  if (!timer) return null

  const goal = goals.find((g) => g.id === timer.goalId)
  const task = timer.taskId ? tasks.find((t) => t.id === timer.taskId) : undefined
  const color = accentColor(goal?.accent)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] z-40 flex justify-center px-4">
      <div
        className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl px-4 py-3 shadow-lg"
        style={{ background: color }}
      >
        <span className="relative flex size-2.5 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/70" />
          <span className="relative inline-flex size-2.5 rounded-full bg-white" />
        </span>

        <div className="min-w-0 flex-1 text-white">
          <div className="truncate text-[13px] opacity-90">
            {task?.title ?? `${goal?.emoji ?? ''} ${goal?.title ?? 'Цель'}`}
          </div>
          <div className="tabular text-[19px] leading-tight font-semibold">
            {formatDuration(elapsed)}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            haptic('success')
            stopTimer()
          }}
          className="press rounded-xl bg-white/20 px-4 py-2 text-[14px] font-semibold text-white"
        >
          Стоп
        </button>
      </div>
    </div>
  )
}
