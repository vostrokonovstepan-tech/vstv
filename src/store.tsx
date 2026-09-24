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
  MAX_CHUNKS,
  MAX_RECORD_CHUNKS,
  chunkKey,
  chunkKeys,
  packChunks,
  packRecordChunks,
} from './lib/chunks'
import { scheduleLabel } from './lib/progress'
import { sameSchedule } from './lib/schedule'
import { tg } from './lib/telegram'
import {
  MAX_VALUE_LENGTH,
  flushAll,
  getMany,
  parseJSON,
  queueWrite,
  removeItem,
  saveNow,
  setStorageErrorHandler,
} from './lib/storage'

const K_GOALS = 'v1_goals'
const K_TASKS = 'v1_tasks'
const K_TIMER = 'v1_timer'
const K_AI = 'v1_ai'
const K_CHAT = 'v1_chat'
const monthKey = (m: string) => `v1_m_${m}`
/**
 * Заметки дня хранятся отдельным ключом от чек-листа и секунд намеренно: при
 * сбое записи заметок не должны страдать отметки о выполнении задач за месяц.
 */
const noteMonthKey = (m: string) => `v1_n_${m}`
/**
 * Предел длины заметки за день. Месяц таких заметок — до ~16 000 символов, то есть
 * не влезает в одно значение CloudStorage (4096), поэтому месяц хранится кусками.
 */
export const NOTE_MAX_LENGTH = 500

/** Собирает месячный словарь из кусков и запоминает, сколько кусков уже лежит в хранилище. */
function readRecord<V>(
  values: Record<string, string>,
  base: string,
  seen: Map<string, number>,
): Record<string, V> {
  const out: Record<string, V> = {}
  chunkKeys(base, MAX_RECORD_CHUNKS).forEach((key, i) => {
    if (values[key] === undefined) return
    seen.set(base, i + 1)
    Object.assign(out, parseJSON<Record<string, V>>(values[key], {}))
  })
  return out
}

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
  /** «HH:MM». undefined стирает время — задача снова без времени. */
  time?: string
  duration?: number
}

