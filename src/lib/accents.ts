import type { AccentKey } from '../types'

export const ACCENTS: Record<AccentKey, { label: string; color: string }> = {
  indigo: { label: 'Индиго', color: '#6366f1' },
  emerald: { label: 'Изумруд', color: '#10b981' },
  amber: { label: 'Янтарь', color: '#f59e0b' },
  rose: { label: 'Роза', color: '#f43f5e' },
  sky: { label: 'Небо', color: '#0ea5e9' },
  violet: { label: 'Фиалка', color: '#a855f7' },
}

export const ACCENT_KEYS = Object.keys(ACCENTS) as AccentKey[]

export function accentColor(key: AccentKey | undefined): string {
  return ACCENTS[key ?? 'indigo']?.color ?? ACCENTS.indigo.color
}

/** Полупрозрачная подложка того же цвета — для плашек и колец прогресса. */
export function accentSoft(key: AccentKey | undefined, percent = 14): string {
  return `color-mix(in srgb, ${accentColor(key)} ${percent}%, transparent)`
}

export const GOAL_EMOJI = [
  '🎯', '🚀', '💪', '📚', '🧠', '💰', '🏃', '🎸',
  '🧘', '🌱', '💻', '🎨', '🗣️', '⚽', '🍎', '✍️',
]
