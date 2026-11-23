import { Check, Save, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge, Button, Label } from '../../components/ui'
import type { AdminQuestion } from '../../lib/types'
import type { Admin } from './useAdmin'

const LETTERS = ['A', 'B', 'C', 'D']
const field = 'w-full rounded-2xl bg-pale px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-lime'

export default function Questions({ admin }: { admin: Admin }) {
  const pending = admin.questions.some((q) => JSON.stringify(q).includes('[EDITAR]'))
  return (
    <div className="space-y-5">
      {pending && (
        <div className="flex items-start gap-3 rounded-3xl border border-yellow/30 bg-yellow/10 p-5 text-yellow text-sm font-semibold">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          Aún hay preguntas con texto de ejemplo «[EDITAR]». Escribe las que se explicaron en la exposición antes de iniciar.
          Las preguntas se leen al crear la partida; no puedes editar la que está en juego.
        </div>
      )}
      {admin.questions.map((q) => (
        <QuestionCard key={q.id} q={q} admin={admin} />
      ))}
    </div>
  )
}

function QuestionCard({ q, admin }: { q: AdminQuestion; admin: Admin }) {
  const [d, setD] = useState(q)
  const [saved, setSaved] = useState(false)
  useEffect(() => setD(q), [q])

  const dirty = JSON.stringify(d) !== JSON.stringify(q)
  const set = (patch: Partial<AdminQuestion>) => {
    setSaved(false)
    setD({ ...d, ...patch })
  }
  const setOpt = (i: number, v: string) => set({ options: d.options.map((o, k) => (k === i ? v : o)) })
  const valid = d.prompt.trim() && d.model.trim() && d.options.every((o) => o.trim())

  const save = async () => setSaved(await admin.saveQuestion(d))

  return (
    <section className="card p-6">
      <div className="flex items-center justify-between">
        <Badge tone={q.kind === 'door' ? 'blue' : 'pink'}>{q.kind === 'final' ? 'Duelo de traidores' : q.kind === 'hard' ? `Ronda difícil ${q.pos - 10}` : `Puerta ${q.pos + 1}`}</Badge>
        {dirty && <Label className="!text-orange">Cambios sin guardar</Label>}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr]">
        <label>
          <Label>Modelo</Label>
          <input className={`${field} mt-2`} value={d.model} onChange={(e) => set({ model: e.target.value })} />
        </label>
        <label>
          <Label>Pregunta</Label>
          <textarea className={`${field} mt-2`} rows={2} value={d.prompt} onChange={(e) => set({ prompt: e.target.value })} />
        </label>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {d.options.map((o, i) => (
          <label key={i} className="flex items-center gap-3 rounded-2xl bg-pale p-2 pr-3">
            <input
              type="radio"
              name={`correct-${q.id}`}
              checked={d.correct_index === i}
              onChange={() => set({ correct_index: i })}
              className="peer sr-only"
            />
            <span
              className={`grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl font-mono text-sm font-bold ${
                d.correct_index === i ? 'bg-lime text-black' : 'bg-canvas text-ink/60'
              }`}
              title="Marcar como correcta"
            >
              {d.correct_index === i ? <Check className="h-4 w-4" /> : LETTERS[i]}
            </span>
            <input
              className="min-w-0 flex-1 bg-transparent py-2 text-sm font-medium outline-none"
              value={o}
              placeholder={`Opción ${LETTERS[i]}`}
              onChange={(e) => setOpt(i, e.target.value)}
            />
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink/60">Pulsa la letra para marcar la respuesta correcta (verde).</p>
      <label className="mt-4 block">
        <Label>Explicación (se muestra al revelar)</Label>
        <textarea className={`${field} mt-2`} rows={2} value={d.explanation} onChange={(e) => set({ explanation: e.target.value })} />
      </label>
      <div className="mt-4 flex items-center justify-end gap-3">
        {saved && !dirty && <span className="text-sm font-semibold text-ink/60">✓ Guardada</span>}
        <Button onClick={() => void save()} disabled={!dirty || !valid}>
          <Save className="h-4 w-4" /> Guardar
        </Button>
      </div>
    </section>
  )
}
