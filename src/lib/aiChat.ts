import { AiError, chat, extractJSON, type AiSettings, type ChatMessage } from './ai'
import { ACCENT_KEYS } from './accents'
import { formatFullDate, today } from './date'
import type { AccentKey, Goal, Task } from '../types'

/**
 * Чат с ИИ, который умеет менять данные приложения.
 *
 * Вместо tool calling используется JSON-протокол: не все модели на OpenRouter
 * поддерживают инструменты, а `response_format: json_object` работает почти везде.
 * Модель возвращает текст ответа и список действий; действия применяет приложение.
 *
 * Действия только созидательные — создать цель, создать задачу, отметить выполненной.
 * Ничего не удаляется и не перезаписывается, поэтому их можно применять сразу,
 * без подтверждения: любую ошибку пользователь исправит вручную за пару тапов.
 */

export type Action =
  | { type: 'create_goal'; title: string; emoji: string; accent: AccentKey; deadline?: string }
  | { type: 'create_task'; goal: string; title: string; days: number[]; date?: string }
  | { type: 'complete_task'; task: string }

export type AssistantReply = {
  reply: string
  actions: Action[]
}

export type ChatTurn = {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Что удалось применить — показываем под сообщением ассистента. */
  applied?: string[]
  failed?: boolean
}

const SYSTEM = `Ты — помощник внутри трекера целей. Пользователь пишет тебе свободным текстом,
а ты превращаешь это в цели и задачи приложения.

Как устроено приложение:
- Цель — это большое желаемое, например «выучить английский до B2». У неё есть значок-эмодзи,
  цвет и необязательный дедлайн.
- Задача принадлежит цели и бывает двух видов: повторяющаяся по дням недели
  или разовая на конкретную дату.
- Хорошая задача конкретна и измерима: не «заниматься английским», а «30 слов в Anki».
  Выполняется за один подход, формулируется коротко, до 60 символов, без точки в конце.

Ты можешь выполнять действия:
- {"type":"create_goal","title":"...","emoji":"🎯","accent":"indigo","deadline":"2026-06-01"}
  accent — один из: indigo, emerald, amber, rose, sky, violet. deadline необязателен.
- {"type":"create_task","goal":"точное название цели","title":"...","days":[1,3,5]}
  days — дни недели: 0=воскресенье, 1=понедельник … 6=суббота.
  Пустой массив означает «каждый день».
- {"type":"create_task","goal":"название цели","title":"...","date":"2026-09-15"}
  Так создаётся разовая задача на конкретную дату. Указывай либо days, либо date.
- {"type":"complete_task","task":"точное название задачи"}
  Отмечает задачу выполненной за сегодня.

Правила:
- В поле goal подставляй точное название цели — либо уже существующей, либо той,
  которую создаёшь в этом же ответе.
- Не создавай задачи, которые уже есть. Не создавай цель, если похожая уже существует.
- Не выдумывай лишнего: если пользователь попросил одну задачу, не добавляй пять.
- Разбивая цель на задачи, предлагай от 3 до 6 штук. Лучше меньше, но выполнимых.
- Если непонятно, что делать — не выдумывай, оставь actions пустым и задай вопрос.
- Отвечай на языке пользователя, коротко и по делу, без списков и заголовков.
  В reply не перечисляй созданное — приложение покажет это само.

Отвечай строго JSON, без пояснений вокруг:
{"reply":"текст пользователю","actions":[...]}`

/** Срез текущего состояния — чтобы модель не дублировала уже существующее. */
function stateSummary(goals: Goal[], tasks: Task[]): string {
  if (goals.length === 0) return 'У пользователя пока нет ни одной цели.'

  const lines = goals.map((g) => {
    const own = tasks.filter((t) => t.goalId === g.id).map((t) => t.title)
    const deadline = g.deadline ? `, дедлайн ${g.deadline}` : ''
    const list = own.length > 0 ? `; задачи: ${own.join('; ')}` : '; задач нет'
    return `- ${g.title}${deadline}${list}`
  })
  return `Текущие цели пользователя:\n${lines.join('\n')}`
}

const isAccent = (v: unknown): v is AccentKey => ACCENT_KEYS.includes(v as AccentKey)

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Приводит ответ модели к валидным действиям, молча отбрасывая мусор. */
function sanitize(raw: unknown): AssistantReply {
  const rec = (raw ?? {}) as Record<string, unknown>
  const reply = String(rec.reply ?? '').trim()

  const source = Array.isArray(rec.actions) ? rec.actions : []
  const actions: Action[] = []

  for (const item of source.slice(0, 20)) {
    if (!item || typeof item !== 'object') continue
    const a = item as Record<string, unknown>
    const title = String(a.title ?? '').trim().slice(0, 80)

    if (a.type === 'create_goal' && title) {
      const emoji = String(a.emoji ?? '').trim()
      const deadline = String(a.deadline ?? '').trim()
      actions.push({
        type: 'create_goal',
        title,
        emoji: emoji || '🎯',
        accent: isAccent(a.accent) ? a.accent : 'indigo',
        deadline: ISO_DATE.test(deadline) ? deadline : undefined,
      })
    } else if (a.type === 'create_task' && title) {
      const goal = String(a.goal ?? '').trim()
      if (!goal) continue
      const date = String(a.date ?? '').trim()
      const days = Array.isArray(a.days)
        ? [...new Set(a.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
        : []
      actions.push({
        type: 'create_task',
        goal,
        title,
        days: days.length === 7 ? [] : days,
        date: ISO_DATE.test(date) ? date : undefined,
      })
    } else if (a.type === 'complete_task') {
      const task = String(a.task ?? '').trim()
      if (task) actions.push({ type: 'complete_task', task })
    }
  }

  if (!reply && actions.length === 0) throw new AiError('Модель ответила пусто')
  return { reply, actions }
}

/** Сколько прошлых реплик отправляем обратно — держим контекст маленьким и дешёвым. */
const HISTORY_TURNS = 8

export async function askAssistant(
  settings: AiSettings,
  history: ChatTurn[],
  goals: Goal[],
  tasks: Task[],
  signal?: AbortSignal,
): Promise<AssistantReply> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    {
      role: 'system',
      content: `Сегодня ${formatFullDate(today())} (${today()}).\n${stateSummary(goals, tasks)}`,
    },
    ...history.slice(-HISTORY_TURNS).map(
      (t): ChatMessage => ({
        role: t.role,
        // Ассистенту возвращаем его текст — действия он видеть повторно не должен.
        content: t.text,
      }),
    ),
  ]

  const text = await chat(settings, messages, { maxTokens: 1200, json: true, signal })
  return sanitize(extractJSON<unknown>(text))
}
