import { AnimatePresence, motion } from 'framer-motion'
import { LogOut } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Logo, LogoTile, PixelIcon, type PixelName } from '../components/pixel'
import { Badge, Button, Label, TimerRing } from '../components/ui'
import { ApiError, myGroupState, submitAccusation, submitDuelAnswer, submitGroupAnswer, submitVote } from '../lib/api'
import { clearSession, loadSession, useCountdown, useServerOffset } from '../lib/clock'
import { useGame, usePresenceTrack } from '../lib/realtime'
import { dramatize, isTimed, phaseTotalMs, survivors, teamHex, teamName, VARIANT_NAME } from '../lib/teams'
import type { FinaleVote, Game, Group, GroupMember, GroupState, Session, Vote } from '../lib/types'

const LETTERS = ['A', 'B', 'C', 'D']
/** Posición de la primera pregunta de la ronda difícil (la 10 es la del duelo). */
const HARD_BASE = 11

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
    case 'variant':
      body = <VariantView ctx={ctx} />
      break
    case 'variant_reveal':
      body = <VariantRevealView ctx={ctx} />
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
  const hardStage =
    ctx.game.status === 'trial' || ctx.game.status === 'trial_reveal' || [...have].some((p) => p >= HARD_BASE)
  const slots = hardStage
    ? Array.from({ length: ctx.game.hard_total }, (_, i) => HARD_BASE + i)
    : Array.from({ length: ctx.game.q_total }, (_, i) => i)
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5" aria-label={`${have.size} llaves`}>
      {slots.map((pos) => (
        <span
          key={pos}
          className={`grid h-6 w-6 place-items-center rounded-md border ${have.has(pos) ? 'border-transparent' : 'border-line bg-pale'}`}
          style={have.has(pos) ? { backgroundColor: teamHex(color) } : undefined}
        >
          {have.has(pos) && <PixelIcon name="key" className={`h-3.5 w-3.5 ${icon}`} />}
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
      <p className="mt-auto pt-8 text-xs text-ink/60">Respira. Mira a tu equipo. Decide a quién vigilar. La primera puerta está por abrirse…</p>
    </Narrow>
  )
}

/* ------------------------------------------------------------------ */
/* Puertas y prueba final                                              */
/* ------------------------------------------------------------------ */

function QuestionView({ ctx, mode = 'door' }: { ctx: Ctx; mode?: 'door' | 'trial' | 'duel' }) {
  const trial = mode === 'trial'
  const duel = mode === 'duel'
  const { game, gs, grp, session, remaining, refresh } = ctx
  const q = game.current_question
  const [pending, setPending] = useState<number | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    setPending(null)
    setError('')
  }, [game.q_index])

  if (!q) return null
  const answered = duel ? gs.my_duel_choice !== null : gs.answered
  const chosen = duel ? gs.my_duel_choice : gs.group_choice
  const timeUp = remaining === 0
  const canAnswer = !answered && !timeUp && pending === null

  const choose = async (i: number) => {
    if (!canAnswer) return
    setPending(i)
    setError('')
    try {
      if (duel) await submitDuelAnswer(session, game.q_index, i)
      else await submitGroupAnswer(session, game.q_index, i)
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
              <Label>{duel ? 'Duelo de traidores' : trial ? `Ronda difícil ${game.q_index - 10} de ${game.hard_total}` : `Puerta ${game.q_index + 1} de ${game.q_total}`}</Label>
              <div className="mt-2">
                <Badge tone={trial || duel ? 'pink' : 'purple'}>{q.model}</Badge>
              </div>
            </div>
          </div>
          <TimerRing ms={remaining} totalMs={phaseTotalMs(game)} size={84} />
        </div>

        {trial && (
          <p className="mb-2 rounded-2xl border border-pink/30 bg-pink/10 px-4 py-2.5 text-center text-xs font-semibold text-pink">
            Ronda difícil: cada error o silencio elimina a DOS de ustedes.
          </p>
        )}
        {duel && (
          <p className="mb-2 rounded-2xl border border-pink/30 bg-pink/10 px-4 py-2.5 text-center text-xs font-semibold text-pink">
            Duelo de velocidad: el primero en acertar escapa solo. Los demás traidores caen.
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
              {duel ? 'Elegiste' : 'Su equipo eligió'} <b>{chosen !== null ? LETTERS[chosen] : '?'}</b>
              {!duel && gs.answered_by ? ` (respondió ${gs.answered_by})` : ''}. Ahora a rezar…
            </p>
          ) : timeUp ? (
            <p className="rounded-2xl border border-orange/40 bg-orange/10 px-4 py-3 text-center text-sm font-semibold text-orange">
              Se acabó el tiempo. {duel ? 'No respondiste.' : 'Su equipo no respondió.'} La puerta tiene hambre.
            </p>
          ) : (
            <p className="text-center text-xs text-ink/60">
              {duel ? 'Responde rápido: solo cuenta el primero en acertar.' : 'El primero que responda decide por todo el equipo. Sí, incluso si se equivoca.'}
            </p>
          )}
          {!duel && <KeyBar ctx={ctx} />}
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
        {meElim && !iFell && me && <p className="text-center text-xs text-ink/60">Sigues fuera de juego.</p>}
      </div>

      <div className="mt-auto space-y-3 pt-6">
        <KeyBar ctx={ctx} />
        <p className="text-center text-xs text-ink/60">Siguen en pie: {survivors(gs).length} de {gs.members.length}</p>
      </div>
    </Narrow>
  )
}

