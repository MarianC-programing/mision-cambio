import { useEffect, useState } from 'react'
import { serverTime } from './api'
import type { Player, Session } from './types'

/** Diferencia (ms) entre el reloj del servidor y el del dispositivo. */
export function useServerOffset(): number {
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    let alive = true
    const sync = async () => {
      let best: { rtt: number; off: number } | null = null
      for (let i = 0; i < 3; i++) {
        try {
          const t0 = Date.now()
          const s = Date.parse(await serverTime())
          const t1 = Date.now()
          const rtt = t1 - t0
          if (!best || rtt < best.rtt) best = { rtt, off: s - (t0 + t1) / 2 }
        } catch {
          /* se reintenta en el próximo ciclo */
        }
      }
      if (alive && best) setOffset(best.off)
    }
    void sync()
    const id = setInterval(sync, 60_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])
  return offset
}

/** Milisegundos restantes. Si `endsAt` es null devuelve `frozenMs` (pausa) o 0. */
export function useCountdown(endsAt: string | null, offset: number, frozenMs: number | null): number {
  const calc = () => (endsAt ? Math.max(0, Date.parse(endsAt) - (Date.now() + offset)) : (frozenMs ?? 0))
  const [ms, setMs] = useState(calc)
  useEffect(() => {
    setMs(calc())
    if (!endsAt) return
    const id = setInterval(() => setMs(calc()), 100)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt, offset, frozenMs])
  return ms
}

export const seconds = (ms: number) => Math.ceil(ms / 1000)

export function sortPlayers(players: Player[]): Player[] {
  return [...players].sort(
    (a, b) => b.score - a.score || a.total_time_ms - b.total_time_ms || a.created_at.localeCompare(b.created_at),
  )
}

const KEY = 'mision-cambio-session'
export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}
export function saveSession(s: Session) {
  localStorage.setItem(KEY, JSON.stringify(s))
}
export function clearSession() {
  localStorage.removeItem(KEY)
}
