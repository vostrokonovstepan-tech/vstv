import { useCallback, useEffect, useRef, useState } from 'react'
import { NOTE_MAX_LENGTH, useStore } from '../store'
import { Button } from './ui'
import { haptic, tg } from '../lib/telegram'

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; text: string }

/** Пауза после последней буквы, по истечении которой текст сохраняется сам. */
const AUTOSAVE_MS = 900

/**
 * Текстовое поле заметки дня — общее для карточки «сегодня» и шторки календаря.
 *
 * Сохраняет само: после паузы в наборе, при уходе с экрана и при сворачивании
 * приложения — забыть нажать кнопку больше нельзя. «Сохранено» появляется только
 * когда хранилище подтвердило запись; если не вышло — причина видна тут же.
 */
export function NoteEditor({ date, autoFocus }: { date: string; autoFocus?: boolean }) {
  const { getNote, setNote, isNotePersisted } = useStore()
  const stored = getNote(date)

  const [draft, setDraft] = useState(stored)
  /**
   * Что подтверждено хранилищем. null — неизвестно (заметка на экране есть, а в
   * хранилище не дошла): тогда текст считается несохранённым и уходит на запись.
   */
  const [persisted, setPersisted] = useState<string | null>(isNotePersisted(date) ? stored : null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  // Те же значения для обработчиков, которым нельзя ждать перерисовки, — уход с экрана и закрытие.
  const draftRef = useRef(draft)
  const persistedRef = useRef(persisted)
  const seq = useRef(0)

  const write = useCallback(
    async (forDate: string, text: string) => {
      const mine = ++seq.current
      setStatus({ kind: 'saving' })
      try {
        await setNote(forDate, text)
        persistedRef.current = text
        if (mine === seq.current) {
          setPersisted(text)
          setStatus({ kind: 'saved' })
          haptic('success')
        }
      } catch (err) {
        if (mine === seq.current) {
          setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'неизвестная ошибка' })
          haptic('warning')
        }
      }
    },
    [setNote],
  )

  const save = () => {
    const text = draftRef.current.trim()
    if (text !== persistedRef.current) void write(date, text)
  }

  // Открыли другой день — подхватываем его текст; уходя со старого дня или закрываясь,
  // дописываем несохранённое. Ошибку записи в этом случае покажет баннер стора.
  useEffect(() => {
    const value = getNote(date)
    const known = isNotePersisted(date) ? value : null
    draftRef.current = value
    persistedRef.current = known
    setDraft(value)
    setPersisted(known)
    setStatus({ kind: 'idle' })

    return () => {
      const text = draftRef.current.trim()
      if (text !== persistedRef.current) void setNote(date, text).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  // Автосохранение после паузы в наборе.
  useEffect(() => {
    if (draft.trim() === persisted) return
    const timer = setTimeout(save, AUTOSAVE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, persisted])

  // Свернули или закрывают приложение — не ждём паузы.
  useEffect(() => {
    const onLeave = () => {
      const text = draftRef.current.trim()
      if (text !== persistedRef.current) void setNote(date, text).catch(() => {})
    }
    document.addEventListener('visibilitychange', onLeave)
    window.addEventListener('pagehide', onLeave)
    tg()?.onEvent('deactivated', onLeave)
    return () => {
      document.removeEventListener('visibilitychange', onLeave)
      window.removeEventListener('pagehide', onLeave)
      tg()?.offEvent('deactivated', onLeave)
    }
  }, [date, setNote])

  const pending = draft.trim() !== persisted

  return (
    <div className="space-y-3">
      <textarea
        value={draft}
        onChange={(e) => {
          draftRef.current = e.target.value
          setDraft(e.target.value)
          if (status.kind === 'saved') setStatus({ kind: 'idle' })
        }}
        maxLength={NOTE_MAX_LENGTH}
        autoFocus={autoFocus}
        placeholder="Что сделал полезного для цели? Пара предложений хватит."
        rows={5}
        className="w-full resize-none rounded-2xl bg-surface px-4 py-3 text-[15px] outline-none placeholder:text-hint focus:ring-2 focus:ring-accent/40"
      />

      <div className="flex items-center justify-between px-1 text-[12px] text-hint">
        <span className="tabular">
          {draft.length}/{NOTE_MAX_LENGTH}
        </span>
        {status.kind === 'saving' && <span>Сохраняю…</span>}
        {status.kind === 'saved' && !pending && <span className="text-accent font-medium">✓ Сохранено</span>}
      </div>

      {status.kind === 'error' && (
        <p className="rounded-xl px-3 py-2.5 text-[13px] leading-snug text-danger" style={{ background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)' }}>
          Не сохранилось: {status.text}. Текст остался на экране — нажми «Повторить».
        </p>
      )}

      <Button onClick={save} disabled={!pending || status.kind === 'saving'}>
        {status.kind === 'error' ? 'Повторить' : stored ? 'Сохранить' : 'Записать'}
      </Button>
    </div>
  )
}
