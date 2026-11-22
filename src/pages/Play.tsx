import { AnimatePresence, motion } from 'framer-motion'
import { LogOut } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Logo, LogoTile, PixelIcon, type PixelName } from '../components/pixel'
import { Badge, Button, Label, TimerRing } from '../components/ui'
import { ApiError, myGroupState, submitGroupAnswer, submitVote } from '../lib/api'
import { clearSession, loadSession, useCountdown, useServerOffset } from '../lib/clock'
import { useGame, usePresenceTrack } from '../lib/realtime'
import { dramatize, isTimed, phaseTotalMs, survivors, teamHex, teamName } from '../lib/teams'
import type { Game, Group, GroupMember, GroupState, Session, Vote } from '../lib/types'

const LETTERS = ['A', 'B', 'C', 'D']

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
  if (!session) return <Navigate to="/unirse" replace />
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
        <p className="pixel m-auto animate-pulse text-[10px] text-ink/50">Forzando la cerradura…</p>
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

/** Móvil: columna estrecha. Tablet y escritorio: se expande (las vistas de pregunta usan dos columnas). */
function Screen({ children, code, onLeave }: { children: ReactNode; code?: string; onLeave?: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-5 safe-b md:max-w-3xl md:px-8 md:pt-8 lg:max-w-6xl">
      {code && (
        <header className="mb-5 flex items-center justify-between gap-3 md:mb-8">
          <Link to="/" className="flex items-center gap-3" aria-label="Inicio">
            <LogoTile className="h-10 w-10" />
            <span className="pixel hidden text-[10px] sm:inline">Misión: Cambio</span>
          </Link>
          <div className="flex items-center gap-3">
            <Badge>Código {code}</Badge>
            <button
              onClick={onLeave}
              className="grid h-10 w-10 place-items-center rounded-full border border-line bg-pale text-ink/60 transition hover:text-ink"
              aria-label="Salir"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
      )}
      {children}
    </main>
  )
}

/** Contenedor centrado para las vistas que no necesitan dos columnas. */
function Narrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto flex w-full max-w-xl flex-1 flex-col ${className}`}>{children}</div>
}

function TeamChip({ color }: { color?: string | null }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-pale px-3 py-1.5">
      <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: teamHex(color) }} />
      <span className="label text-[9px] text-ink/70">Equipo {teamName(color)}</span>
    </span>
  )
}

function KeyBar({ ctx }: { ctx: Ctx }) {
  const have = new Set(ctx.gs.keys.map((k) => k.question_pos))
  const color = ctx.grp?.color
  const icon = color === 'yellow' ? 'text-black' : 'text-white'
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5" aria-label={`${have.size} llaves`}>
      {Array.from({ length: ctx.game.q_total }, (_, i) => (
        <span
          key={i}
          className={`grid h-6 w-6 place-items-center rounded-md border ${have.has(i) ? 'border-transparent' : 'border-line bg-pale'}`}
          style={have.has(i) ? { backgroundColor: teamHex(color) } : undefined}
        >
          {have.has(i) && <PixelIcon name="key" className={`h-3.5 w-3.5 ${icon}`} />}
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
                ? 'border-lime/60 bg-lime/15 text-lime'
                : 'border-line bg-pale text-ink'
          }`}
        >
          {m.player_name}
          {m.player_id === meId && <span className="label ml-1.5 !text-[8px] opacity-60">tú</span>}
        </span>
      ))}
    </div>
  )
}

type Tone = 'ink' | 'pink' | 'lime' | 'blue'
const TONE_TEXT: Record<Tone, string> = { ink: 'text-ink', pink: 'text-pink', lime: 'text-lime', blue: 'text-ink' }

