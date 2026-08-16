import type { ReactNode } from 'react'

/** Общая обёртка экрана: ширина, отступы и место под таб-бар с плашкой таймера. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-full w-full max-w-md px-4 pt-4 pb-40">
      <div className="space-y-4">{children}</div>
    </div>
  )
}

export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="px-1 pt-1 pb-1">
      {subtitle && <p className="text-[13px] text-hint first-letter:uppercase">{subtitle}</p>}
      <h1 className="text-[28px] leading-tight font-bold">{title}</h1>
    </header>
  )
}
