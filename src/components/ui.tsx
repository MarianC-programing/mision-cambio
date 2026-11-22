import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'blue' | 'ink' | 'quiet' | 'lime' | 'danger'
const VARIANTS: Record<Variant, string> = {
  blue: 'bg-blue text-white hover:bg-[#2748d6]',
  ink: 'bg-ink text-white hover:bg-black/80',
  quiet: 'bg-pale text-ink hover:bg-[#e4e1db]',
  lime: 'bg-lime text-ink hover:brightness-95',
  danger: 'bg-pink text-white hover:brightness-95',
}

export function Button({
  variant = 'blue',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-9 px-4 text-sm', md: 'h-12 px-6 text-[15px]', lg: 'h-14 px-8 text-base' }
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-tight transition
        hover:-translate-y-px active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0
        ${sizes[size]} ${VARIANTS[variant]} ${className}`}
    />
  )
}

export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`label text-ink/55 ${className}`}>{children}</span>
}

export function Badge({ children, tone = 'pale' }: { children: ReactNode; tone?: 'pale' | 'blue' | 'lime' | 'orange' | 'pink' | 'purple' }) {
  const tones = {
    pale: 'bg-pale text-ink',
    blue: 'bg-blue text-white',
    lime: 'bg-lime text-ink',
    orange: 'bg-orange text-white',
    pink: 'bg-pink text-white',
    purple: 'bg-purple text-white',
  }
  return <span className={`label inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ${tones[tone]}`}>{children}</span>
}

export function Spinner() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
}

export function TimerRing({ ms, totalMs, size = 96, paused = false }: { ms: number; totalMs: number; size?: number; paused?: boolean }) {
  const r = size / 2 - 7
  const c = 2 * Math.PI * r
  const frac = Math.max(0, Math.min(1, ms / totalMs))
  const secs = Math.ceil(ms / 1000)
  const color = paused ? '#111111' : secs <= 5 ? '#f72585' : secs <= 10 ? '#ff6b16' : '#3158f5'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eeece8" strokeWidth="7" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: 'stroke 0.3s' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="display tabular-nums" style={{ fontSize: size * 0.36, color }}>
          {paused ? '⏸' : secs}
        </span>
      </div>
    </div>
  )
}

export function Headline({ bold, accent, className = '' }: { bold: string; accent: string; className?: string }) {
  return (
    <h1 className={`display ${className}`}>
      {bold} <span className="serif-i font-normal">{accent}</span>
    </h1>
  )
}
