import { Eye, Flag, Pause, Play, Plus, RotateCw, ShieldAlert, SkipForward, Swords, Zap } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge, Button, Label, TimerRing } from '../../components/ui'
import { isTimed, OUTCOME_LABEL, phaseTotalMs, teamHex, teamName } from '../../lib/teams'
import { useLiveTimer } from './General'
import { STATUS_LABEL, type Admin } from './useAdmin'

export default function Control({ admin }: { admin: Admin }) {
  const ms = useLiveTimer(admin)
  const snap = admin.snap
  if (!snap) {
    return (
      <div className="card mx-auto mt-10 max-w-xl p-10 text-center">
        <p className="mb-5 text-ink/60">Primero crea una partida.</p>
        <Button onClick={() => void admin.createGame()} disabled={admin.busy}>
          <Plus className="h-5 w-5" /> Crear partida
        </Button>
      </div>
    )
  }

  const { game, players, groups, group_answers: answers, finale_votes: votes } = snap
  const s = game.status
  const b = admin.busy
  const isLastDoor = game.q_index + 1 >= game.q_total

  const alive = (g: (typeof groups)[number]) => g.members.filter((m) => !m.eliminated).length
  const doorAnswers = answers.filter((a) => a.question_pos === game.q_index).length
  const voting = groups.filter((g) => g.outcome === null)
  const voters = voting.reduce((n, g) => n + alive(g), 0)
  const voted = votes.filter((v) => voting.some((g) => g.id === v.group_id && g.members.some((m) => m.player_id === v.player_id && !m.eliminated))).length
  const trialTeams = groups.filter((g) => g.outcome === 'trap').length

  const hint: Record<typeof s, string> = {
    lobby: !players.length
      ? 'Esperando participantes. Muestra el QR de la pestaña General.'
      : groups.length
        ? 'Equipos formados. Revísalos en «Grupos» y pulsa «Iniciar partida».'
        : `Hay ${players.length} participante(s). Forma los equipos cuando todos hayan entrado.`,
    question: `Puerta abierta · han respondido ${doorAnswers} de ${groups.filter((g) => !g.eliminated).length} equipos. Ciérrala cuando quieras.`,
    paused: 'Partida en pausa: nadie puede responder. Reanuda para continuar el tiempo.',
    reveal: isLastDoor
      ? 'Última puerta de preguntas resuelta. Sigue LA ÚLTIMA PUERTA: la traición.'
      : 'Puerta resuelta: llaves entregadas y eliminaciones hechas. Avanza cuando quieras.',
    betrayal: `Los sobrevivientes votan en secreto · ${voted} de ${voters} han votado. Cierra la votación cuando termine el tiempo.`,
    betrayal_reveal: trialTeams
      ? `Traición resuelta. ${trialTeams} equipo(s) pasan a la prueba final.`
      : 'Traición resuelta. Ningún equipo clasificó: al continuar, la partida termina.',
    trial: 'Los equipos clasificados responden la prueba final. Ciérrala cuando terminen.',
    trial_reveal: 'Prueba final resuelta. Muestra el resultado final.',
    finished: 'La partida terminó. Puedes crear una nueva.',
  }

  let primary: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean; variant?: 'blue' | 'lime' | 'ink' | 'danger' } | null
  switch (s) {
    case 'lobby':
      primary = groups.length
        ? { label: 'Iniciar partida', icon: <Play className="h-5 w-5" fill="currentColor" />, onClick: () => void admin.start() }
        : { label: 'Formar equipos', icon: <Zap className="h-5 w-5" fill="currentColor" />, onClick: () => void admin.formGroups(), disabled: !players.length }
      break
    case 'question':
    case 'paused':
      primary = { label: 'Cerrar puerta y revelar', icon: <Eye className="h-5 w-5" />, onClick: () => void admin.reveal(), variant: 'lime' }
      break
    case 'reveal':
      primary = isLastDoor
        ? { label: 'Abrir la última puerta (traición)', icon: <Swords className="h-5 w-5" />, onClick: () => void admin.next(), variant: 'danger' }
        : { label: 'Siguiente puerta', icon: <SkipForward className="h-5 w-5" />, onClick: () => void admin.next(), variant: 'ink' }
      break
    case 'betrayal':
      primary = { label: 'Cerrar votación y revelar', icon: <Eye className="h-5 w-5" />, onClick: () => void admin.resolveBetrayal(), variant: 'danger' }
      break
    case 'betrayal_reveal':
      primary = trialTeams
        ? { label: 'Lanzar prueba final', icon: <ShieldAlert className="h-5 w-5" />, onClick: () => void admin.startTrial(), variant: 'ink' }
        : { label: 'Terminar partida', icon: <Flag className="h-5 w-5" />, onClick: () => void admin.startTrial(), variant: 'ink' }
      break
    case 'trial':
      primary = { label: 'Cerrar prueba final', icon: <Eye className="h-5 w-5" />, onClick: () => void admin.resolveTrial(), variant: 'lime' }
      break
    case 'trial_reveal':
      primary = { label: 'Ver resultado final', icon: <Flag className="h-5 w-5" />, onClick: () => void admin.next(), variant: 'ink' }
      break
    case 'finished':
      primary = { label: 'Nueva partida', icon: <Plus className="h-5 w-5" />, onClick: () => void admin.createGame() }
      break
  }

  const doorLabel =
    s === 'lobby' ? 'Sala'
    : s === 'betrayal' || s === 'betrayal_reveal' ? 'La última puerta'
    : s === 'trial' || s === 'trial_reveal' ? 'Prueba final'
    : s === 'finished' ? 'Fin'
    : `Puerta ${game.q_index + 1} de ${game.q_total}`

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <section className="card p-8">
        <Label>Estado: {STATUS_LABEL[s]}</Label>
        <p className="display mt-3 max-w-xl text-3xl leading-tight">{hint[s]}</p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {primary && (
            <Button
              size="lg"
              variant={primary.variant ?? 'blue'}
              className="sm:col-span-2"
              onClick={primary.onClick}
              disabled={b || primary.disabled}
            >
              {primary.icon} {primary.label}
            </Button>
          )}
          {s === 'lobby' && groups.length > 0 && (
            <Button size="lg" variant="quiet" onClick={() => void admin.formGroups()} disabled={b}>
              <Zap className="h-5 w-5" /> Reformar equipos
            </Button>
          )}
          {(s === 'question' || s === 'paused') && (
            <div className="grid grid-cols-2 gap-3 sm:col-span-2">
              <Button size="lg" variant="quiet" onClick={() => void admin.pause()} disabled={b || s !== 'question'}>
                <Pause className="h-5 w-5" /> Pausar
              </Button>
              <Button size="lg" variant="quiet" onClick={() => void admin.resume()} disabled={b || s !== 'paused'}>
                <RotateCw className="h-5 w-5" /> Reanudar
              </Button>
            </div>
          )}
          {s !== 'lobby' && s !== 'finished' && (
            <Button
              size="sm"
              variant="quiet"
              className="sm:col-span-2"
              disabled={b}
              onClick={() => window.confirm('¿Terminar la partida ahora? No se puede deshacer.') && void admin.finish()}
            >
              Terminar partida ahora
            </Button>
          )}
        </div>

        {s === 'lobby' && players.length > 0 && (
          <div className="mt-6 rounded-2xl border border-line bg-pale p-5">
            <Label>Participantes ({players.length})</Label>
            <div className="mt-3 flex flex-wrap gap-2">
              {players.map((p) => (
                <span key={p.id} className="rounded-full border border-line bg-canvas px-3 py-1.5 text-sm font-semibold">
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <aside className="card p-8">
        <div className="flex flex-col items-center text-center">
          <Label>{doorLabel}</Label>
          {isTimed(s) || s === 'paused' ? (
            <div className="mt-5">
              <TimerRing ms={ms} totalMs={phaseTotalMs(game)} size={150} paused={s === 'paused'} />
            </div>
          ) : (
            <p className="display mt-5 text-6xl text-ink/60">{s === 'finished' ? '🏁' : '—'}</p>
          )}
        </div>

        <div className="mt-6 space-y-2">
          <Label>Equipos ({groups.length})</Label>
          {groups.map((g) => (
            <div key={g.id} className="flex items-center gap-3 rounded-2xl bg-pale px-4 py-3">
              <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: teamHex(g.color) }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{teamName(g.color)}</p>
                <p className="text-xs text-ink/50">
                  {alive(g)}/{g.members.length} vivos · {g.key_count} llave{g.key_count === 1 ? '' : 's'}
                </p>
              </div>
              {g.outcome && <Badge tone={g.outcome === 'escaped' || g.outcome === 'lone_winner' ? 'lime' : g.outcome === 'trap' ? 'blue' : 'pink'}>{OUTCOME_LABEL[g.outcome]}</Badge>}
            </div>
          ))}
          {groups.length === 0 && <p className="text-sm text-ink/60">Aún no hay equipos.</p>}
        </div>

        <p className="mt-5 text-xs text-ink/60">
          Cada puerta dura {game.duration_ms / 1000} s. Al revelar: acierto = llave, fallo = cae un miembro al azar.
        </p>
      </aside>
    </div>
  )
}
