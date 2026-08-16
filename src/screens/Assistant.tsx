import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { Screen, ScreenHeader } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import { AiSettingsForm } from '../components/AiSettingsForm'
import { Button, EmptyState } from '../components/ui'
import { AiError, aiConfigured } from '../lib/ai'
import { askAssistant, type ChatTurn } from '../lib/aiChat'
import { haptic } from '../lib/telegram'

const newId = () => Math.random().toString(36).slice(2, 8)

const EXAMPLES = [
  'Хочу выучить английский до B2 к июню',
  'Добавь бег три раза в неделю',
  'Составь план подготовки к марафону',
]

export function Assistant() {
  const store = useStore()
  const { ai, setAi, goals, tasks } = store

  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

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
      <ScreenHeader title="Помощник" subtitle={ai.model} />

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
            placeholder="Напиши цель или задачу"
            className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl bg-surface px-4 py-2.5 text-[16px] outline-none placeholder:text-hint focus:ring-2 focus:ring-accent/40"
          />
          <button
            type="submit"
            disabled={!draft.trim() || busy}
            aria-label="Отправить"
            className="press grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-40"
            style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}
