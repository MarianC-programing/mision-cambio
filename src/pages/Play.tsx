import { AnimatePresence, motion } from 'framer-motion'
import { Check, LogOut, Pause, Trophy, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Badge, Button, Label, Leaderboard, Podium, TimerRing } from '../components/ui'
import { myAnswers, submitAnswer } from '../lib/api'
import { clearSession, loadSession, sortPlayers, useCountdown, useServerOffset } from '../lib/clock'
import { useGameFeed, usePresenceTrack } from '../lib/realtime'
import type { Game, MyAnswer, Player, Session } from '../lib/types'

const CHIP = ['bg-blue', 'bg-purple', 'bg-orange', 'bg-pink']
const LETTERS = ['A', 'B', 'C', 'D']

export default function Play() {
  const session = useMemo(loadSession, [])
  if (!session) return <Navigate to="/" replace />
  return <PlayInner session={session} />
}

function PlayInner({ session }: { session: Session }) {
  const nav = useNavigate()
  const { game, players, gone } = useGameFeed(session.gameId)
  usePresenceTrack(session.code, session.playerId, session.name)
  const ranked = useMemo(() => sortPlayers(players), [players])
  const me = ranked.find((p) => p.id === session.playerId)
  const stillIn = players.length === 0 || Boolean(me)

  const leave = useCallback(() => {
    clearSession()
    nav('/', { replace: true })
  }, [nav])

  useEffect(() => {
    if (gone || (game && players.length > 0 && !me)) leave() // partida borrada o jugador expulsado
  }, [gone, game, players.length, me, leave])

  if (!game || !stillIn) return <Screen><p className="m-auto text-ink/50">Conectando…</p></Screen>

  return (
    <Screen code={session.code} onLeave={leave}>
      {game.status === 'lobby' && <Lobby session={session} players={ranked} />}
      {(game.status === 'question' || game.status === 'paused' || game.status === 'reveal') && (
        <Round game={game} session={session} ranked={ranked} me={me} />
      )}
      {game.status === 'finished' && <Final ranked={ranked} me={me} />}
    </Screen>
  )
}

function Screen({ children, code, onLeave }: { children: React.ReactNode; code?: string; onLeave?: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-5 safe-b">
      {code && (
        <header className="mb-5 flex items-center justify-between">
          <Badge>Código {code}</Badge>
          <button onClick={onLeave} className="grid h-9 w-9 place-items-center rounded-full bg-pale text-ink/60" aria-label="Salir">
            <LogOut className="h-4 w-4" />
          </button>
        </header>
      )}
      {children}
    </main>
  )
}

function Lobby({ session, players }: { session: Session; players: Player[] }) {
  return (
    <div className="flex flex-1 flex-col">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-10">
        <Label>Estás dentro</Label>
        <h1 className="display mt-3 text-6xl">
          Hola,
          <br />
          <span className="serif-i text-blue">{session.name}.</span>
        </h1>
        <p className="mt-4 text-ink/60">Esperando a que el administrador inicie la partida…</p>
      </motion.div>
      <div className="card mt-8 p-5">
        <div className="mb-3 flex items-center justify-between">
          <Label>En la sala</Label>
          <Badge tone="lime">{players.length}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {players.map((p) => (
            <span key={p.id} className="rounded-full bg-pale px-3 py-1.5 text-sm font-semibold">
              {p.name}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-auto flex justify-center gap-1.5 pt-10">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-2.5 w-2.5 rounded-full bg-blue"
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
          />
        ))}
      </div>
    </div>
  )
}

