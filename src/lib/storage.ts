import { cloudStorage } from './telegram'

/**
 * Ключ-значение поверх Telegram CloudStorage.
 * Вне Telegram (или на клиенте старше Bot API 6.9) — localStorage,
 * чтобы приложение целиком работало в обычном браузере при разработке.
 *
 * Ограничения CloudStorage, которые формируют схему ключей:
 *  - ключ: 1–128 символов из [A-Za-z0-9_-];
 *  - значение: до 4096 символов;
 *  - до 1024 ключей на пользователя.
 */

const LS_PREFIX = 'goaltracker:'

export const MAX_VALUE_LENGTH = 4096

export class ValueTooLargeError extends Error {
  constructor(public key: string, public length: number) {
    super(`Значение для «${key}» не помещается в хранилище (${length} из ${MAX_VALUE_LENGTH} символов)`)
    this.name = 'ValueTooLargeError'
  }
}

export async function getMany(keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return {}
  const cs = cloudStorage()
  if (!cs) {
    const out: Record<string, string> = {}
    for (const key of keys) {
      const raw = localStorage.getItem(LS_PREFIX + key)
      if (raw !== null) out[key] = raw
    }
    return out
  }
  return new Promise((resolve, reject) => {
    cs.getItems(keys, (err, values) => {
      if (err) reject(new Error(err))
      // CloudStorage возвращает отсутствующие ключи как пустые строки — отсеиваем.
      else {
        const out: Record<string, string> = {}
        for (const [k, v] of Object.entries(values ?? {})) if (v) out[k] = v
        resolve(out)
      }
    })
  })
}

export async function setItem(key: string, value: string): Promise<void> {
  if (value.length > MAX_VALUE_LENGTH) throw new ValueTooLargeError(key, value.length)
  const cs = cloudStorage()
  if (!cs) {
    localStorage.setItem(LS_PREFIX + key, value)
    return
  }
  return new Promise((resolve, reject) => {
    cs.setItem(key, value, (err) => (err ? reject(new Error(err)) : resolve()))
  })
}

export async function removeItem(key: string): Promise<void> {
  const cs = cloudStorage()
  if (!cs) {
    localStorage.removeItem(LS_PREFIX + key)
    return
  }
  return new Promise((resolve, reject) => {
    cs.removeItem(key, (err) => (err ? reject(new Error(err)) : resolve()))
  })
}

export async function getJSON<T>(key: string, fallback: T): Promise<T> {
  const values = await getMany([key])
  return parseJSON(values[key], fallback)
}

export function parseJSON<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    // повреждённое значение не должно ронять приложение — начинаем с чистого листа
    return fallback
  }
}

/**
 * Очередь записи: на каждый ключ держим только последнее значение и пишем его
 * с задержкой. Иначе отметка задачи била бы в CloudStorage на каждый тап.
 */
const pending = new Map<string, string>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
let onError: ((err: unknown) => void) | null = null

export function setStorageErrorHandler(handler: (err: unknown) => void) {
  onError = handler
}

async function flushKey(key: string) {
  timers.delete(key)
  const value = pending.get(key)
  if (value === undefined) return
  pending.delete(key)
  try {
    await setItem(key, value)
  } catch (err) {
    onError?.(err)
  }
}

export function queueWrite(key: string, value: string, delayMs = 600) {
  pending.set(key, value)
  clearTimeout(timers.get(key))
  timers.set(key, setTimeout(() => void flushKey(key), delayMs))
}

/** Сбрасывает все отложенные записи немедленно — перед сворачиванием/закрытием. */
export async function flushAll(): Promise<void> {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  await Promise.all([...pending.keys()].map(flushKey))
}
