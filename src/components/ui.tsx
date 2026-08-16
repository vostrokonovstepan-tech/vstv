import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { haptic } from '../lib/telegram'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger'
  accent?: string
}

export function Button({
  variant = 'primary',
  accent,
  className = '',
  onClick,
  ...rest
}: ButtonProps) {
  const base =
    'press w-full rounded-2xl px-4 py-3.5 text-[16px] font-semibold disabled:opacity-40 disabled:pointer-events-none'
  const styles: Record<string, string> = {
    primary: 'text-accent-ink',
    ghost: 'bg-surface text-ink',
    danger: 'bg-transparent text-danger',
  }

  return (
    <button
      {...rest}
      onClick={(e) => {
        haptic('tap')
        onClick?.(e)
      }}
      className={`${base} ${styles[variant]} ${className}`}
      style={
        variant === 'primary'
          ? { background: accent ?? 'var(--color-accent)', ...rest.style }
          : rest.style
      }
    />
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block px-1 text-[13px] font-medium text-hint">{label}</span>
      {children}
    </label>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-2xl bg-surface px-4 py-3.5 text-[16px] outline-none placeholder:text-hint focus:ring-2 focus:ring-accent/40 ${props.className ?? ''}`}
    />
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-end justify-between px-1">
      <h2 className="text-[13px] font-semibold tracking-wide text-hint uppercase">{children}</h2>
      {action}
    </div>
  )
}

export function EmptyState({
  emoji,
  title,
  hint,
  action,
}: {
  emoji: string
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-8 py-12 text-center">
      <div className="mb-3 text-5xl">{emoji}</div>
      <div className="text-[17px] font-semibold">{title}</div>
      {hint && <p className="mt-1.5 text-[14px] leading-snug text-hint">{hint}</p>}
      {action && <div className="mt-5 w-full max-w-xs">{action}</div>}
    </div>
  )
}
