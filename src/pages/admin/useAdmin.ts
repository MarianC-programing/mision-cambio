import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../../lib/api'
import { useRoomPresence } from '../../lib/realtime'
import { supabase } from '../../lib/supabase'
import type { AdminQuestion, Snapshot, Variant } from '../../lib/types'

export function useAdmin(pin: string, onUnauthorized: () => void) {
  const [gameId, setGameId] = useState<string | null>(null)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [questions, setQuestions] = useState<AdminQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const online = useRoomPresence(snap?.game.code)
  const throttle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const handle = useCallback(
    (e: unknown) => {
      if (e instanceof api.ApiError && e.code === 'unauthorized') onUnauthorized()
      else setError(e instanceof Error ? e.message : 'Error inesperado')
    },
    [onUnauthorized],
  )

  const refresh = useCallback(async () => {
    if (!gameId) return
    try {
      setSnap(await api.adminSnapshot(pin, gameId))
    } catch (e) {
      handle(e)
    }
  }, [pin, gameId, handle])

  const reloadQuestions = useCallback(async () => {
    try {
      setQuestions(await api.adminQuestions(pin))
    } catch (e) {
      handle(e)
    }
  }, [pin, handle])

  useEffect(() => {
    void (async () => {
      try {
        const g = await api.adminLatestGame(pin)
        setGameId(g && g.status !== 'finished' ? g.id : (g?.id ?? null))
        await reloadQuestions()
      } catch (e) {
        handle(e)
      } finally {
        setLoading(false)
      }
    })()
  }, [pin, handle, reloadQuestions])

  useEffect(() => {
    if (!gameId) return
    void refresh()
    const soon = () => {
      if (throttle.current) return
      throttle.current = setTimeout(() => {
        throttle.current = undefined
        void refresh()
      }, 350)
    }
    const ch = supabase
      .channel(`admin-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` }, soon)
      .subscribe()
    const poll = setInterval(() => void refresh(), 2000)
    return () => {
      clearInterval(poll)
      if (throttle.current) clearTimeout(throttle.current)
      throttle.current = undefined
      void supabase.removeChannel(ch)
    }
  }, [gameId, refresh])

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true)
      setError('')
      try {
        await fn()
        await refresh()
      } catch (e) {
        handle(e)
      } finally {
        setBusy(false)
      }
    },
    [refresh, handle],
  )

  const id = gameId ?? ''
  return {
    snap,
    questions,
    loading,
    busy,
    error,
    clearError: () => setError(''),
    online,
    refresh,
    reloadQuestions,
    createGame: () =>
      run(async () => {
        const g = await api.adminCreateGame(pin)
        setSnap(null)
        setGameId(g.id)
      }),
    start: () => run(() => api.adminStart(pin, id)),
    pause: () => run(() => api.adminPause(pin, id)),
    resume: () => run(() => api.adminResume(pin, id)),
    reveal: () => run(() => api.adminReveal(pin, id)),
    next: () => run(() => api.adminNext(pin, id)),
    resolveBetrayal: (variant?: Variant) => run(() => api.adminResolveBetrayal(pin, id, variant)),
    resolveVariant: () => run(() => api.adminResolveVariant(pin, id)),
    startTrial: () => run(() => api.adminStartTrial(pin, id)),
    resolveTrial: () => run(() => api.adminResolveTrial(pin, id)),
    finish: () => run(() => api.adminFinish(pin, id)),
    removePlayer: (playerId: string) => run(() => api.adminRemovePlayer(pin, playerId)),
    saveQuestion: async (q: AdminQuestion) => {
      setError('')
      try {
        await api.adminSaveQuestion(pin, q)
        await reloadQuestions()
        return true
      } catch (e) {
        handle(e)
        return false
      }
    },
    formGroups: () => run(() => api.adminFormGroups(pin, id)),
    eliminateMember: (groupId: string, qPos: number) => run(() => api.eliminateRandomMember(pin, groupId, qPos)),
    awardKey: (groupId: string, qPos: number) => run(() => api.awardGroupKey(pin, groupId, qPos)),
  }
}

export type Admin = ReturnType<typeof useAdmin>

export const STATUS_LABEL = {
  lobby: 'En sala',
  question: 'Puerta abierta',
  paused: 'Pausada',
  reveal: 'Respuesta mostrada',
  betrayal: 'Votación de traición',
  betrayal_reveal: 'Traición resuelta',
  variant: 'Variante de la traición',
  variant_reveal: 'Variante resuelta',
  trial: 'Ronda difícil',
  trial_reveal: 'Pregunta difícil resuelta',
  finished: 'Finalizada',
} as const
