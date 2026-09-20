import { haptic } from '../lib/telegram'

export type Tab = 'today' | 'schedule' | 'goals' | 'assistant' | 'progress' | 'notes'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Сегодня', icon: 'M9 11.5 11.5 14 16 8.5M4.5 6.5A2 2 0 0 1 6.5 4.5h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-11Z' },
  { id: 'schedule', label: 'План', icon: 'M8 3v3M16 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z' },
  { id: 'goals', label: 'Цели', icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0-3.3a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z' },
  { id: 'assistant', label: 'Помощник', icon: 'm12 4 1.8 4.7L18.5 10l-4.7 1.8L12 16.5l-1.8-4.7L5.5 10l4.7-1.3L12 4Zm6 8.5.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9.9-2.3Z' },
  { id: 'progress', label: 'Прогресс', icon: 'M5 19V11M12 19V5M19 19v-5' },
  { id: 'notes', label: 'Заметки', icon: 'M7 4h8l4 4v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm7 0v4h4M9 12h6M9 16h6' },
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
