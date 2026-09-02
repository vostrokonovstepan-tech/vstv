import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { NOTE_MAX_LENGTH } from '../store'
import { Button } from './ui'
import { haptic } from '../lib/telegram'

/** Текстовое поле заметки дня с сохранением — общее для карточки «сегодня» и шторки календаря. */
export function NoteEditor({ date, autoFocus }: { date: string; autoFocus?: boolean }) {
  const { getNote, setNote } = useStore()
  const saved = getNote(date)
  const [draft, setDraft] = useState(saved)
  const [justSaved, setJustSaved] = useState(false)

  // Дата сменилась (открыли другой день в календаре) — подхватываем её текст.
  useEffect(() => {
    setDraft(saved)
    setJustSaved(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  const dirty = draft.trim() !== saved

  const save = () => {
    setNote(date, draft)
    haptic('success')
    setJustSaved(true)
  }

  return (
    <div className="space-y-3">
      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          setJustSaved(false)
        }}
        maxLength={NOTE_MAX_LENGTH}
        autoFocus={autoFocus}
        placeholder="Что сделал полезного для цели? Пара предложений хватит."
        rows={5}
        className="w-full resize-none rounded-2xl bg-surface px-4 py-3 text-[15px] outline-none placeholder:text-hint focus:ring-2 focus:ring-accent/40"
      />
      <div className="flex items-center justify-between px-1 text-[12px] text-hint">
        <span className="tabular">{draft.length}/{NOTE_MAX_LENGTH}</span>
        {justSaved && !dirty && <span className="text-accent font-medium">✓ Сохранено</span>}
      </div>
      <Button onClick={save} disabled={!dirty}>
        {saved ? 'Сохранить' : 'Записать'}
      </Button>
    </div>
  )
}
