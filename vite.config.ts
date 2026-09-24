import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Короткий хеш коммита из CI; локально — 'dev', и проверка обновлений отключена. */
const BUILD = (process.env.GITHUB_SHA ?? 'dev').slice(0, 7)

/**
 * Кладёт version.json рядом со сборкой: приложение сверяет с ним свою версию.
 * Telegram держит свёрнутые мини-аппы живыми, и без такой проверки телефон может
 * неделями работать на старой странице, не подозревая о выпущенных исправлениях.
 */
function versionFile(): Plugin {
  return {
    name: 'version-file',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) })
    },
  }
}

export default defineConfig({
  // На GitHub Pages сайт лежит не в корне, а в /<имя-репозитория>/.
  // Путь подставляет CI, локально и на других хостингах остаётся корень.
  base: process.env.BASE_PATH ?? '/',
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [react(), tailwindcss(), versionFile()],
  server: {
    host: true,
    // Telegram открывает мини-ап через туннель (cloudflared/ngrok) — разрешаем любой хост
    allowedHosts: true,
  },
})
