import { haptic } from '../lib/telegram'

export type Tab = 'today' | 'goals' | 'progress'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Сегодня', icon: 'M9 11.5 11.5 14 16 8.5M4.5 6.5A2 2 0 0 1 6.5 4.5h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-11Z' },
  { id: 'goals', label: 'Цели', icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0-3.3a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z' },
  { id: 'progress', label: 'Прогресс', icon: 'M5 19V11M12 19V5M19 19v-5' },
]

export function TabBar({ value, onChange }: { value: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-md safe-bottom">
        {TABS.map((tab) => {
          const active = tab.id === value
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (!active) haptic('select')
                onChange(tab.id)
              }}
              className="flex flex-1 flex-col items-center gap-1 pt-2.5 pb-2"
              style={{ color: active ? 'var(--color-accent)' : 'var(--color-hint)' }}
            >
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d={tab.icon} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[11px] font-medium">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