function Round({ game, session, ranked, me }: { game: Game; session: Session; ranked: Player[]; me?: Player }) {
  const offset = useServerOffset()
  const q = game.current_question
  const [mine, setMine] = useState<MyAnswer[]>([])
  const [pending, setPending] = useState<number | null>(null)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    try {
      setMine(await myAnswers(session))
    } catch {
      /* se reintenta con el siguiente cambio de estado */
    }
  }, [session])

  useEffect(() => {
    setPending(null)
    setError('')
    void reload()
  }, [game.q_index, game.status, reload])

  const live = game.status === 'question'
  const remaining = useCountdown(live ? game.ends_at : null, offset, game.status === 'paused' ? game.paused_remaining_ms : null)
  const answer = mine.find((a) => a.question_pos === game.q_index)
  const chosen = answer?.choice ?? pending
  const timeUp = live && remaining === 0
  const canAnswer = live && !timeUp && chosen === null

  const choose = async (i: number) => {
    if (!canAnswer) return
    setPending(i)
    setError('')
    try {
      await submitAnswer(session, game.q_index, i)
      void reload()
    } catch (e) {
      setPending(null)
      setError(e instanceof Error ? e.message : 'No se pudo enviar.')
      void reload()
    }
  }

  if (!q) return null
  const revealed = game.status === 'reveal' ? game.reveal : null
  const rank = me ? ranked.findIndex((p) => p.id === me.id) + 1 : 0

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between">
        <div>
          <Label>
            Pregunta {game.q_index + 1} de {game.q_total}
          </Label>
          <div className="mt-2">
            <Badge tone="purple">{q.model}</Badge>
          </div>
        </div>
        {game.status !== 'reveal' && (
          <TimerRing ms={remaining} totalMs={game.duration_ms} paused={game.status === 'paused'} />
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.h2
          key={q.index}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="display mt-6 text-[28px] leading-[1.05] tracking-tight"
        >
          {q.prompt}
        </motion.h2>
      </AnimatePresence>

      <div className="mt-6 space-y-3">
        {q.options.map((text, i) => {
          const isCorrect = revealed?.correct_index === i
          const isMine = chosen === i
          let tone = 'bg-white border-line'
          if (revealed) tone = isCorrect ? 'bg-lime border-lime' : isMine ? 'bg-pink/15 border-pink' : 'bg-white border-line opacity-60'
          else if (isMine) tone = 'bg-blue/10 border-blue'
          return (
            <motion.button
              key={i}
              whileTap={canAnswer ? { scale: 0.98 } : undefined}
              onClick={() => void choose(i)}
              disabled={!canAnswer}
              className={`flex w-full items-center gap-3 rounded-3xl border-2 p-4 text-left transition disabled:cursor-default ${tone}`}
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl font-mono text-sm font-bold text-white ${CHIP[i]}`}>
                {LETTERS[i]}
              </span>
              <span className="flex-1 text-[15px] font-semibold leading-snug">{text}</span>
              {revealed && isCorrect && <Check className="h-5 w-5" />}
              {revealed && isMine && !isCorrect && <X className="h-5 w-5 text-pink" />}
              {!revealed && isMine && <Check className="h-5 w-5 text-blue" />}
            </motion.button>
          )
        })}
      </div>

      <div className="mt-5 min-h-24">
        {error && <p className="rounded-2xl bg-pink/10 px-4 py-3 text-sm font-medium text-pink">{error}</p>}
        {game.status === 'paused' && (
          <div className="flex items-center gap-2 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white">
            <Pause className="h-4 w-4" /> Partida en pausa
          </div>
        )}
        {live && chosen !== null && (
          <p className="rounded-2xl bg-pale px-4 py-3 text-sm font-semibold">✓ Respuesta enviada. Esperando el resultado…</p>
        )}
        {timeUp && chosen === null && (
          <p className="rounded-2xl bg-orange/15 px-4 py-3 text-sm font-semibold text-orange">Se acabó el tiempo.</p>
        )}
        {revealed && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div
              className={`flex items-center justify-between rounded-3xl px-5 py-4 ${
                answer?.is_correct ? 'bg-lime' : 'bg-pale'
              }`}
            >
              <div>
                <p className="display text-2xl">
                  {answer?.is_correct ? '¡Correcto!' : answer ? 'Esta vez no.' : 'Sin respuesta'}
                </p>
                <Label>Vas #{rank || '—'} · {me?.score ?? 0} pts</Label>
              </div>
              <span className="display text-4xl tabular-nums">+{answer?.points ?? 0}</span>
            </div>
            {revealed.explanation && <p className="px-1 text-sm leading-relaxed text-ink/70">{revealed.explanation}</p>}
          </motion.div>
        )}
      </div>
    </div>
  )
}

function Final({ ranked, me }: { ranked: Player[]; me?: Player }) {
  const rank = me ? ranked.findIndex((p) => p.id === me.id) + 1 : 0
  return (
    <div className="flex flex-1 flex-col">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 text-center">
        <Trophy className="mx-auto h-8 w-8 text-orange" />
        <Label className="mt-3 block">Misión cumplida</Label>
        <h1 className="display mt-2 text-6xl">
          Puesto <span className="serif-i text-blue">#{rank || '—'}</span>
        </h1>
        <p className="mt-2 text-ink/60">
          {me?.score ?? 0} puntos · {me?.correct_count ?? 0} aciertos
        </p>
      </motion.div>
      <div className="mt-8">
        <Podium players={ranked} />
      </div>
      <div className="card mt-6 overflow-hidden">
        <Leaderboard players={ranked} meId={me?.id} limit={10} />
      </div>
      <Button variant="quiet" className="mt-6" onClick={() => { clearSession(); window.location.assign('/') }}>
        Salir
      </Button>
    </div>
  )
}
