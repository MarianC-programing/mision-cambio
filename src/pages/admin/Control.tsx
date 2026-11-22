import { Eye, Flag, Pause, Play, Plus, RotateCw, SkipForward, Square } from 'lucide-react'
import { Button, Label, TimerRing } from '../../components/ui'
import { STATUS_LABEL, type Admin } from './useAdmin'
import { useLiveTimer } from './General'

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
  const { game, players, answers } = snap
  const s = game.status
  const isLast = game.q_index + 1 >= game.q_total
  const answered = answers.filter((a) => a.question_pos === game.q_index).length
  const b = admin.busy

  const hint =
    s === 'lobby'
      ? players.length
        ? `Hay ${players.length} participante(s). Pulsa «Iniciar partida» cuando todos estén listos.`
        : 'Esperando participantes. Muestra el QR de la pestaña General.'
      : s === 'question'
        ? 'Pregunta abierta. Cuando quieras cerrarla, muestra la respuesta correcta.'
        : s === 'paused'
          ? 'Partida en pausa: nadie puede responder. Reanuda para continuar el tiempo.'
          : s === 'reveal'
            ? isLast
              ? 'Última respuesta mostrada. Pasa al resultado final.'
              : 'Respuesta mostrada. Avanza a la siguiente pregunta.'
            : 'La partida terminó. Puedes crear una nueva.'

  const finish = () => {
    if (window.confirm('¿Finalizar la partida ahora? Se calcularán los puntajes y se mostrará el resultado final.')) void admin.finish()
  }
  const fresh = () => {
    if (window.confirm('¿Crear una partida nueva? Los estudiantes necesitarán el nuevo código.')) void admin.createGame()
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <section className="card p-8">
        <Label>Estado: {STATUS_LABEL[s]}</Label>
        <p className="display mt-3 max-w-xl text-3xl leading-tight">{hint}</p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Button size="lg" onClick={() => void admin.start()} disabled={b || s !== 'lobby' || players.length === 0}>
            <Play className="h-5 w-5" fill="currentColor" /> Iniciar partida
          </Button>
          <Button size="lg" variant="lime" onClick={() => void admin.reveal()} disabled={b || (s !== 'question' && s !== 'paused')}>
            <Eye className="h-5 w-5" /> Mostrar respuesta correcta
          </Button>
          <Button size="lg" variant="ink" onClick={() => void admin.next()} disabled={b || s !== 'reveal'}>
            {isLast ? <Flag className="h-5 w-5" /> : <SkipForward className="h-5 w-5" />}
            {isLast ? 'Ver resultado final' : 'Siguiente pregunta'}
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Button size="lg" variant="quiet" onClick={() => void admin.pause()} disabled={b || s !== 'question'}>
              <Pause className="h-5 w-5" /> Pausar
            </Button>
            <Button size="lg" variant="quiet" onClick={() => void admin.resume()} disabled={b || s !== 'paused'}>
              <RotateCw className="h-5 w-5" /> Reanudar
            </Button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 border-t border-line pt-6">
          <Button variant="danger" onClick={finish} disabled={b || s === 'finished'}>
            <Square className="h-4 w-4" fill="currentColor" /> Finalizar partida
          </Button>
          <Button variant="quiet" onClick={fresh} disabled={b}>
            <Plus className="h-4 w-4" /> Nueva partida
          </Button>
        </div>
      </section>

      <aside className="card flex flex-col items-center p-8 text-center">
        <Label>{s === 'lobby' ? 'Puerta 0' : `Puerta ${game.q_index + 1} de ${game.q_total}`}</Label>
        {(s === 'question' || s === 'paused') ? (
          <div className="mt-5">
            <TimerRing ms={ms} totalMs={game.duration_ms} size={160} paused={s === 'paused'} />
          </div>
        ) : (
          <p className="display mt-5 text-6xl text-ink/20">{s === 'finished' ? '🏁' : '—'}</p>
        )}
        <div className="mt-6 w-full rounded-2xl bg-pale p-4">
          <Label>Respondieron</Label>
          <p className="display mt-1 text-4xl">
            {answered}
            <span className="text-ink/30"> / {players.length}</span>
          </p>
        </div>
        <p className="mt-4 text-xs text-ink/45">Duración por pregunta: {game.duration_ms / 1000} s · 100 pts + hasta 50 por rapidez</p>
      </aside>
    </div>
  )
}
