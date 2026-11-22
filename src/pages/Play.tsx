import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  Handshake,
  Key,
  LogOut,
  Pause,
  ShieldAlert,
  Skull,
  Swords,
  Trophy,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Badge, Button, Label, TimerRing } from '../components/ui'
import { ApiError, myGroupState, submitGroupAnswer, submitVote } from '../lib/api'
import { clearSession, loadSession, useCountdown, useServerOffset } from '../lib/clock'
import { useGame, usePresenceTrack } from '../lib/realtime'
import { dramatize, isTimed, phaseTotalMs, survivors, teamHex, teamName } from '../lib/teams'
import type { Game, Group, GroupMember, GroupState, Session, Vote } from '../lib/types'

const LETTERS = ['A', 'B', 'C', 'D']
const LETTER_BG = ['bg-pink', 'bg-purple', 'bg-blue', 'bg-orange']

interface Ctx {
  session: Session
  game: Game
  gs: GroupState
  grp: Group | null
  me: GroupMember | undefined
  meElim: boolean
  remaining: number
  refresh: () => Promise<void>
}

export default function Play() {
  const session = useMemo(loadSession, [])
  if (!session) return <Navigate to="/" replace />
  return <PlayInner session={session} />
}

/** Estado privado del equipo: al instante en cada cambio de fase y con sondeo de respaldo. */
function useGroupState(session: Session, game: Game | null) {
  const [gs, setGs] = useState<GroupState | null>(null)
  const [kicked, setKicked] = useState(false)
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const s = await myGroupState(session)
      if (alive.current) setGs(s)
    } catch (e) {
      // El administrador expulsó a este jugador: su token ya no existe.
      if (e instanceof ApiError && e.code === 'unauthorized' && alive.current) setKicked(true)
    }
  }, [session])

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh, game?.status, game?.q_index, game?.updated_at])
  useEffect(() => {
    const t = setInterval(() => void refresh(), 2000)
    return () => clearInterval(t)
  }, [refresh])

  return { gs, refresh, kicked }
}

function PlayInner({ session }: { session: Session }) {
  const nav = useNavigate()
  const offset = useServerOffset()
  const { game, gone } = useGame(session.gameId)
  const { gs, refresh, kicked } = useGroupState(session, game)
  usePresenceTrack(session.code, session.playerId, session.name)

  const leave = useCallback(() => {
    clearSession()
    nav('/', { replace: true })
  }, [nav])
  useEffect(() => {
    if (gone || kicked) leave()
  }, [gone, kicked, leave])

  const running = game ? isTimed(game.status) : false
  const remaining = useCountdown(
    running ? (game?.ends_at ?? null) : null,
    offset,
    game?.status === 'paused' ? (game.paused_remaining_ms ?? 0) : null,
  )

  if (!game || !gs) {
    return (
      <Screen>
        <p className="m-auto text-ink/50">Conectando…</p>
      </Screen>
    )
  }

  const me = gs.members.find((m) => m.player_id === session.playerId)
  const ctx: Ctx = { session, game, gs, grp: gs.group, me, meElim: Boolean(me?.eliminated), remaining, refresh }

  let body: ReactNode
  switch (game.status) {
    case 'finished':
      body = <FinalView ctx={ctx} />
      break
    case 'lobby':
      body = <LobbyView ctx={ctx} />
      break
    case 'question':
      body = ctx.meElim ? <SpectatorView ctx={ctx} /> : <QuestionView ctx={ctx} />
      break
    case 'paused':
      body = <PausedView ctx={ctx} />
      break
    case 'reveal':
      body = <RevealView ctx={ctx} />
      break
    case 'betrayal':
      body = <BetrayalView ctx={ctx} />
      break
    case 'betrayal_reveal':
      body = <BetrayalRevealView ctx={ctx} />
      break
    case 'trial':
      body = <TrialView ctx={ctx} />
      break
    case 'trial_reveal':
      body = <TrialRevealView ctx={ctx} />
      break
  }

  return (
    <Screen code={session.code} onLeave={leave}>
      {body}
    </Screen>
  )
}