/* ------------------------------------------------------------------ */
/* La última puerta: traición                                          */
/* ------------------------------------------------------------------ */

const NUDGES = [
  'Lo lógico es cruzar la puerta. Tu equipo ya lo está pensando.',
  'Si solo uno traiciona, los demás caen. ¿Vas a ser tú el que espera?',
  'Cooperar es la opción más cara: empiezan de cero.',
  'Nadie va a ver tu voto. Todavía.',
  '¿Y si ellos votan salir y tú no?',
]

/** Frase que rota cada pocos segundos para meter ruido en la cabeza. */
function useNudge(list: string[], ms = 4500) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % list.length), ms)
    return () => clearInterval(t)
  }, [list.length, ms])
  return list[i % list.length]
}

function VoteOption({ kind, active, disabled, highlight, onClick, icon, title, desc }: {
  kind: Vote
  active: boolean
  disabled: boolean
  highlight?: boolean
  onClick: () => void
  icon: ReactNode
  title: string
  desc: string
}) {
  const on = kind === 'steal' ? 'border-pink bg-pink/10' : 'border-lime bg-lime/10'
  const idle = highlight ? 'border-pink/50 bg-pink/5 enabled:hover:border-pink' : 'border-line bg-pale enabled:hover:border-white/30'
  return (
    <motion.button
      whileTap={!disabled ? { scale: 0.98 } : undefined}
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={`flex w-full items-center gap-4 rounded-3xl border-2 p-5 text-left transition disabled:cursor-default ${active ? on : idle} ${disabled && !active ? 'opacity-50' : ''}`}
    >
      {icon}
      <span>
        <span className="block text-lg font-extrabold">{title}</span>
        <span className="text-sm text-ink/60">{desc}</span>
      </span>
      {active && <PixelIcon name="check" className={`ml-auto h-4 w-4 shrink-0 ${kind === 'steal' ? 'text-pink' : 'text-lime'}`} />}
    </motion.button>
  )
}

