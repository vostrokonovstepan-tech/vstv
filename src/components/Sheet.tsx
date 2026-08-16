import { useEffect, type ReactNode } from 'react'
import { bindBackButton } from '../lib/telegram'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

/** Модалка снизу. Пока открыта — перехватывает нативную кнопку «назад». */
export function Sheet({ open, title, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return
    const unbind = bindBackButton(onClose)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // фон не должен скроллиться под открытой шторкой
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      unbind()
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-black/40"
      />
      <div className="animate-sheet-in relative max-h-[88%] overflow-y-auto rounded-t-3xl bg-card px-5 pt-3 pb-8">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-hint/30" />
        <h2 className="mb-5 text-center text-[17px] font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  )
}
