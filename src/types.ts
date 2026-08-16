export type AccentKey =
  | 'indigo'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'sky'
  | 'violet'

export type Goal = {
  id: string
  title: string
  emoji: string
  accent: AccentKey
  /** ISO-дата создания, YYYY-MM-DD */
  createdAt: string
  /** ISO-дата дедлайна, YYYY-MM-DD */
  deadline?: string
  archived?: boolean
}

export type Task = {
  id: string
  goalId: string
  title: string
  /** Дни недели, когда задача активна: 0 = вс … 6 = сб. Пустой массив = каждый день. */
  days: number[]
  /**
   * ISO-дата разовой задачи. Если задана — задача появляется ровно один раз
   * в этот день, а `days` не учитывается.
   */
  date?: string
  createdAt: string
  archived?: boolean
}

/** Запись за один день месяца. Ключи короткие — значение месяца должно влезать в 4 КБ CloudStorage. */
export type DayLog = {
  /** id выполненных задач */
  d?: string[]
  /** goalId → секунды, потраченные в этот день */
  s?: Record<string, number>
}

/** Ключ — день месяца без ведущего нуля: "1" … "31" */
export type MonthLog = Record<string, DayLog>

export type RunningTimer = {
  goalId: string
  taskId?: string
  /** Date.now() в момент старта */
  startedAt: number
}
