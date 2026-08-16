/**
 * Тонкая обёртка над Telegram WebApp SDK.
 * Всё опционально: вне Telegram (обычный браузер при разработке) вызовы
 * тихо превращаются в no-op, а хранилище падает на localStorage.
 */

type CloudStorageApi = {
  setItem(key: string, value: string, cb?: (err: string | null, ok?: boolean) => void): void
  getItem(key: string, cb: (err: string | null, value?: string) => void): void
  getItems(keys: string[], cb: (err: string | null, values?: Record<string, string>) => void): void
  removeItem(key: string, cb?: (err: string | null, ok?: boolean) => void): void
  getKeys(cb: (err: string | null, keys?: string[]) => void): void
}

type ThemeParams = {
  bg_color?: string
  text_color?: string
  hint_color?: string
  link_color?: string
  button_color?: string
  button_text_color?: string
  secondary_bg_color?: string
  section_bg_color?: string
  section_separator_color?: string
  subtitle_text_color?: string
  destructive_text_color?: string
  accent_text_color?: string
}

type BackButtonApi = {
  show(): void
  hide(): void
  onClick(cb: () => void): void
  offClick(cb: () => void): void
}

type HapticApi = {
  impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
  notificationOccurred(type: 'error' | 'success' | 'warning'): void
  selectionChanged(): void
}

type TelegramWebApp = {
  ready(): void
  expand(): void
  close(): void
  isExpanded: boolean
  version: string
  platform: string
  colorScheme: 'light' | 'dark'
  themeParams: ThemeParams
  viewportStableHeight?: number
  initDataUnsafe?: { user?: { id: number; first_name?: string; username?: string; photo_url?: string } }
  CloudStorage?: CloudStorageApi
  BackButton?: BackButtonApi
  HapticFeedback?: HapticApi
  onEvent(event: string, cb: () => void): void
  offEvent(event: string, cb: () => void): void
  setHeaderColor?(color: string): void
  setBackgroundColor?(color: string): void
  disableVerticalSwipes?(): void
  enableClosingConfirmation?(): void
  showConfirm?(message: string, cb: (ok: boolean) => void): void
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

export const tg = (): TelegramWebApp | undefined => window.Telegram?.WebApp

/**
 * Внутри реального Telegram-клиента?
 * SDK подключается и в обычном браузере, но там ставит platform = 'unknown';
 * по нему и отличаем, иначе любой вызов упадёт с WebAppMethodUnsupported.
 */
export const inTelegram = (): boolean => {
  const app = tg()
  return Boolean(app && app.platform && app.platform !== 'unknown')
}

export const cloudStorage = (): CloudStorageApi | undefined => {
  if (!inTelegram()) return undefined
  const app = tg()
  // CloudStorage появился в Bot API 6.9 — в старых клиентах объекта просто нет.
  return app?.CloudStorage && typeof app.CloudStorage.getItems === 'function'
    ? app.CloudStorage
    : undefined
}

export function haptic(kind: 'tap' | 'success' | 'warning' | 'select' = 'tap') {
  const h = inTelegram() ? tg()?.HapticFeedback : undefined
  if (!h) return
  try {
    if (kind === 'tap') h.impactOccurred('light')
    else if (kind === 'select') h.selectionChanged()
    else h.notificationOccurred(kind)
  } catch {
    // старый клиент — не критично
  }
}

export function confirmDialog(message: string): Promise<boolean> {
  const app = tg()
  if (inTelegram() && app?.showConfirm) {
    try {
      return new Promise((resolve) => app.showConfirm!(message, resolve))
    } catch {
      // старый клиент — падаем на браузерный confirm
    }
  }
  return Promise.resolve(window.confirm(message))
}

/**
 * Пробрасывает themeParams Telegram в CSS-переменные документа.
 * Возвращает функцию отписки от события themeChanged.
 */
export function bindTheme(): () => void {
  const app = tg()

  const apply = () => {
    const root = document.documentElement
    const p = app?.themeParams ?? {}
    // Вне Telegram SDK всегда отдаёт colorScheme = 'light' — там слушаем систему.
    const scheme = inTelegram()
      ? (app?.colorScheme ?? 'light')
      : matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'

    root.dataset.scheme = scheme

    const map: Record<string, string | undefined> = {
      '--tg-bg': p.bg_color,
      '--tg-text': p.text_color,
      '--tg-hint': p.hint_color,
      '--tg-link': p.link_color,
      '--tg-accent': p.button_color,
      '--tg-accent-text': p.button_text_color,
      '--tg-surface': p.secondary_bg_color,
      '--tg-section': p.section_bg_color,
      '--tg-separator': p.section_separator_color,
      '--tg-destructive': p.destructive_text_color,
    }
    for (const [name, value] of Object.entries(map)) {
      if (value) root.style.setProperty(name, value)
      else root.style.removeProperty(name)
    }
  }

  apply()
  app?.onEvent('themeChanged', apply)

  const mq = matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', apply)

  return () => {
    app?.offEvent('themeChanged', apply)
    mq.removeEventListener('change', apply)
  }
}

/**
 * Разворачивает мини-ап на весь экран и гасит свайп-закрытие при скролле.
 * Каждый вызов — отдельно: на старых клиентах SDK бросает
 * WebAppMethodUnsupported, и один общий try/catch съел бы остальные.
 */
export function initViewport() {
  const app = tg()
  if (!inTelegram() || !app) return

  const attempt = (fn: () => void) => {
    try {
      fn()
    } catch {
      // метод не поддержан этой версией клиента — не критично
    }
  }

  attempt(() => app.ready())
  attempt(() => app.expand())
  attempt(() => app.disableVerticalSwipes?.())

  const bg = app.themeParams?.bg_color
  if (bg) {
    attempt(() => app.setHeaderColor?.(bg))
    attempt(() => app.setBackgroundColor?.(bg))
  }
}

/**
 * Показывает нативную кнопку «назад», пока смонтирован экран.
 * Вне Telegram — no-op, навигация идёт по табам.
 */
export function bindBackButton(onBack: (() => void) | null): () => void {
  const btn = inTelegram() ? tg()?.BackButton : undefined
  if (!btn) return () => {}
  try {
    if (!onBack) {
      btn.hide()
      return () => {}
    }
    btn.onClick(onBack)
    btn.show()
    return () => {
      try {
        btn.offClick(onBack)
        btn.hide()
      } catch {
        // клиент без BackButton — экранная кнопка «назад» остаётся рабочей
      }
    }
  } catch {
    return () => {}
  }
}

export function telegramUser() {
  return tg()?.initDataUnsafe?.user
}
