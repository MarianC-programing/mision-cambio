import { motion } from 'framer-motion'
import { Crown } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { Player } from '../lib/types'

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

export function Podium({ players }: { players: Player[] }) {
  const top = players.slice(0, 3)
  const slots = [
    { p: top[1], h: 'h-28', bg: 'bg-pale', rank: 2 },
    { p: top[0], h: 'h-40', bg: 'bg-lime', rank: 1 },
    { p: top[2], h: 'h-20', bg: 'bg-orange text-white', rank: 3 },
  ]
  return (
    <div className="flex items-end justify-center gap-3">
      {slots.map(({ p, h, bg, rank }) => (
        <div key={rank} className="flex w-1/3 max-w-44 flex-col items-center">
          {p ? (
            <>
              {rank === 1 && <Crown className="mb-1 h-6 w-6 text-yellow" fill="currentColor" />}
              <p className="mb-2 w-full truncate text-center text-sm font-bold">{p.name}</p>
            </>
          ) : (
            <p className="mb-2 text-sm text-ink/30">—</p>
          )}
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            className={`${h} ${bg} flex w-full flex-col items-center justify-start rounded-t-3xl pt-3`}
          >
            <span className="display text-4xl">{rank}</span>
            <span className="label mt-1 opacity-70">{p ? `${p.score} pts` : ''}</span>
          </motion.div>
        </div>
      ))}
    </div>
  )
}

export function Leaderboard({ players, meId, limit }: { players: Player[]; meId?: string; limit?: number }) {
  const rows = limit ? players.slice(0, limit) : players
  return (
    <ol className="divide-y divide-line">
      {rows.map((p, i) => (
        <li key={p.id} className={`flex items-center gap-3 px-4 py-3 ${p.id === meId ? 'bg-lime/40' : ''}`}>
          <span className="display w-7 text-xl text-ink/40">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate font-semibold">
            {p.name}
            {p.id === meId && <span className="label ml-2 text-ink/50">tú</span>}
          </span>
          <span className="label text-ink/50">{p.correct_count} ✓</span>
          <span className="display w-16 text-right text-xl tabular-nums">{p.score}</span>
        </li>
      ))}
      {rows.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink/50">Aún no hay participantes.</li>}
    </ol>
  )
}

export function Headline({ bold, accent, className = '' }: { bold: string; accent: string; className?: string }) {
  return (
    <h1 className={`display ${className}`}>
      {bold} <span className="serif-i font-normal">{accent}</span>
    </h1>
  )
}
