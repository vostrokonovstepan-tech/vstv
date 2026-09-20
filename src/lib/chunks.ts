/**
 * Значение CloudStorage ограничено 4096 символами, а список задач с расписанием
 * упирается в этот предел уже на ~29 задачах. Поэтому массив хранится кусками:
 * первый — под прежним ключом (старые данные читаются без миграции), остальные —
 * под ключами с суффиксом.
 */

export const MAX_CHUNKS = 8

/** Запас до предела 4096: массив пакуется чуть плотнее нуля, но не впритык. */
const CHUNK_LIMIT = 3800

export const chunkKey = (base: string, i: number) => (i === 0 ? base : `${base}_${i}`)

export const chunkKeys = (base: string) => Array.from({ length: MAX_CHUNKS }, (_, i) => chunkKey(base, i))

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