/** Pantalla de voto compartida por la traición original y la segunda vuelta (variante B). */
function VotePanel({ ctx, label, title, lead, stealDesc, shareDesc, nudges }: {
  ctx: Ctx
  label: string
  title: ReactNode
  lead: ReactNode
  stealDesc: string
  shareDesc: string
  nudges: string[]
}) {
  const { game, gs, grp, remaining, session, refresh } = ctx
  const [pending, setPending] = useState<Vote | null>(null)
  const [error, setError] = useState('')
  const nudge = useNudge(nudges)
  useEffect(() => {
    setPending(null)
    setError('')
  }, [game.variant_round])

  const alive = gs.members.filter((m) => !m.eliminated && !m.escaped).length
  const timeUp = remaining === 0
  const current = pending ?? gs.my_vote

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

  return (
    <div className="flex flex-1 flex-col lg:grid lg:grid-cols-2 lg:items-center lg:gap-16">
      <div>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="space-y-2.5">
            <TeamChip color={grp?.color} />
            <Label className="block">{label}</Label>
          </div>
          <TimerRing ms={remaining} totalMs={phaseTotalMs(game)} size={84} />
        </div>

        <h2 className="pixel mt-5 text-[clamp(1.1rem,5.4vw,2.4rem)] leading-snug">{title}</h2>
        <p className="mt-4 text-sm leading-relaxed text-ink/60 md:text-base">{lead}</p>
        <p className="mt-4 rounded-2xl border border-pink/30 bg-pink/10 px-4 py-3 text-sm font-semibold text-pink" aria-live="off">
          {nudge}
        </p>
      </div>

      <div className="flex flex-1 flex-col lg:flex-none">
        <div className="mt-5 space-y-3 lg:mt-0">
          {/* La traición va primero: se presenta como la salida obvia. */}
          <VoteOption
            kind="steal"
            highlight
            active={current === 'steal'}
            disabled={timeUp}
            onClick={() => void vote('steal')}
            icon={<PixelIcon name="sword" className="h-10 w-10 shrink-0 text-pink" />}
            title="Salgo yo solo"
            desc={stealDesc}
          />
          <VoteOption
            kind="share"
            active={current === 'share'}
            disabled={timeUp}
            onClick={() => void vote('share')}
            icon={<Logo className="h-10 w-10 shrink-0" />}
            title="Salvarnos todos juntos"
            desc={shareDesc}
          />
        </div>

        <div className="mt-auto space-y-2 pt-6 text-center">
          {error && <p className="rounded-2xl border border-pink/30 bg-pink/10 px-4 py-3 text-sm font-medium text-pink">{error}</p>}
          <p className="text-sm font-semibold">
            {gs.votes_cast} de {alive} han votado
          </p>
          <p className="text-xs text-ink/60">
            {timeUp
              ? 'Votación cerrada. Esperando al profesor…'
              : 'Puedes cambiar tu voto hasta que se acabe el tiempo. Si no votas, cuentas como «salvarnos todos juntos».'}
          </p>
        </div>
      </div>
    </div>
  )
}

function BetrayalView({ ctx }: { ctx: Ctx }) {
  const { gs, grp, meElim } = ctx
  const alive = survivors(gs).length

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
  if (grp?.outcome === 'hard') {
    return (
      <Status icon="key" label="La última puerta" title="Estás solo" tone="ink">
        <p>Eres el único que sigue vivo en tu equipo: nadie a quien traicionar, nadie que te traicione.</p>
        <p className="font-semibold text-ink">Pasas directo a la ronda difícil, empezando de cero.</p>
      </Status>
    )
  }

  return (
    <VotePanel
      ctx={ctx}
      label="La última puerta"
      title={
        <>
          Solo una puerta. <span className="text-ink/60">Lo lógico es cruzarla.</span>
        </>
      }
      lead={
        <>
          Cada uno vota <b className="text-ink">en secreto</b>. Si todos se salvan juntos, la puerta se sella: empiezan de{' '}
          <b className="text-ink">cero</b> y nadie sale gratis.
        </>
      }
      stealDesc="La salida obvia. Si eres el único que traiciona, cruzas ahora mismo y ganas. Los demás se quedan."
      shareDesc="Empiezan de CERO: pierden todas las llaves y enfrentan preguntas MUCHO más difíciles. Cada error elimina a DOS."
      nudges={NUDGES}
    />
  )
}

function VotesList({ votes, fallen }: { votes: FinaleVote[]; fallen?: string[] }) {
  if (votes.length === 0) return null
  return (
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
      {fallen && fallen.length > 0 && <p className="mt-3 text-xs text-ink/60">Cayeron: {fallen.join(', ')}.</p>}
    </div>
  )
}

