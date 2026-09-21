/**
 * Значение CloudStorage ограничено 4096 символами. Всё, что может вырасти сверх этого —
 * список задач, заметки и отметки за месяц, — хранится кусками: первый лежит под прежним
 * ключом (старые данные читаются без миграции), остальные — под ключами с суффиксом.
 */

/** Кусков для списка задач: ~29 задач на кусок, этого хватает на сотни. */
export const MAX_CHUNKS = 8

/**
 * Кусков для месячного словаря «день → значение». Худший случай — заметки:
 * 31 день по 500 символов ≈ 16 000, то есть пять кусков по 3800.
 */
export const MAX_RECORD_CHUNKS = 5

/** Запас до предела 4096: данные пакуются чуть плотнее нуля, но не впритык. */
const CHUNK_LIMIT = 3800

export const chunkKey = (base: string, i: number) => (i === 0 ? base : `${base}_${i}`)

export const chunkKeys = (base: string, count = MAX_CHUNKS) =>
  Array.from({ length: count }, (_, i) => chunkKey(base, i))

/** Жадно раскладывает элементы по кускам, каждый из которых сериализуется в ≤ CHUNK_LIMIT. */
export function packChunks<T>(items: T[]): T[][] {
  const chunks: T[][] = []
  let current: T[] = []
  for (const item of items) {
    if (current.length > 0 && JSON.stringify([...current, item]).length > CHUNK_LIMIT) {
      chunks.push(current)
      current = []
    }
    current.push(item)
  }
  if (current.length > 0 || chunks.length === 0) chunks.push(current)
  return chunks
}

/** То же для словаря: записи раскладываются по кускам-словарям, порядок ключей сохраняется. */
export function packRecordChunks<V>(record: Record<string, V>): Record<string, V>[] {
  const chunks: Record<string, V>[] = []
  let current: Record<string, V> = {}
  let count = 0
  for (const [key, value] of Object.entries(record)) {
    if (count > 0 && JSON.stringify({ ...current, [key]: value }).length > CHUNK_LIMIT) {
      chunks.push(current)
      current = {}
      count = 0
    }
    current[key] = value
    count++
  }
  if (count > 0 || chunks.length === 0) chunks.push(current)
  return chunks
}
