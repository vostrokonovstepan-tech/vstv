import { useCallback, useEffect, useState } from 'react'
import { StoreProvider, useStore } from './store'
import { TabBar, type Tab } from './components/TabBar'
import { TimerBar } from './components/TimerBar'
import { Today } from './screens/Today'
import { Schedule } from './screens/Schedule'
import { Goals } from './screens/Goals'
import { GoalDetail } from './screens/GoalDetail'
import { Assistant } from './screens/Assistant'
import { Profile } from './screens/Profile'
import { Notes } from './screens/Notes'
import { Button } from './components/ui'
import { bindTheme, initViewport } from './lib/telegram'
import { reloadToLatest, useUpdateAvailable } from './lib/useUpdateCheck'

export default function App() {
  useEffect(() => {
    initViewport()
    return bindTheme()
  }, [])

  return (
    <StoreProvider>
      <Router />
    </StoreProvider>
  )
}

function Router() {
  const { ready, loadError, retryLoad, error, dismissError } = useStore()
  const update = useUpdateAvailable()
  const [tab, setTab] = useState<Tab>('today')
  const [openGoalId, setOpenGoalId] = useState<string | null>(null)

  const closeGoal = useCallback(() => setOpenGoalId(null), [])

  const changeTab = useCallback((next: Tab) => {
    setOpenGoalId(null)
    setTab(next)
  }, [])

  if (!ready && loadError) {
    return (
      <div className="grid min-h-full place-items-center px-8">
        <div className="max-w-xs space-y-4 text-center">
          <div className="text-5xl">☁️</div>
          <h1 className="text-[18px] font-semibold">Не удалось загрузить данные</h1>
          <p className="text-[14px] leading-snug text-hint">
            Твои записи в безопасности: пока данные не загружены, приложение ничего не записывает и
            ничего не затрёт. {loadError}
          </p>
          <Button onClick={retryLoad}>Повторить</Button>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="grid min-h-full place-items-center">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    )
  }

  return (
    <>
      {!error && update && (
        <div className="fixed inset-x-0 top-0 z-50 animate-fade-in px-4 pt-3">
          <button
            type="button"
            onClick={() => reloadToLatest(update)}
            className="mx-auto flex w-full max-w-md items-center gap-2 rounded-2xl bg-accent px-4 py-3 text-left text-[13px] text-accent-ink shadow-lg"
          >
            <span className="flex-1">Вышла новая версия — нажми, чтобы обновить</span>
            <span className="text-[16px]">↻</span>
          </button>
        </div>
      )}

      {error && (
        <div className="fixed inset-x-0 top-0 z-50 animate-fade-in px-4 pt-3">
          <button
            type="button"
            onClick={dismissError}
            className="mx-auto flex w-full max-w-md items-center gap-2 rounded-2xl bg-danger px-4 py-3 text-left text-[13px] text-white shadow-lg"
          >
            <span className="flex-1">{error}</span>
            <span className="opacity-70">✕</span>
          </button>
        </div>
      )}

      {openGoalId ? (
        <GoalDetail goalId={openGoalId} onBack={closeGoal} />
      ) : tab === 'today' ? (
        <Today />
      ) : tab === 'schedule' ? (
        <Schedule />
      ) : tab === 'goals' ? (
        <Goals onOpen={setOpenGoalId} />
      ) : tab === 'assistant' ? (
        <Assistant />
      ) : tab === 'notes' ? (
        <Notes />
      ) : (
        <Profile />
      )}

      <TimerBar />
      <TabBar value={tab} onChange={changeTab} />
    </>
  )
}
