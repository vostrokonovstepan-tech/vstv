import { AiError, chat, extractJSON, type AiSettings, type ChatMessage } from './ai'
import { ACCENT_KEYS } from './accents'
import { addDays, formatFullDate, today } from './date'
import { recentNotesText, type NotesStore } from './notes'
import { scheduleLabel, tasksForDate } from './progress'
import { cleanDuration, normalizeTime, sortByTime, timeRange } from './schedule'
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
  | {
      type: 'create_task'
      goal: string
      title: string
      days: number[]
      date?: string
      time?: string
      duration?: number
    }
  | {
      type: 'reschedule_task'
      task: string
      time?: string
      duration?: number
      days?: number[]
      date?: string
    }
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
- В календаре пользователь может каждый день писать заметку своими словами — что
  полезного сделал. Тебе присылают заметки за последние две недели, если они есть.
  Используй их, когда пользователь спрашивает о своём прогрессе, а не только цифры
  выполнения задач: заметки показывают, было ли сделанное осмысленным.

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
- {"type":"reschedule_task","task":"точное название задачи","time":"19:00","duration":60}
  Меняет расписание уже существующей задачи: time, duration, days или date — любые из них.
  Название, цель и выполнение не трогает. Если пользователь просит перенести или сдвинуть
  задачу, которая уже есть, используй это, а не create_task.

Расписание:
- У задачи может быть время начала time — строка "HH:MM", 24 часа, — и длительность
  duration в минутах. Задачи со временем — это расписание пользователя; оно видно ему
  в календаре на вкладке «План».
- create_task принимает time и duration: {"type":"create_task","goal":"...","title":"...",
  "days":[1,3,5],"time":"18:00","duration":60}. Повторяющийся блок задавай через days,
  разовый — через date.
- Когда просят составить расписание, ставь каждому блоку конкретное время и длительность.
  Время — только в формате "HH:MM", например "07:30", а не «утром».
- Не ставь блоки внахлёст друг на друга и на то, что уже стоит в расписании ниже.
  Оставляй паузы между занятиями и не назначай ничего на ночь, если не просили.
- Давай блокам уникальные названия, даже если они похожи: «Тренировка: ноги»,
  «Тренировка: спина» — так их потом можно будет однозначно перенести.
- Если для расписания не хватает данных — например, когда пользователь работает или
  учится, — задай один уточняющий вопрос вместо того, чтобы придумывать за него.

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
    // Расписание в скобках — чтобы модель видела время и не создавала задачу заново.
    const own = tasks
      .filter((t) => t.goalId === g.id)
      .map((t) => {
        const label = scheduleLabel(t)
        return label ? `${t.title} (${label})` : t.title
      })
    const deadline = g.deadline ? `, дедлайн ${g.deadline}` : ''
    const list = own.length > 0 ? `; задачи: ${own.join('; ')}` : '; задач нет'
    return `- ${g.title}${deadline}${list}`
  })
  return `Текущие цели пользователя:\n${lines.join('\n')}`
}

const SCHEDULE_DAYS = 7

/**
 * Что уже стоит в расписании на ближайшую неделю, по датам. Модель без этого не
 * может ни избежать пересечений, ни понять, что значит «завтра» или «в пятницу».
 */
function scheduleSummary(tasks: Task[]): string {
  const lines: string[] = []
  for (let i = 0; i < SCHEDULE_DAYS; i++) {
    const date = addDays(today(), i)
    const timed = sortByTime(tasksForDate(tasks, date).filter((t) => t.time))
    if (timed.length === 0) continue
    const items = timed.map((t) => `${timeRange(t.time!, t.duration)} ${t.title}`)
    lines.push(`${date} (${formatFullDate(date)}): ${items.join('; ')}`)
  }
  return lines.length > 0
    ? `Расписание на ближайшие ${SCHEDULE_DAYS} дней (только задачи со временем):\n${lines.join('\n')}`
    : `В расписании на ближайшие ${SCHEDULE_DAYS} дней нет задач со временем.`
}

const isAccent = (v: unknown): v is AccentKey => ACCENT_KEYS.includes(v as AccentKey)

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Дни недели 0–6 без повторов; все семь — это «каждый день», то есть пустой массив. Не массив — undefined. */
function cleanDays(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) return undefined
  const days = [...new Set(v.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
  return days.length === 7 ? [] : days
}

/** Приводит ответ модели к валидным действиям, молча отбрасывая мусор. */
function sanitize(raw: unknown): AssistantReply {
  const rec = (raw ?? {}) as Record<string, unknown>
  const reply = String(rec.reply ?? '').trim()

  const source = Array.isArray(rec.actions) ? rec.actions : []
  const actions: Action[] = []

  // Расписание на неделю — это десятки блоков, прежний потолок в 20 его обрезал бы.
  for (const item of source.slice(0, 60)) {
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
      // Непохожее на время не отбрасывает задачу — она создастся без времени, и это видно
      // в списке применённого, где время указано у каждой задачи, у которой оно есть.
      const time = normalizeTime(a.time)
      actions.push({
        type: 'create_task',
        goal,
        title,
        days: cleanDays(a.days) ?? [],
        date: ISO_DATE.test(date) ? date : undefined,
        time,
        duration: time ? cleanDuration(a.duration) : undefined,
      })
    } else if (a.type === 'reschedule_task') {
      const task = String(a.task ?? '').trim()
      if (!task) continue
      const date = String(a.date ?? '').trim()
      const change = {
        time: normalizeTime(a.time),
        duration: cleanDuration(a.duration),
        days: cleanDays(a.days),
        date: ISO_DATE.test(date) ? date : undefined,
      }
      // Ни одного годного поля — переносить нечего.
      if (Object.values(change).every((v) => v === undefined)) continue
      actions.push({ type: 'reschedule_task', task, ...change })
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

/** Сколько дней заметок подаём в чат — больше, чем в недельном разборе: здесь можно спросить и про позапрошлую неделю. */
const NOTES_DAYS = 14

export async function askAssistant(
  settings: AiSettings,
  history: ChatTurn[],
  goals: Goal[],
  tasks: Task[],
  notes: NotesStore,
  signal?: AbortSignal,
): Promise<AssistantReply> {
  const notesText = recentNotesText(notes, NOTES_DAYS)

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    {
      role: 'system',
      content: `Сегодня ${formatFullDate(today())} (${today()}).\n${stateSummary(goals, tasks)}`,
    },
    { role: 'system', content: scheduleSummary(tasks) },
    {
      role: 'system',
      content: notesText
        ? `Заметки пользователя за последние ${NOTES_DAYS} дней:\n${notesText}`
        : `Заметок за последние ${NOTES_DAYS} дней пользователь не писал.`,
    },
    ...history.slice(-HISTORY_TURNS).map(
      (t): ChatMessage => ({
        role: t.role,
        // Ассистенту возвращаем его текст — действия он видеть повторно не должен.
        content: t.text,
      }),
    ),
  ]

  // Недельное расписание — десятки действий; при 1200 токенах JSON обрывался бы на полуслове.
  const text = await chat(settings, messages, { maxTokens: 3500, json: true, signal })
  return sanitize(extractJSON<unknown>(text))
}