/* ------------------------------------------------------------------ */
/* Piezas compartidas                                                  */
/* ------------------------------------------------------------------ */

function Screen({ children, code, onLeave }: { children: ReactNode; code?: string; onLeave?: () => void }) {
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

function TeamChip({ color }: { color?: string | null }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5">
      <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: teamHex(color) }} />
      <span className="label text-ink/70">Equipo {teamName(color)}</span>
    </span>
  )
}

function KeyBar({ ctx }: { ctx: Ctx }) {
  const have = new Set(ctx.gs.keys.map((k) => k.question_pos))
  const color = ctx.grp?.color
  const icon = color === 'yellow' ? 'text-ink' : 'text-white'
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5" aria-label={`${have.size} llaves`}>
      {Array.from({ length: ctx.game.q_total }, (_, i) => (
        <span
          key={i}
          className={`grid h-5 w-5 place-items-center rounded-md border ${have.has(i) ? 'border-transparent' : 'border-line bg-pale'}`}
          style={have.has(i) ? { backgroundColor: teamHex(color) } : undefined}
        >
          {have.has(i) && <Key className={`h-3 w-3 ${icon}`} />}
        </span>
      ))}
    </div>
  )
}

function MemberChips({ members, meId }: { members: GroupMember[]; meId: string }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {members.map((m) => (
        <span
          key={m.id}
          className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${
            m.eliminated
              ? 'border-pink/30 bg-pink/10 text-pink line-through decoration-pink/40'
              : m.escaped
                ? 'border-lime bg-lime/50 text-ink'
                : 'border-line bg-pale text-ink'
          }`}
        >
          {m.player_name}
          {m.player_id === meId && <span className="label ml-1.5 !text-[9px] opacity-60">tú</span>}
        </span>
      ))}
    </div>
  )
}

function Status({ icon, label, title, children, tone = 'ink' }: {
  icon: ReactNode
  label: string
  title: string
  children?: ReactNode
  tone?: 'ink' | 'pink' | 'lime' | 'blue'
}) {
  const color = { ink: 'text-ink', pink: 'text-pink', lime: 'text-ink', blue: 'text-blue' }[tone]
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-1 flex-col items-center justify-center p-4 text-center"
    >
      <div className={`mb-4 ${color}`}>{icon}</div>
      <Label className="mb-2 block">{label}</Label>
      <h1 className={`display text-5xl ${color}`}>{title}</h1>
      <div className="mt-5 w-full space-y-4 text-ink/60">{children}</div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Sala                                                                */
/* ------------------------------------------------------------------ */

function LobbyView({ ctx }: { ctx: Ctx }) {
  const { grp, gs, session, game } = ctx
  if (!grp) {
    return (
      <Status icon={<Zap className="h-12 w-12 animate-pulse" />} label="Formando equipos…" title="MISIÓN cambio.">
        <p>El administrador está repartiendo los equipos. En unos segundos verás el tuyo.</p>
      </Status>
    )
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-4 text-center">
      <div
        className="mb-5 h-20 w-20 rounded-full ring-8 ring-white"
        style={{ backgroundColor: teamHex(grp.color), boxShadow: `0 0 0 2px ${teamHex(grp.color)}` }}
      />
      <Label>Tu equipo</Label>
      <h1 className="display mt-2 text-6xl" style={{ color: teamHex(grp.color) }}>
        {teamName(grp.color)}
      </h1>
      <p className="mt-3 text-sm text-ink/60">{gs.members.length} integrantes · {game.q_total} puertas</p>
      <div className="mt-6">
        <MemberChips members={gs.members} meId={session.playerId} />
      </div>
      <div className="card mt-8 w-full p-5 text-left text-sm leading-relaxed text-ink/70">
        <p>
          <b className="text-ink">El primero de ustedes que responda</b> decide por todo el equipo. Si fallan o se acaba el
          tiempo, la puerta se cobra a uno de ustedes.
        </p>
        <p className="mt-2">Y al final espera una última puerta que pondrá a prueba su confianza…</p>
      </div>
      <p className="mt-auto pt-8 text-xs text-ink/40">Esperando que el administrador abra la primera puerta…</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Puertas y prueba final                                              */
/* ------------------------------------------------------------------ */

function QuestionView({ ctx, trial = false }: { ctx: Ctx; trial?: boolean }) {
  const { game, gs, grp, session, remaining, refresh } = ctx
  const q = game.current_question
  const [pending, setPending] = useState<number | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    setPending(null)
    setError('')
  }, [game.q_index])

  if (!q) return null
  const answered = gs.answered
  const chosen = gs.group_choice
  const timeUp = remaining === 0
  const canAnswer = !answered && !timeUp && pending === null

  const choose = async (i: number) => {
    if (!canAnswer) return
    setPending(i)
    setError('')
    try {
      await submitGroupAnswer(session, game.q_index, i)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar.')
    } finally {
      await refresh()
      setPending(null)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="space-y-2">
          <TeamChip color={grp?.color} />
          <div>
            <Label>{trial ? 'Prueba final' : `Puerta ${game.q_index + 1} de ${game.q_total}`}</Label>
            <div className="mt-1.5">
              <Badge tone={trial ? 'pink' : 'purple'}>{q.model}</Badge>
            </div>
          </div>
        </div>
        <TimerRing ms={remaining} totalMs={phaseTotalMs(game)} size={76} />
      </div>

      {trial && (
        <p className="mb-2 rounded-2xl bg-pink/10 px-4 py-2.5 text-center text-xs font-semibold text-pink">
          Si fallan, vuelven al nivel cero y pierden todas las llaves.
        </p>
      )}

      <AnimatePresence mode="wait">
        <motion.h2
          key={q.index}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="display mt-4 text-[26px] leading-[1.05] tracking-tight"
        >
          {q.prompt}
        </motion.h2>
      </AnimatePresence>

      <div className="mt-5 space-y-3">
        {q.options.map((text, i) => {
          const mine = chosen === i || pending === i
          return (
            <motion.button
              key={i}
              whileTap={canAnswer ? { scale: 0.98 } : undefined}
              onClick={() => void choose(i)}
              disabled={!canAnswer}
              className={`flex w-full items-center gap-3 rounded-3xl border-2 p-4 text-left transition disabled:cursor-default ${
                mine ? 'border-blue bg-blue/10' : 'border-line bg-white'
              } ${!canAnswer && !mine ? 'opacity-50' : ''}`}
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl font-mono text-sm font-bold text-white ${LETTER_BG[i]}`}>
                {LETTERS[i]}
              </span>
              <span className="flex-1 text-[15px] font-semibold leading-snug">{text}</span>
              {mine && <Check className="h-5 w-5 text-blue" />}
            </motion.button>
          )
        })}
      </div>

      <div className="mt-auto space-y-3 pt-4">
        {error && <p className="rounded-2xl bg-pink/10 px-4 py-3 text-sm font-medium text-pink">{error}</p>}
        {answered ? (
          <p className="rounded-2xl bg-blue/10 px-4 py-3 text-center text-sm font-semibold">
            Su equipo eligió <b>{chosen !== null ? LETTERS[chosen] : '?'}</b>
            {gs.answered_by ? ` (respondió ${gs.answered_by})` : ''}. Esperando el resultado…
          </p>
        ) : timeUp ? (
          <p className="rounded-2xl bg-orange/15 px-4 py-3 text-center text-sm font-semibold text-orange">
            Se acabó el tiempo. Su equipo no respondió.
          </p>
        ) : (
          <p className="text-center text-xs text-ink/45">El primero que responda decide por todo el equipo.</p>
        )}
        {!trial && <KeyBar ctx={ctx} />}
      </div>
    </div>
  )
}

