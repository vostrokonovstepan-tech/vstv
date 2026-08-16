import type { ReactNode } from 'react'

type Props = {
  /** 0…1 */
  value: number
  size?: number
  stroke?: number
  color?: string
  trackOpacity?: number
  children?: ReactNode
}

/** Кольцо прогресса. Дуга растёт по часовой стрелке от 12 часов. */
export function Ring({
  value,
  size = 72,
  stroke = 7,
  color = 'var(--color-accent)',
  trackOpacity = 0.16,
  children,
}: Props) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(1, value))

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeOpacity={trackOpacity}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          style={{ transition: 'stroke-dashoffset 420ms cubic-bezier(0.32, 0.72, 0, 1)' }}
        />
      </svg>
      {children != null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
      )}
    </div>
  )
}
