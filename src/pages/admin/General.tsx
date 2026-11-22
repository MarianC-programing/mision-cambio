import { QRCodeSVG } from 'qrcode.react'
import { Plus, Users, Wifi } from 'lucide-react'
import { Badge, Button, Label, TimerRing } from '../../components/ui'
import { useCountdown, useServerOffset } from '../../lib/clock'
import { STATUS_LABEL, type Admin } from './useAdmin'

const LETTERS = ['A', 'B', 'C', 'D']

export function useLiveTimer(admin: Admin) {
  const offset = useServerOffset()
  const g = admin.snap?.game
  const ms = useCountdown(g?.status === 'question' ? (g.ends_at ?? null) : null, offset, g?.status === 'paused' ? (g.paused_remaining_ms ?? 0) : null)
  return ms
}

export default function General({ admin }: { admin: Admin }) {
  const ms = useLiveTimer(admin)
  const snap = admin.snap

  if (!snap) {
    return (
      <div className="card mx-auto mt-10 max-w-xl p-10 text-center">
        <Label>Sin partida activa</Label>
        <h2 className="display mt-3 text-5xl">
          Crea la <span className="serif-i text-blue">partida.</span>
        </h2>
        <p className="mt-3 text-ink/60">Se generará un código y un QR para que los estudiantes entren desde el celular.</p>
        <Button className="mt-6" size="lg" onClick={() => void admin.createGame()} disabled={admin.busy}>
          <Plus className="h-5 w-5" /> Crear partida
        </Button>
      </div>
    )
  }

  const { game, players, answers, questions } = snap
  const joinUrl = `${window.location.origin}/?c=${game.code}`
  const q = questions.find((x) => x.pos === game.q_index)
  const answered = answers.filter((a) => a.question_pos === game.q_index).length
  const connected = players.filter((p) => admin.online.has(p.id)).length
  const inQuestion = game.status === 'question' || game.status === 'paused'

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <section className="card flex flex-col items-center p-8 text-center">
        <Label>Entra con el QR o el código</Label>
        <div className="mt-5 rounded-3xl bg-white p-4 ring-1 ring-line">
          <QRCodeSVG value={joinUrl} size={220} level="M" />
        </div>
        <p className="display mt-6 font-mono text-6xl tracking-[0.15em]">{game.code}</p>
        <p className="mt-2 break-all text-xs text-ink/50">{joinUrl}</p>
      </section>

      <div className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-3">
          <div className="card p-5">
            <Label>Estado</Label>
            <p className="display mt-3 text-2xl leading-tight">{STATUS_LABEL[game.status]}</p>
          </div>
          <div className="card flex items-center gap-4 bg-lime p-5">
            <Users className="h-8 w-8" />
            <div>
              <Label className="!text-ink/70">Participantes</Label>
              <p className="display text-4xl">{players.length}</p>
            </div>
          </div>
          <div className="card flex items-center gap-4 p-5">
            <Wifi className="h-8 w-8 text-blue" />
            <div>
              <Label>Conectados</Label>
              <p className="display text-4xl">{connected}</p>
            </div>
          </div>
        </div>

        <section className="card p-6">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <Label>
                {game.status === 'lobby' ? 'Pregunta actual' : `Pregunta ${game.q_index + 1} de ${game.q_total}`}
              </Label>
              {q && game.status !== 'lobby' ? (
                <>
                  <div className="mt-2">
                    <Badge tone="purple">{q.model}</Badge>
                  </div>
                  <h3 className="display mt-3 text-3xl leading-[1.05] tracking-tight">{q.prompt}</h3>
                </>
              ) : (
                <p className="display mt-3 text-3xl text-ink/30">Aún no ha comenzado</p>
              )}
            </div>
            {game.status !== 'lobby' && game.status !== 'finished' && game.status !== 'reveal' && (
              <div className="text-center">
                <TimerRing ms={ms} totalMs={game.duration_ms} size={128} paused={game.status === 'paused'} />
                <Label className="mt-2 block">Temporizador</Label>
              </div>
            )}
          </div>

          {q && game.status !== 'lobby' && (
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {q.options.map((o, i) => {
                const show = game.status === 'reveal' || game.status === 'finished'
                const ok = i === q.correct_index
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold ${
                      ok ? (show ? 'bg-lime' : 'bg-lime/40') : 'bg-pale'
                    }`}
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink font-mono text-xs text-white">{LETTERS[i]}</span>
                    <span className="flex-1">{o}</span>
                    {game.reveal && game.status === 'reveal' && (
                      <span className="label text-ink/60">{game.reveal.counts[i] ?? 0}</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {inQuestion && (
            <div className="mt-5">
              <div className="mb-1.5 flex justify-between">
                <Label>Respuestas recibidas</Label>
                <Label>
                  {answered} / {players.length}
                </Label>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-pale">
                <div className="h-full rounded-full bg-blue transition-all" style={{ width: `${players.length ? (answered / players.length) * 100 : 0}%` }} />
              </div>
              <p className="mt-2 text-xs text-ink/45">La opción con fondo verde claro es la correcta (solo tú la ves).</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