function PausedView({ ctx }: { ctx: Ctx }) {
  return (
    <Status icon={<Pause className="h-12 w-12" />} label="Puerta en pausa" title="Pausa">
      <p>El administrador detuvo el tiempo.</p>
      <div className="flex justify-center">
        <TimerRing ms={ctx.remaining} totalMs={phaseTotalMs(ctx.game)} size={96} paused />
      </div>
    </Status>
  )
}

/** Quien ya cayó mira el juego desde fuera. */
function SpectatorView({ ctx }: { ctx: Ctx }) {
  const { me, gs, game, session } = ctx
  const alive = survivors(gs)
  return (
    <Status icon={<Skull className="h-14 w-14" />} label="Estás eliminado" title="Fuera de juego" tone="pink">
      {me?.elimination_reason && <p className="font-semibold text-pink">{me.elimination_reason}</p>}
      <p>Tu equipo sigue luchando sin ti{game.status === 'question' ? ` en la puerta ${game.q_index + 1}` : ''}.</p>
      <div className="card p-5">
        <Label>Siguen en pie ({alive.length})</Label>
        <div className="mt-3">
          <MemberChips members={gs.members} meId={session.playerId} />
        </div>
        <div className="mt-4">
          <KeyBar ctx={ctx} />
        </div>
      </div>
    </Status>
  )
}