function BetrayalRevealView({ ctx }: { ctx: Ctx }) {
  const { grp, gs, me, meElim, session, game } = ctx
  const winnerName = gs.members.find((m) => m.player_id === grp?.winner_player_id)?.player_name
  const fallen = gs.eliminations.filter((e) => e.question_pos === game.q_total).map((e) => e.player_name)
  const variant = game.betrayal_variant
  const traitors = grp?.traitor_count ?? 0

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
        <p>El equipo se desmoronó. La codicia no paga.</p>
      </Status>
    )
  } else if (grp?.outcome === 'dispute') {
    head = (
      <Status icon="sword" label="Traición" title="Varios traidores" tone="pink">
        <p>
          Traicionaron <b className="text-ink">{traitors}</b> de ustedes. Nadie cruza la puerta todavía: se abre una disputa.
        </p>
        <p className="font-semibold text-ink">
          {variant ? `${VARIANT_NAME[variant]}.` : ''}{' '}
          {variant === 'A' && (gs.my_vote === 'steal' ? 'Te enfrentarás a los otros traidores en un duelo de velocidad.' : 'Los traidores se enfrentarán en un duelo de velocidad. Tú esperas.')}
          {variant === 'B' && 'Se repite la votación sin decir quiénes traicionaron. Tendrán que confiar otra vez… o no.'}
          {variant === 'C' && 'Cada uno señalará a quien crea que traicionó. Ojo: acusar a un inocente se paga.'}
        </p>
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
      <Status icon="lock" label="Traición" title="La puerta se selló" tone="ink">
        <p>Nadie traicionó… y por eso mismo no se abre gratis.</p>
        <p className="font-semibold text-ink">
          Empiezan de <b>cero</b>: pierden todas las llaves y juegan la ronda difícil. Cada error elimina a DOS.
        </p>
      </Status>
    )
  }

  return (
    <Narrow>
      {head}
      <VotesList votes={gs.votes} fallen={fallen} />
    </Narrow>
  )
}

/* ------------------------------------------------------------------ */
/* Variantes de la traición (A duelo · B segunda vuelta · C acusación) */
/* ------------------------------------------------------------------ */

function VariantView({ ctx }: { ctx: Ctx }) {
  const { game, grp, me, meElim } = ctx
  const inDispute = grp?.outcome === 'dispute' && !meElim && !me?.escaped
  if (!inDispute) return <VariantWaiting ctx={ctx} />
  if (game.betrayal_variant === 'A') return <DuelView ctx={ctx} />
  if (game.betrayal_variant === 'B') return <Revote ctx={ctx} />
  return <AccuseView ctx={ctx} />
}

function VariantWaiting({ ctx }: { ctx: Ctx }) {
  const { grp, me, meElim, game } = ctx
  const name = game.betrayal_variant ? VARIANT_NAME[game.betrayal_variant] : 'La variante'
  if (me?.escaped) {
    return (
      <Status icon="trophy" label={name} title="Ya escapaste" tone="lime">
        <p>Mientras tanto, otros equipos resuelven su traición. Sírvete algo de beber.</p>
      </Status>
    )
  }
  if (meElim) {
    return (
      <Status icon="skull" label={name} title="Miras desde fuera" tone="pink">
        <p>Quienes siguen vivos resuelven la disputa sin ti. Solo puedes mirar y juzgar.</p>
      </Status>
    )
  }
  if (grp?.outcome === 'wiped') {
    return (
      <Status icon="skull" label={name} title="Su equipo cayó" tone="pink">
        <p>No queda nadie en tu equipo.</p>
      </Status>
    )
  }
  return (
    <Status icon="key" label={name} title="Tu equipo espera" tone="ink">
      <p>Otros equipos resuelven una disputa por traición ({name}). Cuando terminen, empieza la ronda difícil.</p>
      <p className="font-semibold text-ink">Ustedes empiezan de cero.</p>
    </Status>
  )
}

/** Variante A: solo los traidores responden; el primero en acertar escapa solo. */
function DuelView({ ctx }: { ctx: Ctx }) {
  const { gs, remaining, game } = ctx
  const iAmTraitor = gs.my_vote === 'steal'
  if (iAmTraitor) return <QuestionView ctx={ctx} mode="duel" />
  const traitors = gs.votes.filter((v) => v.vote === 'steal').map((v) => v.player_name)
  return (
    <Status icon="sword" label="Duelo de traidores" title="Los traidores se enfrentan" tone="pink">
      <p>
        {traitors.length > 0 ? traitors.join(', ') : 'Los traidores'} responden una pregunta de velocidad. El primero en acertar escapa solo y los demás caen.
      </p>
      <p>Tú cooperaste: esperas a ver quién sobrevive.</p>
      <div className="flex justify-center">
        <TimerRing ms={remaining} totalMs={phaseTotalMs(game)} size={104} />
      </div>
    </Status>
  )
}

