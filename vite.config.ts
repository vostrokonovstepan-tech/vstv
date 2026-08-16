import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // На GitHub Pages сайт лежит не в корне, а в /<имя-репозитория>/.
  // Путь подставляет CI, локально и на других хостингах остаётся корень.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    // Telegram открывает мини-ап через туннель (cloudflared/ngrok) — разрешаем любой хост
    allowedHosts: true,
  },
})