function RevealView({ ctx }: { ctx: Ctx }) {
  const { game, gs, grp, me, meElim, session } = ctx
  const rv = game.reveal
  if (!rv) return null

  const choice = gs.group_choice
  const correct = choice !== null && choice === rv.correct_index
  const thisDoor = gs.eliminations.filter((e) => e.question_pos === game.q_index)
  const iFell = thisDoor.some((e) => e.player_id === session.playerId)
  const others = thisDoor.filter((e) => e.player_id !== session.playerId)

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between">
        <TeamChip color={grp?.color} />
        <Label>Puerta {game.q_index + 1} de {game.q_total}</Label>
      </div>

      <div className="rounded-3xl bg-lime p-5">
        <div className="flex items-center gap-3">
          <Check className="h-6 w-6" />
          <span className="font-bold">Respuesta correcta: {LETTERS[rv.correct_index]}</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink/70">{rv.explanation}</p>
      </div>

      <div className="mt-4 space-y-3">
        {correct ? (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-3xl border-2 p-5 text-center" style={{ borderColor: teamHex(grp?.color) }}>
            <Key className="mx-auto mb-2 h-9 w-9" style={{ color: teamHex(grp?.color) }} />
            <p className="text-lg font-bold">¡Ganaron la llave {teamName(grp?.color)}!</p>
            <p className="text-sm text-ink/55">Nadie cae en esta puerta.</p>
          </motion.div>
        ) : (
          <div className="rounded-3xl border border-pink/20 bg-pink/10 p-5 text-center">
            <ShieldAlert className="mx-auto mb-2 h-9 w-9 text-pink" />
            <p className="text-lg font-bold text-pink">{choice === null ? 'No respondieron a tiempo' : 'Fallaron esta puerta'}</p>
            <p className="text-sm text-ink/55">La puerta se cobra a uno de ustedes.</p>
          </div>
        )}

        {iFell && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-3xl bg-ink p-6 text-center text-white"
          >
            <Skull className="mx-auto mb-3 h-12 w-12 text-pink" />
            <Label className="!text-white/60">Eres el elegido</Label>
            <p className="display mt-2 text-3xl text-pink">{thisDoor.find((e) => e.player_id === session.playerId)?.reason}</p>
            <p className="mt-3 text-sm text-white/60">Miras el resto desde fuera.</p>
          </motion.div>
        )}
        {others.map((e) => (
          <motion.p
            key={e.player_id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-2xl bg-pink/10 px-4 py-3 text-center text-sm font-bold text-pink"
          >
            💀 {dramatize(e.player_name, e.reason)}
          </motion.p>
        ))}
        {meElim && !iFell && me && <p className="text-center text-xs text-ink/45">Sigues fuera de juego.</p>}
      </div>

      <div className="mt-auto space-y-3 pt-4">
        <KeyBar ctx={ctx} />
        <p className="text-center text-xs text-ink/40">Siguen en pie: {survivors(gs).length} de {gs.members.length}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* La última puerta: traición                                          */
/* ------------------------------------------------------------------ */

function BetrayalView({ ctx }: { ctx: Ctx }) {
  const { game, gs, grp, meElim, remaining, session, refresh } = ctx
  const [pending, setPending] = useState<Vote | null>(null)
  const [error, setError] = useState('')
  const alive = survivors(gs).length
  const timeUp = remaining === 0

  if (grp?.outcome === 'wiped' || (alive === 0 && grp)) {
    return (
      <Status icon={<Skull className="h-14 w-14" />} label="La última puerta" title="Su equipo cayó" tone="pink">
        <p>No queda nadie para llegar hasta aquí.</p>
      </Status>
    )
  }
  if (meElim) {
    return (
      <Status icon={<Swords className="h-14 w-14" />} label="La última puerta" title="Votan sin ti" tone="pink">
        <p>Quedan {alive} con vida y deciden en secreto. Tú ya no puedes votar.</p>
      </Status>
    )
  }
  if (grp?.outcome === 'trap') {
    return (
      <Status icon={<Key className="h-14 w-14" />} label="La última puerta" title="Estás solo" tone="blue">
        <p>Eres el único que sigue vivo en tu equipo: nadie a quien traicionar, nadie que te traicione.</p>
        <p className="font-semibold text-ink">Pasas directo a la prueba final.</p>
      </Status>
    )
  }

  const vote = async (v: Vote) => {
    if (timeUp || pending) return
    setPending(v)
    setError('')
    try {
      await submitVote(session, v)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar el voto.')
    } finally {
      await refresh()
      setPending(null)
    }
  }
  const current = pending ?? gs.my_vote

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="space-y-2">
          <TeamChip color={grp?.color} />
          <Label className="block">La última puerta</Label>
        </div>
        <TimerRing ms={remaining} totalMs={phaseTotalMs(game)} size={76} />
      </div>

      <h2 className="display mt-3 text-[34px] leading-[1]">
        Solo una puerta. <span className="serif-i text-pink">¿Confías en ellos?</span>
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-ink/60">
        Cada uno vota <b className="text-ink">en secreto</b>. Lo que pase depende de cuántos de ustedes traicionen.
      </p>

      <div className="mt-5 space-y-3">
        <motion.button
          whileTap={!timeUp ? { scale: 0.98 } : undefined}
          disabled={timeUp}
          onClick={() => void vote('share')}
          className={`flex w-full items-center gap-4 rounded-3xl border-2 p-5 text-left transition disabled:cursor-default ${
            current === 'share' ? 'border-blue bg-blue/10' : 'border-line bg-white'
          } ${timeUp && current !== 'share' ? 'opacity-50' : ''}`}
        >
          <Handshake className="h-9 w-9 shrink-0 text-blue" />
          <span>
            <span className="block text-lg font-extrabold">Salimos todos</span>
            <span className="text-sm text-ink/55">Cooperar con el equipo.</span>
          </span>
          {current === 'share' && <Check className="ml-auto h-5 w-5 text-blue" />}
        </motion.button>

        <motion.button
          whileTap={!timeUp ? { scale: 0.98 } : undefined}
          disabled={timeUp}
          onClick={() => void vote('steal')}
          className={`flex w-full items-center gap-4 rounded-3xl border-2 p-5 text-left transition disabled:cursor-default ${
            current === 'steal' ? 'border-pink bg-pink/10' : 'border-line bg-white'
          } ${timeUp && current !== 'steal' ? 'opacity-50' : ''}`}
        >
          <Swords className="h-9 w-9 shrink-0 text-pink" />
          <span>
            <span className="block text-lg font-extrabold">Salgo yo solo</span>
            <span className="text-sm text-ink/55">Traicionar y cruzar la puerta.</span>
          </span>
          {current === 'steal' && <Check className="ml-auto h-5 w-5 text-pink" />}
        </motion.button>
      </div>

      <div className="mt-auto space-y-2 pt-4 text-center">
        {error && <p className="rounded-2xl bg-pink/10 px-4 py-3 text-sm font-medium text-pink">{error}</p>}
        <p className="text-sm font-semibold">
          {gs.votes_cast} de {alive} han votado
        </p>
        <p className="text-xs text-ink/40">
          {timeUp ? 'Votación cerrada. Esperando al administrador…' : 'Puedes cambiar tu voto hasta que se acabe el tiempo. Si no votas, cuentas como «salimos todos».'}
        </p>
      </div>
    </div>
  )
}

