import { useEffect, useState } from 'react'
import { tg } from './telegram'

/** Версия запущенного кода. 'dev' — локальная сборка, проверка обновлений там не нужна. */
export const BUILD = __BUILD__

/**
 * Возвращает версию, которая вышла позже запущенной, или null.
 * Проверяет при запуске и каждый раз, когда приложение снова становится активным.
 */
export function useUpdateAvailable(): string | null {
  const [latest, setLatest] = useState<string | null>(null)

  useEffect(() => {
    if (BUILD === 'dev') return
    let alive = true

    const check = async () => {
      try {
        // no-store и метка в адресе: обходим кеш страницы и WebView, иначе увидим ту же старую версию.
        const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, {
          cache: 'no-store',
        })
        if (!res.ok) return
        const { build } = (await res.json()) as { build?: unknown }
        if (alive && typeof build === 'string' && build !== 'dev' && build !== BUILD) setLatest(build)
      } catch {
        // нет сети — проверим при следующем возвращении в приложение
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }

    void check()
    document.addEventListener('visibilitychange', onVisible)
    tg()?.onEvent('activated', check)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
      tg()?.offEvent('activated', check)
    }
  }, [])

  return latest
}

/**
 * Перезагружает страницу на новую версию. Другой адрес заставляет забыть закешированный
 * index.html; хеш с параметрами запуска Telegram сохраняем — без него SDK не увидит пользователя.
 */
export function reloadToLatest(build: string) {
  location.replace(`${location.pathname}?v=${build}${location.hash}`)
}
