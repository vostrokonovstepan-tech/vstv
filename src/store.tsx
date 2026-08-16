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
import { DEFAULT_AI, type AiSettings } from './lib/ai'
import type { Action, ChatTurn } from './lib/aiChat'
import {
  MAX_VALUE_LENGTH,
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
const K_AI = 'v1_ai'
const K_CHAT = 'v1_chat'
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
  ai: AiSettings
  setAi: (next: AiSettings) => void
  chatHistory: ChatTurn[]
  setChatHistory: (next: ChatTurn[]) => void

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

  /** Применяет пачку действий ассистента за один проход. Возвращает описания применённого. */
  applyAiActions: (actions: Action[]) => string[]
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [months, setMonths] = useState<Record<string, MonthLog>>({})
  const [timer, setTimer] = useState<RunningTimer | null>(null)
  const [ai, setAiState] = useState<AiSettings>(DEFAULT_AI)
  const [chatHistory, setChatHistoryState] = useState<ChatTurn[]>([])

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
    const keys = [K_GOALS, K_TASKS, K_TIMER, K_AI, K_CHAT, ...months12.map(monthKey)]

    getMany(keys)
      .then((values) => {
        if (cancelled) return
        setGoals(parseJSON<Goal[]>(values[K_GOALS], []))
        setTasks(parseJSON<Task[]>(values[K_TASKS], []))
        setTimer(parseJSON<RunningTimer | null>(values[K_TIMER], null))
        // Слитые настройки с дефолтами: у ранних пользователей ключа ещё нет,
        // а новые поля не должны приезжать как undefined.
        setAiState({ ...DEFAULT_AI, ...parseJSON<Partial<AiSettings>>(values[K_AI], {}) })
        setChatHistoryState(parseJSON<ChatTurn[]>(values[K_CHAT], []))
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

  const setAi = useCallback((next: AiSettings) => {
    setAiState(next)
    // Ключ пишем сразу: пользователь ждёт результата проверки соединения.
    if (loaded.current) queueWrite(K_AI, JSON.stringify(next), 0)
  }, [])

  const setChatHistory = useCallback((next: ChatTurn[]) => {
    // Значение CloudStorage ограничено 4 КБ — храним только тот хвост
    // истории, что туда влезает, отбрасывая старые реплики по одной.
    let trimmed = next
    while (trimmed.length > 0 && JSON.stringify(trimmed).length > MAX_VALUE_LENGTH) {
      trimmed = trimmed.slice(1)
    }
    setChatHistoryState(next)
    if (loaded.current) queueWrite(K_CHAT, JSON.stringify(trimmed))
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

  /**
   * Действия применяются одним проходом намеренно: addGoal и addTask захватывают
   * массив на момент вызова, поэтому подряд идущие вызовы затирали бы друг друга.
   * Здесь же цели и задачи накапливаются локально и сохраняются по разу каждая.
   */
  const applyAiActions = useCallback(
    (actions: Action[]): string[] => {
      const date = today()
      const nextGoals = [...goals]
      const nextTasks = [...tasks]
      const applied: string[] = []
      const completed: string[] = []

      const findGoal = (title: string) =>
        nextGoals.find((g) => g.title.toLowerCase() === title.trim().toLowerCase())

      for (const action of actions) {
        if (action.type === 'create_goal') {
          if (findGoal(action.title)) continue
          nextGoals.push({
            id: newId(),
            createdAt: date,
            title: action.title,
            emoji: action.emoji,
            accent: action.accent,
            deadline: action.deadline,
          })
          applied.push(`${action.emoji} Цель «${action.title}»`)
        } else if (action.type === 'create_task') {
          const goal = findGoal(action.goal)
          if (!goal) continue
          const duplicate = nextTasks.some(
            (t) => t.goalId === goal.id && t.title.toLowerCase() === action.title.toLowerCase(),
          )
          if (duplicate) continue
          nextTasks.push({
            id: newId(),
            createdAt: date,
            goalId: goal.id,
            title: action.title,
            days: action.days,
            date: action.date,
          })
          applied.push(`Задача «${action.title}»`)
        } else if (action.type === 'complete_task') {
          const task = nextTasks.find(
            (t) => t.title.toLowerCase() === action.task.trim().toLowerCase(),
          )
          if (!task || completed.includes(task.id)) continue
          if (!isDone(date, task.id)) {
            completed.push(task.id)
            applied.push(`Отмечено: «${task.title}»`)
          }
        }
      }

      if (nextGoals.length !== goals.length) persistGoals(nextGoals)
      if (nextTasks.length !== tasks.length) persistTasks(nextTasks)
      for (const id of completed) toggleTask(date, id)

      return applied
    },
    [goals, tasks, isDone, persistGoals, persistTasks, toggleTask],
  )

  const value = useMemo<Store>(
    () => ({
      ready,
      error,
      dismissError: () => setError(null),
      goals,
      tasks,
      months,
      timer,
      ai,
      setAi,
      chatHistory,
      setChatHistory,
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
      applyAiActions,
    }),
    [
      ready, error, goals, tasks, months, timer, ai, setAi, chatHistory, setChatHistory, dayLog, isDone,
      addGoal, updateGoal, removeGoal, addTask, updateTask, removeTask,
      toggleTask, addSeconds, startTimer, stopTimer, applyAiActions,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore должен вызываться внутри <StoreProvider>')
  return store
}