function BetrayalRevealView({ ctx }: { ctx: Ctx }) {
  const { grp, gs, me, meElim, session, game } = ctx
  const votes = gs.votes
  const winnerName = gs.members.find((m) => m.player_id === grp?.winner_player_id)?.player_name
  const fallen = gs.eliminations.filter((e) => e.question_pos === game.q_total)

  let head: ReactNode
  if (grp?.outcome === 'lone_winner') {
    head =
      grp.winner_player_id === session.playerId ? (
        <Status icon={<Trophy className="h-14 w-14" />} label="Traición" title="¡Te largaste solo!" tone="lime">
          <p className="font-semibold text-ink">Fuiste el único traidor: cruzaste la puerta y la sellaste tras de ti.</p>
        </Status>
      ) : (
        <Status icon={<Swords className="h-14 w-14" />} label="Traición" title="Te traicionaron" tone="pink">
          <p>{winnerName ?? 'Un compañero'} fue el único en traicionar: escapó solo y los dejó atrás.</p>
        </Status>
      )
  } else if (grp?.outcome === 'wiped') {
    head = (
      <Status icon={<Skull className="h-14 w-14" />} label="Traición" title="Nadie salió" tone="pink">
        <p>Los traidores se anularon entre sí y el equipo se desmoronó.</p>
      </Status>
    )
  } else if (meElim) {
    head = (
      <Status icon={<Skull className="h-14 w-14" />} label="Traición" title="Caíste" tone="pink">
        <p className="font-semibold text-pink">{me?.elimination_reason ?? 'Tu traición se anuló.'}</p>
      </Status>
    )
  } else {
    head = (
      <Status icon={<Handshake className="h-14 w-14" />} label="Traición" title="La puerta se selló" tone="blue">
        <p>No hubo un único traidor. Solo queda la <b className="text-ink">prueba final</b>.</p>
      </Status>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      {head}
      {votes.length > 0 && (
        <div className="card mt-4 p-5">
          <Label>Los votos</Label>
          <ul className="mt-3 divide-y divide-line text-sm">
            {votes.map((v) => (
              <li key={v.player_id} className="flex items-center justify-between py-2">
                <span className="font-semibold">{v.player_name}</span>
                <span className={`flex items-center gap-1.5 font-bold ${v.vote === 'steal' ? 'text-pink' : 'text-blue'}`}>
                  {v.vote === 'steal' ? <Swords className="h-4 w-4" /> : <Handshake className="h-4 w-4" />}
                  {v.vote === 'steal' ? 'Traicionó' : v.auto ? 'No votó' : 'Cooperó'}
                </span>
              </li>
            ))}
          </ul>
          {fallen.length > 0 && (
            <p className="mt-3 text-xs text-ink/45">Cayeron: {fallen.map((f) => f.player_name).join(', ')}.</p>
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Prueba final                                                        */
/* ------------------------------------------------------------------ */

function TrialView({ ctx }: { ctx: Ctx }) {
  const { grp, meElim, me } = ctx
  const inTrial = grp?.outcome === 'trap' && !meElim
  if (inTrial) return <QuestionView ctx={ctx} trial />
  if (me?.escaped) {
    return (
      <Status icon={<Trophy className="h-14 w-14" />} label="Prueba final" title="Ya escapaste" tone="lime">
        <p>Mientras tanto, otros equipos se juegan la última prueba.</p>
      </Status>
    )
  }
  return (
    <Status icon={<Skull className="h-14 w-14" />} label="Prueba final" title="Miras desde fuera" tone="pink">
      <p>{meElim ? 'Los equipos que sobrevivieron se juegan la prueba final.' : 'Tu equipo no llegó a la prueba final.'}</p>
    </Status>
  )
}

function TrialRevealView({ ctx }: { ctx: Ctx }) {
  const { grp, gs, game } = ctx
  const rv = game.reveal
  const extra = rv && (
    <div className="rounded-3xl bg-pale p-4 text-sm leading-relaxed">
      <b>Respuesta: {LETTERS[rv.correct_index]}.</b> {rv.explanation}
    </div>
  )
  if (grp?.outcome === 'escaped') {
    return (
      <Status icon={<Trophy className="h-14 w-14" />} label="Prueba final" title="¡Escaparon!" tone="lime">
        <p className="font-semibold text-ink">{survivors(gs).length} sobrevivientes cruzan la última puerta.</p>
        {extra}
      </Status>
    )
  }
  if (grp?.outcome === 'reset') {
    return (
      <Status icon={<ShieldAlert className="h-14 w-14" />} label="Prueba final" title="Nivel cero" tone="pink">
        <p>Fallaron la prueba final: pierden todas las llaves y vuelven al principio.</p>
        {extra}
      </Status>
    )
  }
  return (
    <Status icon={<Zap className="h-14 w-14" />} label="Prueba final" title="Prueba terminada">
      <p>Esperando el resultado final…</p>
      {extra}
    </Status>
  )
}

/* ------------------------------------------------------------------ */
/* Final                                                               */
/* ------------------------------------------------------------------ */

function FinalView({ ctx }: { ctx: Ctx }) {
  const { grp, gs, me, session, game } = ctx
  const keys = gs.keys.length
  const outcome = grp?.outcome ?? null

  let head: ReactNode
  if (outcome === 'escaped') {
    head = (
      <Status icon={<Trophy className="h-16 w-16 animate-bounce" />} label="Misión cumplida" title="¡Escaparon!" tone="lime">
        <p>
          {me?.escaped ? 'Cruzaste la última puerta junto a tu equipo.' : 'Tu equipo escapó, pero tú caíste por el camino.'}
        </p>
      </Status>
    )
  } else if (outcome === 'lone_winner') {
    head =
      grp?.winner_player_id === session.playerId ? (
        <Status icon={<Trophy className="h-16 w-16 animate-bounce" />} label="Misión cumplida" title="Escapaste solo" tone="lime">
          <p>Traicionaste a tu equipo y cruzaste la puerta. Tú ganaste.</p>
        </Status>
      ) : (
        <Status icon={<Swords className="h-16 w-16" />} label="Misión fallida" title="Te traicionaron" tone="pink">
          <p>Un compañero escapó solo. Nadie más salió.</p>
        </Status>
      )
  } else if (outcome === 'reset') {
    head = (
      <Status icon={<ShieldAlert className="h-16 w-16" />} label="Misión fallida" title="Nivel cero" tone="pink">
        <p>Fallaron la prueba final y lo perdieron todo.</p>
      </Status>
    )
  } else if (outcome === 'wiped') {
    head = (
      <Status icon={<Skull className="h-16 w-16" />} label="Misión fallida" title="Equipo aniquilado" tone="pink">
        <p>Nadie quedó con vida.</p>
      </Status>
    )
  } else {
    head = (
      <Status icon={<ShieldAlert className="h-16 w-16" />} label="Partida terminada" title="Fin del juego">
        <p>La partida terminó antes de completar todas las fases.</p>
      </Status>
    )
  }

  return (
    <>
      {head}
      {grp && (
        <div className="card mb-4 p-5 text-center">
          <TeamChip color={grp.color} />
          <div className="mt-4">
            <MemberChips members={gs.members} meId={session.playerId} />
          </div>
          <div className="mt-4">
            <KeyBar ctx={ctx} />
          </div>
          <p className="mt-3 text-xs text-ink/50">
            {outcome === 'reset' ? 'Llaves perdidas por el nivel cero' : `${keys} de ${game.q_total} llaves`} · {survivors(gs).length} de {gs.members.length} con vida
          </p>
        </div>
      )}
      <Button
        variant="quiet"
        className="mb-2"
        onClick={() => {
          clearSession()
          window.location.assign('/')
        }}
      >
        Volver al inicio
      </Button>
    </>
  )
}
