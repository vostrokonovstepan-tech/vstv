import { useCallback, useEffect, useState } from 'react'
import { StoreProvider, useStore } from './store'
import { TabBar, type Tab } from './components/TabBar'
import { TimerBar } from './components/TimerBar'
import { Today } from './screens/Today'
import { Goals } from './screens/Goals'
import { GoalDetail } from './screens/GoalDetail'
import { Assistant } from './screens/Assistant'
import { Profile } from './screens/Profile'
import { bindTheme, initViewport } from './lib/telegram'

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
  const { ready, error, dismissError } = useStore()
  const [tab, setTab] = useState<Tab>('today')
  const [openGoalId, setOpenGoalId] = useState<string | null>(null)

  const closeGoal = useCallback(() => setOpenGoalId(null), [])

  const changeTab = useCallback((next: Tab) => {
    setOpenGoalId(null)
    setTab(next)
  }, [])

  if (!ready) {
    return (
      <div className="grid min-h-full place-items-center">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    )
  }

  return (
    <>
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
      ) : tab === 'goals' ? (
        <Goals onOpen={setOpenGoalId} />
      ) : tab === 'assistant' ? (
        <Assistant />
      ) : (
        <Profile />
      )}

      <TimerBar />
      <TabBar value={tab} onChange={changeTab} />
    </>
  )
}
