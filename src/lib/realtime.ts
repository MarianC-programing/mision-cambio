import { useEffect, useState } from 'react'
import { fetchGame, fetchPlayers } from './api'
import { supabase } from './supabase'
import type { Game, Player } from './types'

/** Estado de la partida + jugadores: Realtime con sondeo de respaldo (móviles inestables). */
export function useGameFeed(gameId: string | undefined) {
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [gone, setGone] = useState(false)

  useEffect(() => {
    if (!gameId) return
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const apply = (g: Game) => setGame((cur) => (cur && cur.updated_at > g.updated_at ? cur : g))
    const loadPlayers = async () => {
      const p = await fetchPlayers(gameId)
      if (alive) setPlayers(p)
    }
    const loadGame = async () => {
      const g = await fetchGame(gameId)
      if (!alive) return
      if (g) apply(g)
      else setGone(true)
    }
    const refresh = () => {
      void loadGame()
      void loadPlayers()
    }
    const schedule = () => {
      if (timer) return
      timer = setTimeout(() => {
        timer = undefined
        void loadPlayers()
      }, 400)
    }

    refresh()
    const ch = supabase
      .channel(`feed-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, (p) => {
        if (p.new && 'id' in p.new) apply(p.new as Game)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` }, schedule)
      .subscribe()
    const poll = setInterval(refresh, 4000)
    const onVis = () => {
      if (!document.hidden) refresh()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      clearInterval(poll)
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVis)
      void supabase.removeChannel(ch)
    }
  }, [gameId])

  return { game, players, gone }
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