/** Variante B: se revela cuántos traicionaron, no quiénes, y se vota otra vez. */
function Revote({ ctx }: { ctx: Ctx }) {
  const { game, grp } = ctx
  const n = grp?.traitor_count ?? 0
  const last = game.variant_round >= 3
  return (
    <VotePanel
      ctx={ctx}
      label={`Segunda vuelta · votación ${game.variant_round}`}
      title={
        <>
          Hay traidores. <span className="text-ink/60">¿Y tú?</span>
        </>
      }
      lead={
        <>
          Traicionaron <b className="text-ink">{n}</b> de ustedes. No se sabe quiénes. Vuelvan a votar.
          {last && ' Es la última vuelta: si siguen traicionando dos o más, los traidores caen.'}
        </>
      }
      stealDesc="Si eres el único que traiciona esta vuelta, escapas solo y ganas. Los demás caen."
      shareDesc="Si nadie traiciona, empiezan de CERO en la ronda difícil. Cada error elimina a DOS."
      nudges={[
        'Ya sabes que hay traidores. ¿Seguro que quieres ser el que coopera?',
        'Si solo uno traiciona ahora, los demás caen.',
        'Nadie va a ver tu voto. Todavía.',
      ]}
    />
  )
}

/** Variante C: cada sobreviviente señala a quien cree que traicionó. */
function AccuseView({ ctx }: { ctx: Ctx }) {
  const { game, gs, grp, session, remaining, refresh } = ctx
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState('')
  const mates = gs.members.filter((m) => !m.eliminated && !m.escaped && m.player_id !== session.playerId)
  const current = pending ?? gs.my_accusation
  const timeUp = remaining === 0
  const n = grp?.traitor_count ?? 0

  const accuse = async (id: string) => {
    if (timeUp || pending) return
    setPending(id)
    setError('')
    try {
      await submitAccusation(session, id)
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
            <Label className="block">Acusación</Label>
          </div>
          <TimerRing ms={remaining} totalMs={phaseTotalMs(game)} size={84} />
        </div>
        <h2 className="pixel mt-5 text-[clamp(1.1rem,5.4vw,2.4rem)] leading-snug">
          ¿Quién fue? <span className="text-ink/60">Señala a uno.</span>
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-ink/60 md:text-base">
          Traicionaron <b className="text-ink">{n}</b> de ustedes. Si señalas a un traidor, la puerta lo expulsa. Pero{' '}
          <b className="text-ink">quien acuse a un inocente cae</b>.
        </p>
      </div>

      <div className="flex flex-1 flex-col lg:flex-none">
        <div className="mt-5 space-y-3 lg:mt-0">
          {mates.map((m) => {
            const on = current === m.player_id
            return (
              <motion.button
                key={m.player_id}
                whileTap={!timeUp ? { scale: 0.98 } : undefined}
                disabled={timeUp}
                onClick={() => void accuse(m.player_id)}
                aria-pressed={on}
                className={`flex w-full items-center gap-4 rounded-3xl border-2 p-5 text-left transition disabled:cursor-default ${
                  on ? 'border-pink bg-pink/10' : 'border-line bg-pale enabled:hover:border-white/30'
                } ${timeUp && !on ? 'opacity-50' : ''}`}
              >
                <PixelIcon name="sword" className="h-8 w-8 shrink-0 text-pink" />
                <span className="text-lg font-extrabold">{m.player_name}</span>
                {on && <PixelIcon name="check" className="ml-auto h-4 w-4 shrink-0 text-pink" />}
              </motion.button>
            )
          })}
          {mates.length === 0 && <p className="text-sm text-ink/60">No queda nadie a quien señalar.</p>}
        </div>
        <div className="mt-auto space-y-2 pt-6 text-center">
          {error && <p className="rounded-2xl border border-pink/30 bg-pink/10 px-4 py-3 text-sm font-medium text-pink">{error}</p>}
          <p className="text-xs text-ink/60">
            {timeUp ? 'Acusaciones cerradas. Esperando al profesor…' : 'Puedes cambiar tu elección hasta que se acabe el tiempo.'}
          </p>
        </div>
      </div>
    </div>
  )
}

function VariantRevealView({ ctx }: { ctx: Ctx }) {
  const { grp, gs, me, meElim, game } = ctx
  const variant = game.betrayal_variant
  const name = variant ? VARIANT_NAME[variant] : 'La variante'
  const fallen = gs.eliminations.filter((e) => e.question_pos === game.q_total).map((e) => e.player_name)
  const winnerName = gs.members.find((m) => m.player_id === grp?.winner_player_id)?.player_name

  let head: ReactNode
  if (me?.escaped) {
    head = (
      <Status icon="trophy" label={name} title="¡Escapaste solo!" tone="lime">
        <p className="font-semibold text-ink">
          {variant === 'A' ? 'Ganaste el duelo: fuiste el más rápido.' : 'Fuiste el único traidor en pie.'} Cruzas la puerta y la sellas tras de ti.
        </p>
      </Status>
    )
  } else if (grp?.outcome === 'lone_winner') {
    head = (
      <Status icon="sword" label={name} title="Te traicionaron" tone="pink">
        <p>{winnerName ?? 'Un compañero'} escapó solo y los dejó atrás.</p>
      </Status>
    )
  } else if (grp?.outcome === 'wiped') {
    head = (
      <Status icon="skull" label={name} title="Nadie salió" tone="pink">
        <p>La disputa terminó sin supervivientes. La codicia no paga.</p>
      </Status>
    )
  } else if (grp?.outcome === 'dispute') {
    head = (
      <Status icon="sword" label={name} title="Siguen empatados" tone="pink">
        <p>Todavía hay varios traidores y nadie sabe quiénes. Toca otra vuelta de votación.</p>
      </Status>
    )
  } else if (meElim) {
    head = (
      <Status icon="skull" label={name} title="Caíste" tone="pink">
        <p className="font-semibold text-pink">{me?.elimination_reason ?? 'La puerta te expulsó.'}</p>
      </Status>
    )
  } else if (grp?.outcome === 'hard') {
    head = (
      <Status icon="key" label={name} title="Siguen en pie" tone="ink">
        <p>La disputa se resolvió. Quienes quedan pasan a la ronda difícil.</p>
        <p className="font-semibold text-ink">Empiezan de cero: pierden todas las llaves y cada error elimina a DOS.</p>
      </Status>
    )
  } else {
    head = (
      <Status icon="bolt" label={name} title="Variante resuelta">
        <p>Esperando el siguiente paso del profesor…</p>
      </Status>
    )
  }

  return (
    <Narrow>
      {head}
      {variant === 'C' && gs.accusations.length > 0 && (
        <div className="card mt-4 p-5">
          <Label>Las acusaciones</Label>
          <ul className="mt-3 divide-y divide-line text-sm">
            {gs.accusations.map((a) => (
              <li key={`${a.accuser_name}-${a.suspect_name}`} className="py-2.5">
                <span className="font-semibold">{a.accuser_name}</span> señaló a <span className="font-semibold">{a.suspect_name}</span>
              </li>
            ))}
          </ul>
          {fallen.length > 0 && <p className="mt-3 text-xs text-ink/60">Cayeron: {fallen.join(', ')}.</p>}
        </div>
      )}
      {variant !== 'C' && <VotesList votes={gs.votes} fallen={fallen} />}
          </Narrow>
  )
}

/* ------------------------------------------------------------------ */
/* Ronda difícil                                                       */
/* ------------------------------------------------------------------ */

function TrialView({ ctx }: { ctx: Ctx }) {
  const { grp, meElim, me, game } = ctx
  const playing = grp?.outcome === 'hard' && !meElim && !me?.escaped
  if (playing) return <QuestionView ctx={ctx} mode="trial" />
  if (me?.escaped) {
    return (
      <Status icon="trophy" label="Ronda difícil" title="Ya escapaste" tone="lime">
        <p>Mientras tanto, otros equipos se juegan la ronda difícil. Sírvete algo de beber.</p>
      </Status>
    )
  }
  return (
    <Status icon="skull" label={`Ronda difícil ${game.q_index - 10} de ${game.hard_total}`} title="Miras desde fuera" tone="pink">
      <p>{meElim ? 'Los que siguen vivos se juegan la ronda difícil sin ti.' : 'Tu equipo no participa en esta ronda.'}</p>
    </Status>
  )
}

function TrialRevealView({ ctx }: { ctx: Ctx }) {
  const { grp, gs, game, me, meElim, session } = ctx
  const rv = game.reveal
  if (!rv) return null
  const inRound = grp?.outcome === 'hard' || grp?.outcome === 'wiped' || (grp?.outcome === 'lone_winner' && !me?.escaped)

  const choice = gs.group_choice
  const correct = choice !== null && choice === rv.correct_index
  const thisQ = gs.eliminations.filter((e) => e.question_pos === game.q_index)
  const iFell = thisQ.some((e) => e.player_id === session.playerId)
  const others = thisQ.filter((e) => e.player_id !== session.playerId)
  const left = survivors(gs).length

  return (
    <Narrow>
      <div className="mb-3 flex items-center justify-between">
        <TeamChip color={grp?.color} />
        <Label>Ronda difícil {game.q_index - 10} de {game.hard_total}</Label>
      </div>

      <div className="rounded-3xl bg-lime p-5 text-black md:p-6">
        <div className="flex items-center gap-3">
          <PixelIcon name="check" className="h-5 w-5" />
          <span className="font-bold">Respuesta correcta: {LETTERS[rv.correct_index]}</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-black/70 md:text-base">{rv.explanation}</p>
      </div>

      {inRound && (
        <div className="mt-4 space-y-3">
          {correct ? (
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-3xl border-2 p-5 text-center" style={{ borderColor: teamHex(grp?.color) }}>
              <PixelIcon name="key" className="mx-auto mb-3 h-9 w-9" />
              <p className="text-lg font-bold" style={{ color: teamHex(grp?.color) }}>¡Ganaron una llave {teamName(grp?.color)}!</p>
              <p className="text-sm text-ink/60">Nadie cae en esta pregunta.</p>
            </motion.div>
          ) : (
            <div className="rounded-3xl border border-pink/30 bg-pink/10 p-5 text-center">
              <PixelIcon name="shield" className="mx-auto mb-3 h-9 w-9 text-pink" />
              <p className="text-lg font-bold text-pink">{choice === null ? 'No respondieron a tiempo' : 'Fallaron la pregunta'}</p>
              <p className="text-sm text-ink/60">La ronda difícil se cobra a DOS de ustedes.</p>
            </div>
          )}
          {iFell && (
            <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} className="rounded-3xl border border-pink/40 bg-pink/10 p-6 text-center">
              <PixelIcon name="skull" className="mx-auto mb-4 h-12 w-12 text-pink" />
              <Label className="!text-ink/60">Eres de los elegidos</Label>
              <p className="display mt-3 text-3xl text-pink">{thisQ.find((e) => e.player_id === session.playerId)?.reason}</p>
            </motion.div>
          )}
          {others.map((e) => (
            <motion.p key={e.player_id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="rounded-2xl border border-pink/30 bg-pink/10 px-4 py-3 text-center text-sm font-bold text-pink">
              {dramatize(e.player_name, e.reason)}
            </motion.p>
          ))}
          {meElim && !iFell && <p className="text-center text-xs text-ink/60">Sigues fuera de juego.</p>}
          <div className="space-y-3 pt-2">
            <KeyBar ctx={ctx} />
            <p className="text-center text-xs text-ink/60">Siguen en pie: {left} de {gs.members.length}</p>
          </div>
        </div>
      )}
    </Narrow>
  )
}

/* ------------------------------------------------------------------ */
/* Final                                                               */
/* ------------------------------------------------------------------ */

function FinalView({ ctx }: { ctx: Ctx }) {
  const { grp, gs, me, session, game } = ctx
  const outcome = grp?.outcome ?? null
  const hardKeys = gs.keys.filter((k) => k.question_pos >= HARD_BASE).length

  let head: ReactNode
  if (outcome === 'escaped') {
    head = (
      <Status icon="trophy" label="Misión cumplida" title="¡Escaparon!" tone="lime">
        <p>
          {me?.escaped
            ? 'Sobreviviste a la ronda difícil y cruzaste la última puerta junto a tu equipo. Hoy sí hubo amistad.'
            : 'Tu equipo escapó, pero tú caíste por el camino. Un héroe caído.'}
        </p>
      </Status>
    )
  } else if (outcome === 'lone_winner' || me?.escaped) {
    head =
      grp?.winner_player_id === session.playerId || me?.escaped ? (
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
        <p>Perdieron todo.</p>
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
          <p className="mt-3 text-xs text-ink/60">
            {hardKeys} de {game.hard_total} llaves de la ronda difícil · {survivors(gs).length} de {gs.members.length} con vida
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