function Status({ icon, label, title, children, tone = 'ink' }: {
  icon: PixelName | 'logo'
  label: string
  title: string
  children?: ReactNode
  tone?: Tone
}) {
  const color = TONE_TEXT[tone]
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center p-4 text-center"
    >
      <div className={`mb-6 ${color}`}>
        {icon === 'logo' ? <Logo className="h-16 w-16 md:h-20 md:w-20" /> : <PixelIcon name={icon} className="h-14 w-14 md:h-16 md:w-16" />}
      </div>
      <Label className="mb-4 block">{label}</Label>
      <h1 className={`pixel text-[clamp(1.05rem,5vw,2.25rem)] ${color}`}>{title}</h1>
      <div className="mt-6 w-full space-y-4 text-ink/60 md:text-lg">{children}</div>
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
      <Status icon="lock" label="Formando equipos…" title="Misión: Cambio">
        <p>El profesor está repartiendo los equipos. En unos segundos sabrás con quién te toca sufrir.</p>
      </Status>
    )
  }
  return (
    <Narrow className="items-center justify-center p-4 text-center">
      <div
        className="mb-6 h-20 w-20 rounded-full ring-8 ring-canvas"
        style={{ backgroundColor: teamHex(grp.color), boxShadow: `0 0 0 2px ${teamHex(grp.color)}` }}
      />
      <Label>Tu equipo</Label>
      <h1 className="pixel mt-4 text-[clamp(1.4rem,7vw,3rem)]" style={{ color: teamHex(grp.color) }}>
        {teamName(grp.color)}
      </h1>
      <p className="mt-4 text-sm text-ink/60">{gs.members.length} integrantes · {game.q_total} puertas</p>
      <div className="mt-6">
        <MemberChips members={gs.members} meId={session.playerId} />
      </div>
      <div className="card mt-8 w-full p-5 text-left text-sm leading-relaxed text-ink/70 md:text-base">
        <p>
          <b className="text-ink">El primero de ustedes que responda</b> decide por todo el equipo. Si fallan o se acaba el
          tiempo, la puerta se cobra a uno de ustedes.
        </p>
        <p className="mt-2">Y al final espera una última puerta que pondrá a prueba su confianza… y su amistad.</p>
      </div>
      <p className="mt-auto pt-8 text-xs text-ink/40">Respira. Mira a tu equipo. Decide a quién vigilar. La primera puerta está por abrirse…</p>
    </Narrow>
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
    <div className="flex flex-1 flex-col lg:grid lg:grid-cols-2 lg:items-center lg:gap-16">
      <div>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="space-y-2.5">
            <TeamChip color={grp?.color} />
            <div>
              <Label>{trial ? 'Prueba final' : `Puerta ${game.q_index + 1} de ${game.q_total}`}</Label>
              <div className="mt-2">
                <Badge tone={trial ? 'pink' : 'purple'}>{q.model}</Badge>
              </div>
            </div>
          </div>
          <TimerRing ms={remaining} totalMs={phaseTotalMs(game)} size={84} />
        </div>

        {trial && (
          <p className="mb-2 rounded-2xl border border-pink/30 bg-pink/10 px-4 py-2.5 text-center text-xs font-semibold text-pink">
            Si fallan, vuelven al nivel cero y pierden todas las llaves. Sin presión.
          </p>
        )}

        <AnimatePresence mode="wait">
          <motion.h2
            key={q.index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="display mt-4 text-[26px] leading-[1.08] tracking-tight md:text-4xl lg:text-[46px]"
          >
            {q.prompt}
          </motion.h2>
        </AnimatePresence>
      </div>

      <div className="flex flex-1 flex-col lg:flex-none">
        <div className="mt-5 space-y-3 md:mt-8 lg:mt-0">
          {q.options.map((text, i) => {
            const mine = chosen === i || pending === i
            return (
              <motion.button
                key={i}
                whileTap={canAnswer ? { scale: 0.98 } : undefined}
                onClick={() => void choose(i)}
                disabled={!canAnswer}
                className={`flex w-full items-center gap-3 rounded-3xl border-2 p-4 text-left transition disabled:cursor-default md:p-5 ${
                  mine ? 'border-lime bg-lime/10' : 'border-line bg-pale enabled:hover:border-white/30'
                } ${!canAnswer && !mine ? 'opacity-50' : ''}`}
              >
                <span
                  className={`pixel grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs ${mine ? 'bg-lime text-black' : 'bg-white/10 text-ink'}`}
                >
                  {LETTERS[i]}
                </span>
                <span className="flex-1 text-[15px] font-semibold leading-snug md:text-lg">{text}</span>
                {mine && <PixelIcon name="check" className="h-4 w-4 text-lime" />}
              </motion.button>
            )
          })}
        </div>

        <div className="mt-auto space-y-3 pt-4 lg:mt-6">
          {error && <p className="rounded-2xl border border-pink/30 bg-pink/10 px-4 py-3 text-sm font-medium text-pink">{error}</p>}
          {answered ? (
            <p className="rounded-2xl border border-lime/40 bg-lime/10 px-4 py-3 text-center text-sm font-semibold">
              Su equipo eligió <b>{chosen !== null ? LETTERS[chosen] : '?'}</b>
              {gs.answered_by ? ` (respondió ${gs.answered_by})` : ''}. Ahora a rezar…
            </p>
          ) : timeUp ? (
            <p className="rounded-2xl border border-orange/40 bg-orange/10 px-4 py-3 text-center text-sm font-semibold text-orange">
              Se acabó el tiempo. Su equipo no respondió. La puerta tiene hambre.
            </p>
          ) : (
            <p className="text-center text-xs text-ink/45">El primero que responda decide por todo el equipo. Sí, incluso si se equivoca.</p>
          )}
          {!trial && <KeyBar ctx={ctx} />}
        </div>
      </div>
    </div>
  )
}

