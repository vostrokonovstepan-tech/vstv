import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { Screen, ScreenHeader } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import { AiSettingsForm } from '../components/AiSettingsForm'
import { Button, EmptyState } from '../components/ui'
import { AiError, aiConfigured, transcribe, voiceConfigured } from '../lib/ai'
import { askAssistant, type ChatTurn } from '../lib/aiChat'
import { askWeeklyReview } from '../lib/aiWeekly'
import { useVoiceRecorder } from '../lib/useVoiceRecorder'
import { haptic } from '../lib/telegram'

const newId = () => Math.random().toString(36).slice(2, 8)

const EXAMPLES = [
  'Хочу выучить английский до B2 к июню',
  'Добавь бег три раза в неделю',
  'Составь план подготовки к марафону',
]

/** mm:ss — таймер записи короткий, но formatDuration из lib/date рассчитан на часы. */
function formatRecTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function Assistant() {
  const store = useStore()
  const { ai, setAi, goals, tasks, months } = store

  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [weeklyBusy, setWeeklyBusy] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns, busy])

  // Незавершённый запрос при уходе с экрана незачем держать.
  useEffect(() => () => abortRef.current?.abort(), [])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || busy) return

    const userTurn: ChatTurn = { id: newId(), role: 'user', text: trimmed }
    // История для запроса — до добавления ответа, но уже с новой репликой.
    const history = [...turns, userTurn]

    setTurns(history)
    setDraft('')
    setBusy(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const { reply, actions } = await askAssistant(
        ai,
        history,
        goals,
        tasks,
        controller.signal,
      )
      const applied = actions.length > 0 ? store.applyAiActions(actions) : []
      if (applied.length > 0) haptic('success')

      setTurns((prev) => [
        ...prev,
        {
          id: newId(),
          role: 'assistant',
          text: reply || (applied.length > 0 ? 'Готово.' : '…'),
          applied: applied.length > 0 ? applied : undefined,
        },
      ])
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      haptic('warning')
      setTurns((prev) => [
        ...prev,
        {
          id: newId(),
          role: 'assistant',
          text: err instanceof AiError ? err.message : 'Что-то пошло не так',
          failed: true,
        },
      ])
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  const runWeeklyReview = async () => {
    if (weeklyBusy) return
    setWeeklyBusy(true)
    setTurns((prev) => [...prev, { id: newId(), role: 'user', text: '📊 Разбор недели' }])

    try {
      const text = await askWeeklyReview(ai, goals, tasks, months)
      setTurns((prev) => [...prev, { id: newId(), role: 'assistant', text }])
    } catch (err) {
      haptic('warning')
      setTurns((prev) => [
        ...prev,
        {
          id: newId(),
          role: 'assistant',
          text: err instanceof AiError ? err.message : 'Не удалось составить разбор',
          failed: true,
        },
      ])
    } finally {
      setWeeklyBusy(false)
    }
  }

  const recorder = useVoiceRecorder(
    async (blob, mimeType) => {
      const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm'
      try {
        const text = await transcribe(ai, blob, `voice.${ext}`)
        setDraft((d) => (d ? `${d} ${text}` : text))
        haptic('select')
      } catch (err) {
        haptic('warning')
        setVoiceError(err instanceof AiError ? err.message : 'Не удалось распознать речь')
      } finally {
        recorder.finish()
      }
    },
    (message) => setVoiceError(message),
  )

  const toggleRecording = () => {
    setVoiceError(null)
    if (recorder.state === 'idle') {
      haptic('tap')
      void recorder.start()
    } else if (recorder.state === 'recording') {
      haptic('select')
      recorder.stop()
    }
  }

  if (!aiConfigured(ai)) {
    return (
      <Screen>
        <ScreenHeader title="Помощник" />
        <div className="card">
          <EmptyState
            emoji="✨"
            title="Помощник не подключён"
            hint="Опиши цель словами — он сам разобьёт её на задачи и добавит в приложение. Нужен ключ от любого провайдера с OpenAI-совместимым API."
            action={<Button onClick={() => setSettingsOpen(true)}>Подключить</Button>}
          />
        </div>
        <Sheet open={settingsOpen} title="Помощник" onClose={() => setSettingsOpen(false)}>
          <AiSettingsForm value={ai} onSave={setAi} onClose={() => setSettingsOpen(false)} />
        </Sheet>
      </Screen>
    )
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-4 pt-4 pb-40">
      <div className="flex items-start justify-between gap-3">
        <ScreenHeader title="Помощник" subtitle={ai.model} />
        {goals.length > 0 && (
          <button
            type="button"
            onClick={() => void runWeeklyReview()}
            disabled={weeklyBusy || busy}
            className="press mt-1 flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3.5 py-2 text-[13px] font-medium disabled:opacity-40"
          >
            📊 {weeklyBusy ? 'Считаю…' : 'Разбор недели'}
          </button>
        )}
      </div>

      <div className="flex-1 space-y-3 pt-2">
        {turns.length === 0 && (
          <div className="space-y-3">
            <p className="px-1 text-[14px] leading-snug text-hint">
              Опиши цель или задачу своими словами — я добавлю их в приложение сам.
            </p>
            <div className="space-y-2">
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => void send(e)}
                  className="press card block w-full px-4 py-3 text-left text-[14px]"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn) =>
          turn.role === 'user' ? (
            <div key={turn.id} className="flex justify-end">
              <div
                className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] break-words"
                style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}
              >
                {turn.text}
              </div>
            </div>
          ) : (
            <div key={turn.id} className="flex justify-start">
              <div className="max-w-[90%] space-y-2">
                <div
                  className="card rounded-bl-md px-4 py-2.5 text-[15px] break-words"
                  style={turn.failed ? { color: 'var(--color-danger)' } : undefined}
                >
                  {turn.failed && '⚠️ '}
                  {turn.text}
                </div>
                {turn.applied && (
                  <ul className="space-y-1 px-1">
                    {turn.applied.map((line) => (
                      <li key={line} className="text-[13px] text-hint">
                        ✅ {line}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ),
        )}

        {busy && (
          <div className="flex justify-start">
            <div className="card flex gap-1.5 rounded-bl-md px-4 py-3.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 animate-bounce rounded-full bg-hint"
                  style={{ animationDelay: `${i * 140}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-14 z-30 border-t border-line bg-bg/95 px-4 py-2.5 backdrop-blur">
        {voiceError && (
          <p className="mx-auto mb-2 max-w-md text-[13px] leading-snug text-danger">
            ⚠️ {voiceError}
            {!voiceConfigured(ai) && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="underline"
                >
                  Настроить
                </button>
              </>
            )}
          </p>
        )}

        {recorder.state === 'recording' ? (
          <div className="mx-auto flex max-w-md items-center gap-2">
            <button
              type="button"
              onClick={recorder.cancel}
              aria-label="Отменить запись"
              className="press grid size-11 shrink-0 place-items-center rounded-full bg-surface text-hint"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
            <div className="flex flex-1 items-center gap-2.5 rounded-2xl bg-surface px-4 py-2.5">
              <span className="relative flex size-2.5 shrink-0">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger/70" />
                <span className="relative inline-flex size-2.5 rounded-full bg-danger" />
              </span>
              <span className="tabular text-[15px]">{formatRecTime(recorder.seconds)}</span>
              <span className="text-[14px] text-hint">Говори — я слушаю</span>
            </div>
            <button
              type="button"
              onClick={toggleRecording}
              aria-label="Завершить запись"
              className="press grid size-11 shrink-0 place-items-center rounded-full"
              style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          </div>
        ) : (
          <form
            className="mx-auto flex max-w-md items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void send(draft)
            }}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send(draft)
                }
              }}
              rows={1}
              placeholder={
                recorder.state === 'processing' ? 'Распознаю…' : 'Напиши или наговори цель'
              }
              disabled={recorder.state === 'processing'}
              className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl bg-surface px-4 py-2.5 text-[16px] outline-none placeholder:text-hint focus:ring-2 focus:ring-accent/40 disabled:opacity-60"
            />
            {draft.trim() ? (
              <button
                type="submit"
                disabled={busy}
                aria-label="Отправить"
                className="press grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-40"
                style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={toggleRecording}
                disabled={recorder.state === 'processing'}
                aria-label="Записать голосом"
                className="press grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-40"
                style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}
              >
                {recorder.state === 'processing' ? (
                  <svg viewBox="0 0 24 24" className="size-5 animate-spin" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M19 11a7 7 0 0 1-14 0M12 18v3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
