/**
 * Клиент к любому OpenAI-совместимому API (OpenRouter, DeepSeek, Groq, Mistral…).
 *
 * Запросы уходят прямо из браузера, без своего сервера — это работает, потому что
 * перечисленные провайдеры отдают CORS-заголовки. Проверено вызовом с фиктивным
 * ключом: приходит честный 401, а не обрыв соединения.
 *
 * Ключ пользователя лежит в CloudStorage Telegram и в репозиторий не попадает.
 */

export type AiSettings = {
  /** Базовый адрес без /chat/completions — например https://openrouter.ai/api/v1 */
  baseUrl: string
  apiKey: string
  model: string
  /**
   * Распознавание голоса — отдельные, необязательные настройки. Не все провайдеры
   * с рабочим чатом умеют /audio/transcriptions (например, в каталоге OpenRouter
   * нет ни одной модели-транскрайбера), поэтому голос можно направить к другому
   * провайдеру, не трогая основной чат. Пустые baseUrl/apiKey — значит те же, что у чата.
   */
  voiceBaseUrl?: string
  voiceApiKey?: string
  voiceModel?: string
}

export const DEFAULT_AI: AiSettings = {
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: '',
  model: '',
  voiceBaseUrl: '',
  voiceApiKey: '',
  voiceModel: '',
}

/** Голос включён, если явно указана модель — угадывать её мы не можем. */
export function voiceConfigured(s: AiSettings | null | undefined): boolean {
  return Boolean(s?.voiceModel?.trim())
}

function resolveVoiceConfig(s: AiSettings): AiSettings {
  return {
    baseUrl: s.voiceBaseUrl?.trim() || s.baseUrl,
    apiKey: s.voiceApiKey?.trim() || s.apiKey,
    model: s.voiceModel?.trim() ?? '',
  }
}