function PausedView({ ctx }: { ctx: Ctx }) {
  return (
    <Status icon="pause" label="Puerta en pausa" title="Pausa">
      <p>El profesor detuvo el tiempo. Aprovecha para pensar… o para sospechar.</p>
      <div className="flex justify-center">
        <TimerRing ms={ctx.remaining} totalMs={phaseTotalMs(ctx.game)} size={104} paused />
      </div>
    </Status>
  )
}

/** Quien ya cayó mira el juego desde fuera. */
function SpectatorView({ ctx }: { ctx: Ctx }) {
  const { me, gs, game, session } = ctx
  const alive = survivors(gs)
  return (
    <Status icon="skull" label="Estás eliminado" title="Fuera de juego" tone="pink">
      {me?.elimination_reason && <p className="font-semibold text-pink">{me.elimination_reason}</p>}
      <p>Tu equipo sigue luchando sin ti{game.status === 'question' ? ` en la puerta ${game.q_index + 1}` : ''}. Anima desde el más allá.</p>
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
    <Narrow>
      <div className="mb-3 flex items-center justify-between">
        <TeamChip color={grp?.color} />
        <Label>Puerta {game.q_index + 1} de {game.q_total}</Label>
      </div>

      <div className="rounded-3xl bg-lime p-5 text-black md:p-6">
        <div className="flex items-center gap-3">
          <PixelIcon name="check" className="h-5 w-5" />
          <span className="font-bold">Respuesta correcta: {LETTERS[rv.correct_index]}</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-black/70 md:text-base">{rv.explanation}</p>
      </div>

      <div className="mt-4 space-y-3">
        {correct ? (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-3xl border-2 p-5 text-center" style={{ borderColor: teamHex(grp?.color) }}>
            <PixelIcon name="key" className="mx-auto mb-3 h-9 w-9" />
            <p className="text-lg font-bold" style={{ color: teamHex(grp?.color) }}>¡Ganaron la llave {teamName(grp?.color)}!</p>
            <p className="text-sm text-ink/55">Nadie cae en esta puerta. Disfruten, no durará.</p>
          </motion.div>
        ) : (
          <div className="rounded-3xl border border-pink/30 bg-pink/10 p-5 text-center">
            <PixelIcon name="shield" className="mx-auto mb-3 h-9 w-9 text-pink" />
            <p className="text-lg font-bold text-pink">{choice === null ? 'No respondieron a tiempo' : 'Fallaron esta puerta'}</p>
            <p className="text-sm text-ink/55">La puerta se cobra a uno de ustedes.</p>
          </div>
        )}

        {iFell && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-3xl border border-pink/40 bg-pink/10 p-6 text-center"
          >
            <PixelIcon name="skull" className="mx-auto mb-4 h-12 w-12 text-pink" />
            <Label className="!text-ink/60">Eres el elegido</Label>
            <p className="display mt-3 text-3xl text-pink">{thisDoor.find((e) => e.player_id === session.playerId)?.reason}</p>
            <p className="mt-3 text-sm text-ink/60">Miras el resto desde fuera.</p>
          </motion.div>
        )}
        {others.map((e) => (
          <motion.p
            key={e.player_id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-2xl border border-pink/30 bg-pink/10 px-4 py-3 text-center text-sm font-bold text-pink"
          >
            {dramatize(e.player_name, e.reason)}
          </motion.p>
        ))}
        {meElim && !iFell && me && <p className="text-center text-xs text-ink/45">Sigues fuera de juego.</p>}
      </div>

      <div className="mt-auto space-y-3 pt-6">
        <KeyBar ctx={ctx} />
        <p className="text-center text-xs text-ink/40">Siguen en pie: {survivors(gs).length} de {gs.members.length}</p>
      </div>
    </Narrow>
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
      <Status icon="skull" label="La última puerta" title="Su equipo cayó" tone="pink">
        <p>No queda nadie para llegar hasta aquí. Qué silencio.</p>
      </Status>
    )
  }
  if (meElim) {
    return (
      <Status icon="sword" label="La última puerta" title="Votan sin ti" tone="pink">
        <p>Quedan {alive} con vida y deciden en secreto. Tú ya no puedes votar. Solo puedes mirar y juzgar.</p>
      </Status>
    )
  }
  if (grp?.outcome === 'trap') {
    return (
      <Status icon="key" label="La última puerta" title="Estás solo" tone="ink">
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
    <div className="flex flex-1 flex-col lg:grid lg:grid-cols-2 lg:items-center lg:gap-16">
      <div>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="space-y-2.5">
            <TeamChip color={grp?.color} />
            <Label className="block">La última puerta</Label>
          </div>
          <TimerRing ms={remaining} totalMs={phaseTotalMs(game)} size={84} />
        </div>

        <h2 className="pixel mt-5 text-[clamp(1.1rem,5.4vw,2.4rem)] leading-snug">
          Solo una puerta. <span className="text-ink/45">¿Confías en ellos?</span>
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-ink/60 md:text-base">
          Cada uno vota <b className="text-ink">en secreto</b>. Lo que pase depende de cuántos de ustedes traicionen. Mira a tus
          compañeros a los ojos. O mejor no.
        </p>
      </div>

      <div className="flex flex-1 flex-col lg:flex-none">
        <div className="mt-5 space-y-3 lg:mt-0">
          <motion.button
            whileTap={!timeUp ? { scale: 0.98 } : undefined}
            disabled={timeUp}
            onClick={() => void vote('share')}
            className={`flex w-full items-center gap-4 rounded-3xl border-2 p-5 text-left transition disabled:cursor-default ${
              current === 'share' ? 'border-lime bg-lime/10' : 'border-line bg-pale enabled:hover:border-white/30'
            } ${timeUp && current !== 'share' ? 'opacity-50' : ''}`}
          >
            <Logo className="h-10 w-10 shrink-0" />
            <span>
              <span className="block text-lg font-extrabold">Salimos todos</span>
              <span className="text-sm text-ink/55">Cooperar con el equipo.</span>
            </span>
            {current === 'share' && <PixelIcon name="check" className="ml-auto h-4 w-4 text-lime" />}
          </motion.button>

          <motion.button
            whileTap={!timeUp ? { scale: 0.98 } : undefined}
            disabled={timeUp}
            onClick={() => void vote('steal')}
            className={`flex w-full items-center gap-4 rounded-3xl border-2 p-5 text-left transition disabled:cursor-default ${
              current === 'steal' ? 'border-pink bg-pink/10' : 'border-line bg-pale enabled:hover:border-white/30'
            } ${timeUp && current !== 'steal' ? 'opacity-50' : ''}`}
          >
            <PixelIcon name="sword" className="h-10 w-10 shrink-0 text-pink" />
            <span>
              <span className="block text-lg font-extrabold">Salgo yo solo</span>
              <span className="text-sm text-ink/55">Traicionar y cruzar la puerta.</span>
            </span>
            {current === 'steal' && <PixelIcon name="check" className="ml-auto h-4 w-4 text-pink" />}
          </motion.button>
        </div>

        <div className="mt-auto space-y-2 pt-6 text-center">
          {error && <p className="rounded-2xl border border-pink/30 bg-pink/10 px-4 py-3 text-sm font-medium text-pink">{error}</p>}
          <p className="text-sm font-semibold">
            {gs.votes_cast} de {alive} han votado
          </p>
          <p className="text-xs text-ink/40">
            {timeUp ? 'Votación cerrada. Esperando al profesor…' : 'Puedes cambiar tu voto hasta que se acabe el tiempo. Si no votas, cuentas como «salimos todos».'}
          </p>
        </div>
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
        <Status icon="trophy" label="Traición" title="¡Te largaste solo!" tone="lime">
          <p className="font-semibold text-ink">Fuiste el único traidor: cruzaste la puerta y la sellaste tras de ti. Frío.</p>
        </Status>
      ) : (
        <Status icon="sword" label="Traición" title="Te traicionaron" tone="pink">
          <p>{winnerName ?? 'Un compañero'} fue el único en traicionar: escapó solo y los dejó atrás. Ouch.</p>
        </Status>
      )
  } else if (grp?.outcome === 'wiped') {
    head = (
      <Status icon="skull" label="Traición" title="Nadie salió" tone="pink">
        <p>Los traidores se anularon entre sí y el equipo se desmoronó. La codicia no paga.</p>
      </Status>
    )
  } else if (meElim) {
    head = (
      <Status icon="skull" label="Traición" title="Caíste" tone="pink">
        <p className="font-semibold text-pink">{me?.elimination_reason ?? 'Tu traición se anuló.'}</p>
      </Status>
    )
  } else {
    head = (
      <Status icon="logo" label="Traición" title="La puerta se selló" tone="ink">
        <p>No hubo un único traidor. Solo queda la <b className="text-ink">prueba final</b>.</p>
      </Status>
    )
  }

  return (
    <Narrow>
      {head}
      {votes.length > 0 && (
        <div className="card mt-4 p-5">
          <Label>Los votos</Label>
          <ul className="mt-3 divide-y divide-line text-sm">
            {votes.map((v) => (
              <li key={v.player_id} className="flex items-center justify-between py-2.5">
                <span className="font-semibold">{v.player_name}</span>
                <span className={`flex items-center gap-2 font-bold ${v.vote === 'steal' ? 'text-pink' : 'text-ink'}`}>
                  {v.vote === 'steal' ? <PixelIcon name="sword" className="h-4 w-4" /> : <Logo className="h-4 w-4" />}
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
    </Narrow>
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
      <Status icon="trophy" label="Prueba final" title="Ya escapaste" tone="lime">
        <p>Mientras tanto, otros equipos se juegan la última prueba. Sírvete algo de beber.</p>
      </Status>
    )
  }
  return (
    <Status icon="skull" label="Prueba final" title="Miras desde fuera" tone="pink">
      <p>{meElim ? 'Los equipos que sobrevivieron se juegan la prueba final.' : 'Tu equipo no llegó a la prueba final.'}</p>
    </Status>
  )
}

function TrialRevealView({ ctx }: { ctx: Ctx }) {
  const { grp, gs, game } = ctx
  const rv = game.reveal
  const extra = rv && (
    <div className="rounded-3xl border border-line bg-pale p-4 text-left text-sm leading-relaxed text-ink/80">
      <b className="text-ink">Respuesta: {LETTERS[rv.correct_index]}.</b> {rv.explanation}
    </div>
  )
  if (grp?.outcome === 'escaped') {
    return (
      <Status icon="trophy" label="Prueba final" title="¡Escaparon!" tone="lime">
        <p className="font-semibold text-ink">{survivors(gs).length} sobrevivientes cruzan la última puerta.</p>
        {extra}
      </Status>
    )
  }
  if (grp?.outcome === 'reset') {
    return (
      <Status icon="shield" label="Prueba final" title="Nivel cero" tone="pink">
        <p>Fallaron la prueba final: pierden todas las llaves y vuelven al principio. Así es la vida.</p>
        {extra}
      </Status>
    )
  }
  return (
    <Status icon="bolt" label="Prueba final" title="Prueba terminada">
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
      <Status icon="trophy" label="Misión cumplida" title="¡Escaparon!" tone="lime">
        <p>
          {me?.escaped ? 'Cruzaste la última puerta junto a tu equipo. Hoy sí hubo amistad.' : 'Tu equipo escapó, pero tú caíste por el camino. Un héroe caído.'}
        </p>
      </Status>
    )
  } else if (outcome === 'lone_winner') {
    head =
      grp?.winner_player_id === session.playerId ? (
        <Status icon="trophy" label="Misión cumplida" title="Escapaste solo" tone="lime">
          <p>Traicionaste a tu equipo y cruzaste la puerta. Tú ganaste. Ellos lo recordarán.</p>
        </Status>
      ) : (
        <Status icon="sword" label="Misión fallida" title="Te traicionaron" tone="pink">
          <p>Un compañero escapó solo. Nadie más salió.</p>
        </Status>
      )
  } else if (outcome === 'reset') {
    head = (
      <Status icon="shield" label="Misión fallida" title="Nivel cero" tone="pink">
        <p>Fallaron la prueba final y lo perdieron todo.</p>
      </Status>
    )
  } else if (outcome === 'wiped') {
    head = (
      <Status icon="skull" label="Misión fallida" title="Equipo aniquilado" tone="pink">
        <p>Nadie quedó con vida.</p>
      </Status>
    )
  } else {
    head = (
      <Status icon="door" label="Partida terminada" title="Fin del juego">
        <p>La partida terminó antes de completar todas las fases.</p>
      </Status>
    )
  }

  return (
    <Narrow>
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
    </Narrow>
  )
}