export type Store = {
  ready: boolean
  /** Загрузка не удалась — записи выключены, чтобы не затереть облако пустым состоянием. */
  loadError: string | null
  retryLoad: () => void
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

  notes: Record<string, Record<string, string>>
  getNote: (date: string) => string
  /** false — заметка есть на экране, но в хранилище не дошла. */
  isNotePersisted: (date: string) => boolean
  /** Записывает сразу; промис отклоняется, если в хранилище не дошло. Текст остаётся в памяти при любом исходе. */
  setNote: (date: string, text: string) => Promise<void>

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
  const [notes, setNotes] = useState<Record<string, Record<string, string>>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  /**
   * Актуальные заметки без ожидания перерисовки: запись в хранилище должна уйти
   * сразу же, а состояние React обновляется только на следующем рендере.
   */
  const notesRef = useRef<Record<string, Record<string, string>>>({})

  // Пишем в хранилище только после первой загрузки, иначе стартовый
  // пустой стейт затрёт то, что уже лежит в облаке.
  const loaded = useRef(false)
  /** Ключ месячного словаря → сколько кусков под ним уже есть в хранилище. */
  const recordChunks = useRef(new Map<string, number>())

  useEffect(() => {
    setStorageErrorHandler((err) => {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить данные')
    })
  }, [])

  /** Номер последней начатой загрузки: ответ от устаревшей (перезапущенной) игнорируется. */
  const loadRun = useRef(0)

  const load = useCallback(() => {
    const run = ++loadRun.current
    setLoadError(null)
    const months12 = recentMonths(HISTORY_MONTHS)
    const keys = [
      K_GOALS, ...chunkKeys(K_TASKS), K_TIMER, K_AI, K_CHAT,
      ...months12.flatMap((m) => chunkKeys(monthKey(m), MAX_RECORD_CHUNKS)),
      ...months12.flatMap((m) => chunkKeys(noteMonthKey(m), MAX_RECORD_CHUNKS)),
    ]

    getMany(keys)
      .then((values) => {
        if (run !== loadRun.current) return
        setGoals(parseJSON<Goal[]>(values[K_GOALS], []))
        // Список задач лежит кусками: первый — под старым ключом, поэтому данные,
        // записанные до появления расписания, читаются без миграции.
        const loadedTasks: Task[] = []
        chunkKeys(K_TASKS).forEach((key, i) => {
          if (values[key] === undefined) return
          taskChunks.current = i + 1
          loadedTasks.push(...parseJSON<Task[]>(values[key], []))
        })
        setTasks(loadedTasks)
        setTimer(parseJSON<RunningTimer | null>(values[K_TIMER], null))
        // Слитые настройки с дефолтами: у ранних пользователей ключа ещё нет,
        // а новые поля не должны приезжать как undefined.
        setAiState({ ...DEFAULT_AI, ...parseJSON<Partial<AiSettings>>(values[K_AI], {}) })
        setChatHistoryState(parseJSON<ChatTurn[]>(values[K_CHAT], []))
        const loadedMonths: Record<string, MonthLog> = {}
        const loadedNotes: Record<string, Record<string, string>> = {}
        for (const m of months12) {
          loadedMonths[m] = readRecord<DayLog>(values, monthKey(m), recordChunks.current)
          loadedNotes[m] = readRecord<string>(values, noteMonthKey(m), recordChunks.current)
        }
        setMonths(loadedMonths)
        notesRef.current = loadedNotes
        setNotes(loadedNotes)
        // Запись включается только после успешной загрузки: иначе пустое состояние
        // затёрло бы то, что лежит в облаке.
        loaded.current = true
        setReady(true)
      })
      .catch((err: unknown) => {
        if (run !== loadRun.current) return
        setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить данные')
      })
  }, [])

  useEffect(() => {
    load()
    return () => {
      loadRun.current++
    }
  }, [load])

  // Не теряем несохранённое, когда мини-ап уходит в фон или закрывается. События
  // страницы в WebView Telegram при закрытии приходят не всегда, поэтому слушаем и
  // собственное событие Telegram — «свернули» — и не откладываем запись надолго.
  useEffect(() => {
    const flush = () => void flushAll()
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    tg()?.onEvent('deactivated', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
      tg()?.offEvent('deactivated', flush)
    }
  }, [])

  const persistGoals = useCallback((next: Goal[]) => {
    setGoals(next)
    if (loaded.current) queueWrite(K_GOALS, JSON.stringify(next))
  }, [])

  /** Сколько кусков задач уже есть в хранилище — их надо перезаписать, даже если список сжался. */
  const taskChunks = useRef(0)

  const persistTasks = useCallback((next: Task[]) => {
    setTasks(next)
    if (!loaded.current) return

    const chunks = packChunks(next)
    if (chunks.length > MAX_CHUNKS) {
      setError('Слишком много задач — часть не сохранится. Удали ненужные.')
    }
    const used = Math.min(chunks.length, MAX_CHUNKS)
    // Освободившиеся куски затираем пустым массивом, а не удаляем: очередь записи
    // держит последнее значение по ключу, и отложенная запись не воскресит старое.
    for (let i = 0; i < Math.max(used, taskChunks.current); i++) {
      queueWrite(chunkKey(K_TASKS, i), JSON.stringify(chunks[i] ?? []))
    }
    taskChunks.current = Math.max(taskChunks.current, used)
  }, [])

  /** Пишет месячный словарь кусками; освободившиеся куски затираются пустым словарём. */
  const writeRecord = useCallback((base: string, record: Record<string, unknown>) => {
    const chunks = packRecordChunks(record)
    if (chunks.length > MAX_RECORD_CHUNKS) {
      setError('Слишком много записей за месяц — часть не сохранится.')
    }
    const used = Math.min(chunks.length, MAX_RECORD_CHUNKS)
    const seen = recordChunks.current.get(base) ?? 0
    for (let i = 0; i < Math.max(used, seen); i++) {
      queueWrite(chunkKey(base, i), JSON.stringify(chunks[i] ?? {}))
    }
    recordChunks.current.set(base, Math.max(seen, used))
  }, [])

  /** То же, но сразу и с результатом: если хоть один кусок не записался, это ошибка. */
  const writeRecordNow = useCallback(async (base: string, record: Record<string, unknown>) => {
    const chunks = packRecordChunks(record)
    if (chunks.length > MAX_RECORD_CHUNKS) {
      throw new Error('Слишком много записей за месяц — часть не сохранится.')
    }
    const total = Math.max(chunks.length, recordChunks.current.get(base) ?? 0)
    await Promise.all(
      Array.from({ length: total }, (_, i) =>
        saveNow(chunkKey(base, i), JSON.stringify(chunks[i] ?? {})),
      ),
    )
    recordChunks.current.set(base, total)
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
    for (const m of dirtyMonths.current) writeRecord(monthKey(m), months[m] ?? {})
    dirtyMonths.current.clear()
  }, [months, writeRecord])

  const getNote = useCallback(
    (date: string): string => notes[monthOf(date)]?.[dayOf(date)] ?? '',
    [notes],
  )

  /** Месяцы, чьи заметки не дошли до хранилища. Пока месяц в этом списке, экран не имеет права писать «сохранено». */
  const unsavedNoteMonths = useRef(new Set<string>())
  /** Номер последней записи по месяцу: итог определяет самая свежая — в ней уже есть всё предыдущее. */
  const noteWriteSeq = useRef(new Map<string, number>())

  const persistNoteMonth = useCallback(
    (m: string): Promise<void> => {
      const id = (noteWriteSeq.current.get(m) ?? 0) + 1
      noteWriteSeq.current.set(m, id)
      return writeRecordNow(noteMonthKey(m), notesRef.current[m] ?? {}).then(
        () => {
          if (noteWriteSeq.current.get(m) === id) unsavedNoteMonths.current.delete(m)
        },
        (err: unknown) => {
          if (noteWriteSeq.current.get(m) === id) unsavedNoteMonths.current.add(m)
          // Баннер — на случай, когда редактора уже нет на экране, а запись не удалась.
          setError(`Заметка не сохранилась: ${err instanceof Error ? err.message : 'неизвестная ошибка'}`)
          throw err
        },
      )
    },
    [writeRecordNow],
  )

  // Не дошедшие заметки пробуем записать снова, как только приложение снова в деле.
  useEffect(() => {
    const retry = () => {
      for (const m of [...unsavedNoteMonths.current]) void persistNoteMonth(m).catch(() => {})
    }
    document.addEventListener('visibilitychange', retry)
    tg()?.onEvent('activated', retry)
    return () => {
      document.removeEventListener('visibilitychange', retry)
      tg()?.offEvent('activated', retry)
    }
  }, [persistNoteMonth])

  const isNotePersisted = useCallback(
    (date: string) => !unsavedNoteMonths.current.has(monthOf(date)),
    [],
  )

  /**
   * Заметка пишется сразу, а не через очередь: человек нажал «сохранить» и может тут
   * же закрыть приложение. Результат возвращается — редактор показывает, дошло ли
   * до хранилища, а не рисует галочку заранее. В памяти заметка остаётся при любом
   * исходе, чтобы текст не пропал с экрана, если запись не удалась.
   */
  const setNote = useCallback((date: string, text: string): Promise<void> => {
    const m = monthOf(date)
    const d = dayOf(date)
    const trimmed = text.trim().slice(0, NOTE_MAX_LENGTH)

    const month = { ...(notesRef.current[m] ?? {}) }
    if (trimmed) month[d] = trimmed
    else delete month[d]
    notesRef.current = { ...notesRef.current, [m]: month }
    setNotes(notesRef.current)

    if (!loaded.current) return Promise.reject(new Error('Данные ещё не загружены'))
    return persistNoteMonth(m)
  }, [persistNoteMonth])

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
      let tasksDirty = false

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
          const task: Task = {
            id: newId(),
            createdAt: date,
            goalId: goal.id,
            title: action.title,
            days: action.days,
            date: action.date,
            time: action.time,
            duration: action.time ? action.duration : undefined,
          }
          // Дубль — то же название с тем же расписанием. Два блока «Тренировка» в разное
          // время — законное расписание, их терять нельзя.
          const duplicate = nextTasks.some(
            (t) =>
              t.goalId === goal.id &&
              t.title.toLowerCase() === task.title.toLowerCase() &&
              sameSchedule(t, task),
          )
          if (duplicate) continue
          nextTasks.push(task)
          tasksDirty = true
          const label = scheduleLabel(task)
          applied.push(`Задача «${task.title}»${label ? ` — ${label}` : ''}`)
        } else if (action.type === 'reschedule_task') {
          const idx = nextTasks.findIndex(
            (t) => t.title.toLowerCase() === action.task.trim().toLowerCase(),
          )
          if (idx === -1) continue
          const current = nextTasks[idx]

          const updated: Task = { ...current }
          if (action.time !== undefined) updated.time = action.time
          if (action.duration !== undefined) updated.duration = action.duration
          if (action.date) {
            updated.date = action.date
            updated.days = []
          } else if (action.days) {
            updated.days = action.days
            updated.date = undefined
          }
          // Длительность без времени бессмысленна.
          if (!updated.time) updated.duration = undefined

          if (JSON.stringify(updated) === JSON.stringify(current)) continue
          nextTasks[idx] = updated
          tasksDirty = true
          applied.push(`Перенесено: «${current.title}» — ${scheduleLabel(updated) ?? 'каждый день'}`)
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
      if (tasksDirty) persistTasks(nextTasks)
      for (const id of completed) toggleTask(date, id)

      return applied
    },
    [goals, tasks, isDone, persistGoals, persistTasks, toggleTask],
  )

  const value = useMemo<Store>(
    () => ({
      ready,
      loadError,
      retryLoad: load,
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
      notes,
      getNote,
      isNotePersisted,
      setNote,
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
      ready, loadError, load, error, goals, tasks, months, timer, ai, setAi, chatHistory, setChatHistory, dayLog, isDone,
      notes, getNote, isNotePersisted, setNote,
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