/** Известные провайдеры — чтобы не вспоминать адреса руками. */
export const PROVIDERS: { label: string; baseUrl: string }[] = [
  { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com' },
  { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  { label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1' },
  { label: 'Together', baseUrl: 'https://api.together.xyz/v1' },
]

export function aiConfigured(s: AiSettings | null | undefined): boolean {
  return Boolean(s?.apiKey?.trim() && s?.model?.trim() && s?.baseUrl?.trim())
}

/** Убирает лишний слеш, чтобы не собрать адрес вида `…/v1//models`. */
const trimUrl = (url: string) => url.trim().replace(/\/+$/, '')

export class AiError extends Error {
  constructor(message: string, public status?: number) {
    super(message)
    this.name = 'AiError'
  }
}

function headers(s: AiSettings): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${s.apiKey.trim()}`,
    // OpenRouter показывает эти поля в статистике; другим провайдерам они безразличны.
    'HTTP-Referer': location.origin,
    'X-Title': 'Goal Tracker',
  }
}

/** Достаёт человекочитаемую причину из тела ошибки, какой бы формы оно ни было. */
async function describeError(res: Response): Promise<string> {
  let detail = ''
  try {
    const body = await res.text()
    try {
      const json = JSON.parse(body)
      detail = json?.error?.message ?? json?.message ?? json?.error ?? ''
    } catch {
      detail = body.slice(0, 200)
    }
  } catch {
    // тело недоступно — обойдёмся кодом
  }

  const known: Record<number, string> = {
    401: 'Ключ не принят',
    402: 'Кончились деньги на счёте',
    403: 'Доступ запрещён — проверь права ключа',
    404: 'Модель не найдена',
    429: 'Слишком часто — подожди немного',
  }
  const base = known[res.status] ?? `Ошибка ${res.status}`
  return detail ? `${base}: ${detail}` : base
}

export type ModelInfo = {
  id: string
  name: string
  /** Цена за миллион токенов; undefined, если провайдер её не отдаёт. */
  inPrice?: number
  outPrice?: number
}

/** Список моделей провайдера. Эндпоинт /models есть у всех OpenAI-совместимых API. */
export async function listModels(s: AiSettings): Promise<ModelInfo[]> {
  const res = await fetch(`${trimUrl(s.baseUrl)}/models`, {
    headers: headers(s),
  }).catch(() => {
    throw new AiError('Не удалось соединиться — проверь адрес API и сеть')
  })

  if (!res.ok) throw new AiError(await describeError(res), res.status)

  const json = await res.json()
  const raw: unknown[] = json?.data ?? []

  return raw
    .map((item) => {
      const m = item as Record<string, unknown>
      const pricing = m.pricing as Record<string, string> | undefined
      const toNum = (v: string | undefined) => {
        const n = Number(v)
        return Number.isFinite(n) && n > 0 ? n * 1e6 : undefined
      }
      return {
        id: String(m.id ?? ''),
        name: String(m.name ?? m.id ?? ''),
        inPrice: toNum(pricing?.prompt),
        outPrice: toNum(pricing?.completion),
      }
    })
    .filter((m) => m.id)
    .sort((a, b) => a.id.localeCompare(b.id))
}

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

/** Один запрос к модели. Возвращает текст ответа. */
export async function chat(
  s: AiSettings,
  messages: ChatMessage[],
  opts: { maxTokens?: number; json?: boolean; signal?: AbortSignal } = {},
): Promise<string> {
  const body: Record<string, unknown> = {
    model: s.model.trim(),
    messages,
    max_tokens: opts.maxTokens ?? 1200,
  }
  // Не все модели умеют строгую схему, а json_object поддержан широко.
  if (opts.json) body.response_format = { type: 'json_object' }

  const res = await fetch(`${trimUrl(s.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: headers(s),
    body: JSON.stringify(body),
    signal: opts.signal,
  }).catch((err: unknown) => {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new AiError('Не удалось соединиться — проверь адрес API и сеть')
  })

  if (!res.ok) throw new AiError(await describeError(res), res.status)

  const json = await res.json()
  const text: string = json?.choices?.[0]?.message?.content ?? ''
  if (!text.trim()) throw new AiError('Модель вернула пустой ответ')
  return text
}

/**
 * Достаёт JSON из ответа модели. Модели любят обернуть его в ```json-блок
 * или добавить пояснение до и после — вырезаем первый сбалансированный объект.
 */
export function extractJSON<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text

  const start = candidate.search(/[[{]/)
  if (start === -1) throw new AiError('В ответе модели нет JSON')

  const open = candidate[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (ch === '"') inString = !inString
    if (inString) continue
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1)) as T
        } catch {
          throw new AiError('Модель вернула повреждённый JSON')
        }
      }
    }
  }
  throw new AiError('Модель не дописала ответ до конца')
}

/** Распознаёт голосовую запись через /audio/transcriptions — эндпоинт формата Whisper. */
export async function transcribe(
  s: AiSettings,
  audio: Blob,
  filename: string,
): Promise<string> {
  const voice = resolveVoiceConfig(s)
  if (!voice.model) throw new AiError('Модель распознавания голоса не настроена')

  const form = new FormData()
  form.append('file', audio, filename)
  form.append('model', voice.model)

  const res = await fetch(`${trimUrl(voice.baseUrl)}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${voice.apiKey.trim()}`,
      'HTTP-Referer': location.origin,
      'X-Title': 'Goal Tracker',
      // Content-Type для FormData браузер выставляет сам, вместе с boundary —
      // задав его руками, сломаем разбор тела на стороне сервера.
    },
    body: form,
  }).catch(() => {
    throw new AiError('Не удалось соединиться — проверь адрес API для голоса')
  })

  if (!res.ok) throw new AiError(await describeError(res), res.status)

  const json = await res.json()
  const text: string = json?.text ?? ''
  if (!text.trim()) throw new AiError('Не удалось распознать речь — запись пустая?')
  return text.trim()
}

/** Пробный запрос — проверяет разом адрес, ключ и модель. */
export async function testConnection(s: AiSettings): Promise<string> {
  const reply = await chat(
    s,
    [{ role: 'user', content: 'Ответь одним словом: работает' }],
    { maxTokens: 20 },
  )
  return reply.trim().slice(0, 80)
}
