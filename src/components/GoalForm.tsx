import { useState } from 'react'
import type { AccentKey, Goal } from '../types'
import { ACCENTS, ACCENT_KEYS, GOAL_EMOJI, accentColor } from '../lib/accents'
import { Button, Field, TextInput } from './ui'
import { confirmDialog } from '../lib/telegram'

type Props = {
  goal?: Goal
  onSave: (data: { title: string; emoji: string; accent: AccentKey; deadline?: string }) => void
  onDelete?: () => void
  onClose: () => void
}

export function GoalForm({ goal, onSave, onDelete, onClose }: Props) {
  const [title, setTitle] = useState(goal?.title ?? '')
  const [emoji, setEmoji] = useState(goal?.emoji ?? GOAL_EMOJI[0])
  const [accent, setAccent] = useState<AccentKey>(goal?.accent ?? 'indigo')
  const [deadline, setDeadline] = useState(goal?.deadline ?? '')

  const trimmed = title.trim()

  const submit = () => {
    if (!trimmed) return
    onSave({ title: trimmed, emoji, accent, deadline: deadline || undefined })
    onClose()
  }

  const remove = async () => {
    if (!onDelete) return
    const ok = await confirmDialog(
      `Удалить цель «${goal?.title}»? Её задачи тоже исчезнут.`,
    )
    if (!ok) return
    onDelete()
    onClose()
  }

  return (
    <div className="space-y-5">
      <Field label="Название цели">
        <TextInput
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Например, выучить английский"
          maxLength={60}
          autoFocus={!goal}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </Field>

      <Field label="Значок">
        <div className="grid grid-cols-8 gap-1.5">
          {GOAL_EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              className="press grid aspect-square place-items-center rounded-xl text-2xl"
              style={{
                background: e === emoji ? `color-mix(in srgb, ${accentColor(accent)} 20%, transparent)` : 'transparent',
              }}
            >
              {e}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Цвет">
        <div className="flex gap-3">
          {ACCENT_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={ACCENTS[key].label}
              onClick={() => setAccent(key)}
              className="press grid size-9 place-items-center rounded-full"
              style={{ background: ACCENTS[key].color }}
            >
              {key === accent && (
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="#fff" strokeWidth={3}>
                  <path d="M4 12.5 9.5 18 20 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Дедлайн — необязательно">
        <TextInput
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />
      </Field>

      <Button onClick={submit} disabled={!trimmed} accent={accentColor(accent)}>
        {goal ? 'Сохранить' : 'Создать цель'}
      </Button>

      {onDelete && (
        <Button variant="danger" onClick={remove}>
          Удалить цель
        </Button>
      )}
    </div>
  )
}
