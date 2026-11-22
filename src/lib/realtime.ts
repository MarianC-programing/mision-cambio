import { useEffect, useState } from 'react'
import { fetchGame } from './api'
import { supabase } from './supabase'
import type { Game } from './types'

/** Estado de la partida: Realtime con sondeo de respaldo (los móviles pierden conexión con facilidad). */
export function useGame(gameId: string | undefined) {
  const [game, setGame] = useState<Game | null>(null)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    if (!gameId) return
    let alive = true
    // Nunca retrocedemos a una versión más vieja de la partida.
    const apply = (g: Game) => setGame((cur) => (cur && cur.updated_at > g.updated_at ? cur : g))
    const load = async () => {
      const g = await fetchGame(gameId)
      if (!alive) return
      if (g) apply(g)
      else setGone(true)
    }
    void load()
    const ch = supabase
      .channel(`game-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, (p) => {
        if (alive && p.new && 'id' in p.new) apply(p.new as Game)
      })
      .subscribe()
    const poll = setInterval(() => void load(), 3000)
    const onVis = () => {
      if (!document.hidden) void load()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVis)
      void supabase.removeChannel(ch)
    }
  }, [gameId])

  return { game, gone }
}

/** El participante anuncia que está conectado (Realtime Presence, sin escribir en la base). */
export function usePresenceTrack(code: string | undefined, playerId: string | undefined, name: string | undefined) {
  useEffect(() => {
    if (!code || !playerId) return
    const ch = supabase.channel(`room:${code}`, { config: { presence: { key: playerId } } })
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') void ch.track({ name, at: Date.now() })
    })
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [code, playerId, name])
}

/** El administrador lee quién está conectado. */
export function useRoomPresence(code: string | undefined): Set<string> {
  const [online, setOnline] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!code) return
    const ch = supabase.channel(`room:${code}`)
    ch.on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(ch.presenceState())))).subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [code])
  return online
}
