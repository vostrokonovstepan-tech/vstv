import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AccentKey, DayLog, Goal, MonthLog, RunningTimer, Task } from './types'
import { dayOf, monthOf, recentMonths, today } from './lib/date'
import {
  flushAll,
  getMany,
  parseJSON,
  queueWrite,
  removeItem,
  setStorageErrorHandler,
} from './lib/storage'

const K_GOALS = 'v1_goals'
const K_TASKS = 'v1_tasks'
const K_TIMER = 'v1_timer'
const monthKey = (m: string) => `v1_m_${m}`

/** Сколько месяцев истории поднимаем при старте — хватает на серии и годовой график. */
const HISTORY_MONTHS = 12

const newId = () => Math.random().toString(36).slice(2, 8)

export type GoalInput = {
  title: string
  emoji: string
  accent: AccentKey
  deadline?: string
}

export type TaskInput = {
  goalId: string
  title: string
  days: number[]
  /** Задана — задача разовая, на эту дату. undefined стирает дату при сохранении. */
  date?: string
}

export type Store = {
  ready: boolean
  error: string | null
  dismissError: () => void

  goals: Goal[]
  tasks: Task[]
  months: Record<string, MonthLog>
  timer: RunningTimer | null

  dayLog: (date: string) => DayLog
  isDone: (date: string, taskId: string) => boolean

  addGoal: (input: GoalInput) => Goal
  updateGoal: (id: string, patch: Partial<Goal>) => void
  removeGoal: (id: string) => void

  addTask: (input: TaskInput) => Task
  updateTask: (id: string, patch: Partial<Task>) => void
  removeTask: (id: string) => void

  toggleTask: (date: string, taskId: string) => void
  addSeconds: (date: string, goalId: string, seconds: number) => void

  startTimer: (goalId: string, taskId?: string) => void
  stopTimer: () => void
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [months, setMonths] = useState<Record<string, MonthLog>>({})
  const [timer, setTimer] = useState<RunningTimer | null>(null)

  // Пишем в хранилище только после первой загрузки, иначе стартовый
  // пустой стейт затрёт то, что уже лежит в облаке.
  const loaded = useRef(false)

  useEffect(() => {
    setStorageErrorHandler((err) => {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить данные')
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    const months12 = recentMonths(HISTORY_MONTHS)
    const keys = [K_GOALS, K_TASKS, K_TIMER, ...months12.map(monthKey)]

    getMany(keys)
      .then((values) => {
        if (cancelled) return
        setGoals(parseJSON<Goal[]>(values[K_GOALS], []))
        setTasks(parseJSON<Task[]>(values[K_TASKS], []))
        setTimer(parseJSON<RunningTimer | null>(values[K_TIMER], null))
        const loadedMonths: Record<string, MonthLog> = {}
        for (const m of months12) {
          loadedMonths[m] = parseJSON<MonthLog>(values[monthKey(m)], {})
        }
        setMonths(loadedMonths)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Не удалось загрузить данные')
      })
      .finally(() => {
        if (cancelled) return
        loaded.current = true
        setReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Не теряем несохранённое, когда мини-ап уходит в фон или закрывается.
  useEffect(() => {
    const flush = () => void flushAll()
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

  const persistGoals = useCallback((next: Goal[]) => {
    setGoals(next)
    if (loaded.current) queueWrite(K_GOALS, JSON.stringify(next))
  }, [])

  const persistTasks = useCallback((next: Task[]) => {
    setTasks(next)
    if (loaded.current) queueWrite(K_TASKS, JSON.stringify(next))
  }, [])

  /**
   * Точечно правит день внутри месяца.
   * Запись в хранилище — отдельным эффектом ниже, а не внутри обновления
   * состояния: React вызывает функцию-обновление дважды (StrictMode), и
   * любой побочный эффект в ней сработал бы два раза.
   */
  const dirtyMonths = useRef(new Set<string>())

  const patchDay = useCallback((date: string, patch: (day: DayLog) => DayLog) => {
    const m = monthOf(date)
    const d = dayOf(date)
    dirtyMonths.current.add(m)
    setMonths((prev) => {
      const month = prev[m] ?? {}
      const nextDay = patch(month[d] ?? {})
      const nextMonth: MonthLog = { ...month }
      // Пустые дни не храним — экономим место в 4-килобайтном значении.
      if (!nextDay.d?.length && !nextDay.s) delete nextMonth[d]
      else nextMonth[d] = nextDay
      return { ...prev, [m]: nextMonth }
    })
  }, [])

  useEffect(() => {
    if (!loaded.current || dirtyMonths.current.size === 0) return
    for (const m of dirtyMonths.current) {
      queueWrite(monthKey(m), JSON.stringify(months[m] ?? {}))
    }
    dirtyMonths.current.clear()
  }, [months])

  const dayLog = useCallback(
    (date: string): DayLog => months[monthOf(date)]?.[dayOf(date)] ?? {},
    [months],
  )

  const isDone = useCallback(
    (date: string, taskId: string) => Boolean(dayLog(date).d?.includes(taskId)),
    [dayLog],
  )

  const addGoal = useCallback(
    (input: GoalInput): Goal => {
      const goal: Goal = { id: newId(), createdAt: today(), ...input }
      persistGoals([...goals, goal])
      return goal
    },
    [goals, persistGoals],
  )

  const updateGoal = useCallback(
    (id: string, patch: Partial<Goal>) => {
      persistGoals(goals.map((g) => (g.id === id ? { ...g, ...patch } : g)))
    },
    [goals, persistGoals],
  )

  const removeGoal = useCallback(
    (id: string) => {
      persistGoals(goals.filter((g) => g.id !== id))
      persistTasks(tasks.filter((t) => t.goalId !== id))
      // Историю выполнений намеренно не чистим: она уже «сгорела» вместе с
      // задачами, а перезапись 12 месяцев ради этого не стоит запросов.
    },
    [goals, tasks, persistGoals, persistTasks],
  )

  const addTask = useCallback(
    (input: TaskInput): Task => {
      const task: Task = { id: newId(), createdAt: today(), ...input }
      persistTasks([...tasks, task])
      return task
    },
    [tasks, persistTasks],
  )

  const updateTask = useCallback(
    (id: string, patch: Partial<Task>) => {
      persistTasks(tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    },
    [tasks, persistTasks],
  )

  const removeTask = useCallback(
    (id: string) => {
      persistTasks(tasks.filter((t) => t.id !== id))
    },
    [tasks, persistTasks],
  )

  const toggleTask = useCallback(
    (date: string, taskId: string) => {
      patchDay(date, (day) => {
        const done = day.d ?? []
        const next = done.includes(taskId)
          ? done.filter((id) => id !== taskId)
          : [...done, taskId]
        return next.length ? { ...day, d: next } : { ...day, d: undefined }
      })
    },
    [patchDay],
  )

  const addSeconds = useCallback(
    (date: string, goalId: string, seconds: number) => {
      if (seconds <= 0) return
      patchDay(date, (day) => ({
        ...day,
        s: { ...day.s, [goalId]: Math.round((day.s?.[goalId] ?? 0) + seconds) },
      }))
    },
    [patchDay],
  )

  const startTimer = useCallback((goalId: string, taskId?: string) => {
    const next: RunningTimer = { goalId, taskId, startedAt: Date.now() }
    setTimer(next)
    if (loaded.current) queueWrite(K_TIMER, JSON.stringify(next), 0)
  }, [])

  const stopTimer = useCallback(() => {
    if (!timer) return
    const seconds = (Date.now() - timer.startedAt) / 1000
    // Меньше минуты не засчитываем — это почти всегда случайный тап.
    if (seconds >= 60) addSeconds(today(), timer.goalId, seconds)
    setTimer(null)
    if (loaded.current) void removeItem(K_TIMER).catch(() => {})
  }, [timer, addSeconds])

  const value = useMemo<Store>(
    () => ({
      ready,
      error,
      dismissError: () => setError(null),
      goals,
      tasks,
      months,
      timer,
      dayLog,
      isDone,
      addGoal,
      updateGoal,
      removeGoal,
      addTask,
      updateTask,
      removeTask,
      toggleTask,
      addSeconds,
      startTimer,
      stopTimer,
    }),
    [
      ready, error, goals, tasks, months, timer, dayLog, isDone,
      addGoal, updateGoal, removeGoal, addTask, updateTask, removeTask,
      toggleTask, addSeconds, startTimer, stopTimer,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore должен вызываться внутри <StoreProvider>')
  return store
}
