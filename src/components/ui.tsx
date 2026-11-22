import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { PixelIcon } from './pixel'

/** 'blue' e 'ink' se conservan como alias del primario (blanco) para no tocar el resto de pantallas. */
type Variant = 'white' | 'blue' | 'ink' | 'quiet' | 'outline' | 'lime' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  white: 'bg-white text-black hover:bg-white/85',
  blue: 'bg-white text-black hover:bg-white/85',
  ink: 'bg-white text-black hover:bg-white/85',
  quiet: 'border border-line bg-pale text-ink/70 hover:border-white/30 hover:text-ink',
  outline: 'border border-white/30 bg-transparent text-ink hover:bg-white/10',
  lime: 'bg-lime text-black hover:brightness-95',
  danger: 'bg-pink text-black hover:brightness-95',
}
const SIZES: Record<Size, string> = {
  sm: 'min-h-9 px-4 py-2 text-[10px]',
  md: 'min-h-12 px-6 py-3 text-xs',
  lg: 'min-h-14 px-7 py-4 text-xs sm:text-[13px]',
}

/** Clases de un botón pill. Útil para <Link> y <a>. */
export function btn(variant: Variant = 'white', size: Size = 'md', extra = '') {
  return `pixel inline-flex items-center justify-center gap-2.5 rounded-full text-center leading-snug tracking-[0.08em] transition
    hover:-translate-y-px active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0
    ${SIZES[size]} ${VARIANTS[variant]} ${extra}`
}

export function Button({
  variant = 'white',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button {...props} className={btn(variant, size, className)} />
}

export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`label text-ink/55 ${className}`}>{children}</span>
}

type Tone = 'pale' | 'blue' | 'lime' | 'orange' | 'pink' | 'purple'
const TONES: Record<Tone, string> = {
  pale: 'border-line text-ink/70',
  blue: 'border-lime text-lime',
  lime: 'border-lime bg-lime text-black',
  orange: 'border-orange/50 bg-orange/10 text-orange',
  pink: 'border-pink/50 bg-pink/10 text-pink',
  purple: 'border-purple/60 bg-purple/15 text-[#c4a1ff]',
}

/** Insignia pequeña con contorno. */
export function Badge({ children, tone = 'pale' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`label inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[9px] ${TONES[tone]}`}>
      {children}
    </span>
  )
}

export function Spinner() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-current/25 border-t-current" />
}

export function TimerRing({ ms, totalMs, size = 96, paused = false }: { ms: number; totalMs: number; size?: number; paused?: boolean }) {
  const r = size / 2 - 7
  const c = 2 * Math.PI * r
  const frac = Math.max(0, Math.min(1, ms / totalMs))
  const secs = Math.ceil(ms / 1000)
  const color = paused ? '#9aa0a6' : secs <= 5 ? '#ff3d86' : secs <= 10 ? '#ff6b16' : '#d7f36a'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="7" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="butt"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: 'stroke 0.3s' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        {paused ? (
          <PixelIcon name="pause" className={size >= 120 ? 'h-12 w-12' : size >= 90 ? 'h-9 w-9' : 'h-6 w-6'} />
        ) : (
          <span className="pixel tabular-nums" style={{ fontSize: Math.max(12, size * 0.3), color }}>
            {secs}
          </span>
        )}
      </div>
    </div>
  )
}

export function Headline({ bold, accent, className = '' }: { bold: string; accent: string; className?: string }) {
  return (
    <h1 className={`pixel ${className}`}>
      {bold} <span className="text-ink/45">{accent}</span>
    </h1>
  )
}
