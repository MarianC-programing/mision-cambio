import { Plus, Users, Wifi } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Badge, Button, Label, TimerRing } from '../../components/ui'
import { useCountdown, useServerOffset } from '../../lib/clock'
import { isTimed, phaseTotalMs } from '../../lib/teams'
import { STATUS_LABEL, type Admin } from './useAdmin'

const LETTERS = ['A', 'B', 'C', 'D']

/** Milisegundos restantes de la fase en curso (puerta, votación o prueba final). */
export function useLiveTimer(admin: Admin) {
  const offset = useServerOffset()
  const g = admin.snap?.game
  return useCountdown(
    g && isTimed(g.status) ? (g.ends_at ?? null) : null,
    offset,
    g?.status === 'paused' ? (g.paused_remaining_ms ?? 0) : null,
  )
}

export default function General({ admin }: { admin: Admin }) {
  const ms = useLiveTimer(admin)
  const snap = admin.snap

  if (!snap) {
    return (
      <div className="card mx-auto mt-10 max-w-xl p-10 text-center">
        <Label>Sin partida activa</Label>
        <h2 className="pixel t-h1 mt-5">
          Crea la <span className="text-ink/45">partida.</span>
        </h2>
        <p className="mt-3 text-ink/60">Se generará un código y un QR para que los estudiantes entren desde el celular.</p>
        <Button className="mt-6" size="lg" onClick={() => void admin.createGame()} disabled={admin.busy}>
          <Plus className="h-5 w-5" /> Crear partida
        </Button>
      </div>
    )
  }

  const { game, players, group_answers: groupAnswers, groups, questions, finale_votes: votes } = snap
  const s = game.status
  const joinUrl = `${window.location.origin}/unirse?c=${game.code}`
  const q = questions.find((x) => x.pos === game.q_index)
  const connected = players.filter((p) => admin.online.has(p.id)).length

  const inDoor = s === 'question' || s === 'paused' || s === 'reveal'
  const inTrial = s === 'trial' || s === 'trial_reveal'
  const showQuestion = (inDoor || inTrial) && q
  const revealed = s === 'reveal' || s === 'trial_reveal'
  const answering = s === 'question' || s === 'paused' || s === 'trial'

  const expected = inTrial
    ? groups.filter((g) => g.outcome === 'trap').length
    : groups.filter((g) => !g.eliminated && g.outcome === null).length
  const answered = groupAnswers.filter((a) => a.question_pos === game.q_index).length

  const voting = groups.filter((g) => g.outcome === null)
  const voters = voting.reduce((n, g) => n + g.members.filter((m) => !m.eliminated).length, 0)

  const title =
    s === 'lobby' ? 'Puerta actual'
    : s === 'betrayal' || s === 'betrayal_reveal' ? 'La última puerta'
    : inTrial ? 'Prueba final'
    : s === 'finished' ? 'Partida terminada'
    : `Puerta ${game.q_index + 1} de ${game.q_total}`

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
            <p className="display mt-3 text-2xl leading-tight">{STATUS_LABEL[s]}</p>
          </div>
          <div className="card flex items-center gap-4 !border-lime !bg-lime p-5 text-black">
            <Users className="h-8 w-8" />
            <div>
              <Label className="!text-black/70">Participantes</Label>
              <p className="display text-4xl">{players.length}</p>
            </div>
          </div>
          <div className="card flex items-center gap-4 p-5">
            <Wifi className="h-8 w-8 text-lime" />
            <div>
              <Label>Conectados</Label>
              <p className="display text-4xl">{connected}</p>
            </div>
          </div>
        </div>

        <section className="card p-6">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <Label>{title}</Label>
              {showQuestion ? (
                <>
                  <div className="mt-2">
                    <Badge tone={inTrial ? 'pink' : 'purple'}>{q.model}</Badge>
                  </div>
                  <h3 className="display mt-3 text-3xl leading-[1.05] tracking-tight">{q.prompt}</h3>
                </>
              ) : s === 'betrayal' ? (
                <p className="display mt-3 text-3xl leading-[1.05]">Los sobrevivientes votan: ¿salimos todos o salgo yo solo?</p>
              ) : s === 'betrayal_reveal' ? (
                <p className="display mt-3 text-3xl leading-[1.05]">Mira el resultado de cada equipo en «Grupos».</p>
              ) : (
                <p className="display mt-3 text-3xl text-ink/30">{s === 'finished' ? 'Revisa el resultado en «Ranking»' : 'Aún no ha comenzado'}</p>
              )}
            </div>
            {(answering || s === 'betrayal') && (
              <div className="text-center">
                <TimerRing ms={ms} totalMs={phaseTotalMs(game)} size={128} paused={s === 'paused'} />
                <Label className="mt-2 block">{s === 'betrayal' ? 'Tiempo para votar' : 'Tiempo para escapar'}</Label>
              </div>
            )}
          </div>

          {showQuestion && (
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {q.options.map((o, i) => {
                const ok = i === q.correct_index
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold ${
                      ok ? (revealed ? 'bg-lime text-black' : 'bg-lime/25') : 'bg-pale'
                    }`}
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-white font-mono text-xs font-bold text-black">{LETTERS[i]}</span>
                    <span className="flex-1">{o}</span>
                    {game.reveal && revealed && <span className="label text-ink/60">{game.reveal.counts[i] ?? 0}</span>}
                  </div>
                )
              })}
            </div>
          )}

          {answering && showQuestion && (
            <Progress label="Equipos que respondieron" value={answered} total={expected} note="La opción con fondo verde claro es la correcta (solo tú la ves)." />
          )}
          {s === 'betrayal' && (
            <Progress label="Votos emitidos" value={votes.filter((v) => voting.some((g) => g.id === v.group_id)).length} total={voters} note="Los votos son secretos hasta que cierres la votación." />
          )}
        </section>
      </div>
    </div>
  )
}

function Progress({ label, value, total, note }: { label: string; value: number; total: number; note: string }) {
  return (
    <div className="mt-5">
      <div className="mb-1.5 flex justify-between">
        <Label>{label}</Label>
        <Label>
          {value} / {total}
        </Label>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-pale">
        <div className="h-full rounded-full bg-lime transition-all" style={{ width: `${total ? Math.min(100, (value / total) * 100) : 0}%` }} />
      </div>
      <p className="mt-2 text-xs text-ink/45">{note}</p>
    </div>
  )
}
