import { useState } from 'react'
import {
  AiError,
  DEFAULT_AI,
  PROVIDERS,
  aiConfigured,
  listModels,
  testConnection,
  type AiSettings,
  type ModelInfo,
} from '../lib/ai'
import { Button, Field, TextInput } from './ui'
import { haptic } from '../lib/telegram'

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; what: 'test' | 'models' }
  | { kind: 'ok'; text: string }
  | { kind: 'fail'; text: string }

export function AiSettingsForm({
  value,
  onSave,
  onClose,
}: {
  value: AiSettings
  onSave: (next: AiSettings) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<AiSettings>(value)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [models, setModels] = useState<ModelInfo[] | null>(null)
  const [filter, setFilter] = useState('')

  const patch = (p: Partial<AiSettings>) => {
    setDraft((d) => ({ ...d, ...p }))
    setStatus({ kind: 'idle' })
  }

  const busy = status.kind === 'busy'

  const loadModels = async () => {
    setStatus({ kind: 'busy', what: 'models' })
    try {
      const list = await listModels(draft)
      setModels(list)
      setStatus({ kind: 'ok', text: `Загружено моделей: ${list.length}` })
    } catch (err) {
      setModels(null)
      setStatus({
        kind: 'fail',
        text: err instanceof AiError ? err.message : 'Не удалось загрузить список',
      })
    }
  }

  const check = async () => {
    setStatus({ kind: 'busy', what: 'test' })
    try {
      const reply = await testConnection(draft)
      haptic('success')
      setStatus({ kind: 'ok', text: `Работает. Ответ модели: «${reply}»` })
    } catch (err) {
      haptic('warning')
      setStatus({
        kind: 'fail',
        text: err instanceof AiError ? err.message : 'Проверка не удалась',
      })
    }
  }

  const save = () => {
    onSave({
      baseUrl: draft.baseUrl.trim(),
      apiKey: draft.apiKey.trim(),
      model: draft.model.trim(),
    })
    onClose()
  }

  const disconnect = () => {
    onSave({ ...DEFAULT_AI })
    onClose()
  }

  const visible = models
    ? models
        .filter((m) => m.id.toLowerCase().includes(filter.trim().toLowerCase()))
        .slice(0, 40)
    : []

  return (
    <div className="space-y-5">
      <Field label="Провайдер">
        <div className="flex flex-wrap gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.baseUrl}
              type="button"
              onClick={() => {
                // Модель от прошлого провайдера у нового не существует — сбрасываем.
                patch({ baseUrl: p.baseUrl, model: '' })
                setModels(null)
              }}
              className="press rounded-full px-3.5 py-2 text-[14px] font-medium"
              style={
                draft.baseUrl.replace(/\/+$/, '') === p.baseUrl
                  ? { background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }
                  : { background: 'var(--color-surface)' }
              }
            >
              {p.label}
            </button>
          ))}
        </div>
        <TextInput
          className="mt-2"
          value={draft.baseUrl}
          onChange={(e) => patch({ baseUrl: e.target.value })}
          placeholder="https://openrouter.ai/api/v1"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </Field>

      <Field label="Ключ API">
        <TextInput
          type="password"
          value={draft.apiKey}
          onChange={(e) => patch({ apiKey: e.target.value })}
          placeholder="sk-or-v1-…"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <p className="mt-2 px-1 text-[13px] leading-snug text-hint">
          Хранится в CloudStorage Telegram, в репозиторий не попадает. Запросы идут с твоего
          устройства напрямую к провайдеру.
        </p>
      </Field>

      <Field label="Модель">
        <TextInput
          value={draft.model}
          onChange={(e) => patch({ model: e.target.value })}
          placeholder="например, openai/gpt-4o-mini"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={loadModels}
          disabled={busy || !draft.apiKey.trim()}
          className="press mt-2 rounded-xl bg-surface px-3.5 py-2 text-[14px] font-medium disabled:opacity-40"
        >
          {status.kind === 'busy' && status.what === 'models'
            ? 'Загружаю…'
            : 'Показать доступные модели'}
        </button>
      </Field>

      {models && (
        <div className="space-y-2">
          <TextInput
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Поиск по названию"
            autoCapitalize="off"
            spellCheck={false}
          />
          <div className="card max-h-64 divide-y divide-line overflow-y-auto">
            {visible.length === 0 ? (
              <p className="px-4 py-3 text-[14px] text-hint">Ничего не найдено</p>
            ) : (
              visible.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => patch({ model: m.id })}
                  className="block w-full px-4 py-2.5 text-left"
                >
                  <div className="truncate text-[14px]">{m.id}</div>
                  {m.inPrice !== undefined && m.outPrice !== undefined && (
                    <div className="tabular mt-0.5 text-[12px] text-hint">
                      ${m.inPrice.toFixed(2)} вход · ${m.outPrice.toFixed(2)} выход за 1M токенов
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {status.kind === 'ok' && (
        <p className="rounded-xl bg-surface px-4 py-3 text-[14px] leading-snug">✅ {status.text}</p>
      )}
      {status.kind === 'fail' && (
        <p className="rounded-xl px-4 py-3 text-[14px] leading-snug text-danger" style={{ background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)' }}>
          ⚠️ {status.text}
        </p>
      )}

      <Button
        variant="ghost"
        onClick={check}
        disabled={busy || !aiConfigured(draft)}
      >
        {status.kind === 'busy' && status.what === 'test' ? 'Проверяю…' : 'Проверить соединение'}
      </Button>

      <div className="pt-2">
        <Field label="Голосовой ввод — необязательно">
          <p className="mb-3 px-1 text-[13px] leading-snug text-hint">
            Не у всех провайдеров с рабочим чатом есть распознавание речи — например, у OpenRouter
            его нет. Проще всего указать здесь ключ Groq и модель{' '}
            <code className="rounded bg-surface px-1 py-0.5">whisper-large-v3-turbo</code> — у нас
            уже есть свой ключ на чат, для голоса можно завести отдельный бесплатный.
          </p>
          <div className="space-y-2">
            <TextInput
              value={draft.voiceModel ?? ''}
              onChange={(e) => patch({ voiceModel: e.target.value })}
              placeholder="whisper-large-v3-turbo"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <TextInput
              value={draft.voiceBaseUrl ?? ''}
              onChange={(e) => patch({ voiceBaseUrl: e.target.value })}
              placeholder="Адрес API — пусто значит тот же, что для чата"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <TextInput
              type="password"
              value={draft.voiceApiKey ?? ''}
              onChange={(e) => patch({ voiceApiKey: e.target.value })}
              placeholder="Ключ — пусто значит тот же, что для чата"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        </Field>
      </div>

      <Button onClick={save} disabled={!aiConfigured(draft)}>
        Сохранить
      </Button>

      {aiConfigured(value) && (
        <Button variant="danger" onClick={disconnect}>
          Отключить ИИ
        </Button>
      )}
    </div>
  )
}
