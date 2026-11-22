import { useMemo, useState } from 'react'
import { Badge, Label } from '../../components/ui'
import type { Admin } from './useAdmin'

const LETTERS = ['A', 'B', 'C', 'D']

export default function Answers({ admin }: { admin: Admin }) {
  const [who, setWho] = useState('all')
  const [result, setResult] = useState<'all' | 'ok' | 'bad'>('all')
  const snap = admin.snap

  const rows = useMemo(() => {
    if (!snap) return []
    return snap.answers.filter(
      (a) => (who === 'all' || a.player_id === who) && (result === 'all' || (result === 'ok') === a.is_correct),
    )
  }, [snap, who, result])

  if (!snap) return <p className="mt-10 text-center text-ink/50">Crea una partida para ver respuestas.</p>
  const qs = new Map(snap.questions.map((q) => [q.pos, q]))
  const select = 'h-10 rounded-full bg-pale px-4 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue'

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-4">
        <Label>Respuestas ({rows.length})</Label>
        <div className="ml-auto flex flex-wrap gap-3">
          <select value={who} onChange={(e) => setWho(e.target.value)} className={select} aria-label="Filtrar por participante">
            <option value="all">Todos los participantes</option>
            {[...snap.players].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select value={result} onChange={(e) => setResult(e.target.value as 'all' | 'ok' | 'bad')} className={select} aria-label="Filtrar por resultado">
            <option value="all">Correctas e incorrectas</option>
            <option value="ok">Solo correctas</option>
            <option value="bad">Solo incorrectas</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="label text-ink/50">
            <tr>
              <th className="px-6 py-3">Participante</th>
              <th className="px-3 py-3">Pregunta</th>
              <th className="px-3 py-3">Modelo</th>
              <th className="px-3 py-3">Respuesta seleccionada</th>
              <th className="px-3 py-3">Respuesta correcta</th>
              <th className="px-3 py-3">Resultado</th>
              <th className="px-3 py-3">Tiempo</th>
              <th className="px-6 py-3 text-right">Puntos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((a) => {
              const q = qs.get(a.question_pos)
              return (
                <tr key={a.id}>
                  <td className="px-6 py-3 font-semibold">{a.player_name}</td>
                  <td className="px-3 py-3 tabular-nums">#{a.question_pos + 1}</td>
                  <td className="px-3 py-3">{q?.model ?? '—'}</td>
                  <td className="max-w-56 px-3 py-3">
                    <b className="mr-1.5 font-mono">{LETTERS[a.choice]}</b>
                    <span className="text-ink/70">{q?.options[a.choice]}</span>
                  </td>
                  <td className="max-w-56 px-3 py-3">
                    <b className="mr-1.5 font-mono">{q ? LETTERS[q.correct_index] : '?'}</b>
                    <span className="text-ink/70">{q?.options[q.correct_index]}</span>
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={a.is_correct ? 'lime' : 'pink'}>{a.is_correct ? 'Correcta' : 'Incorrecta'}</Badge>
                  </td>
                  <td className="px-3 py-3 tabular-nums">{(a.elapsed_ms / 1000).toFixed(1)} s</td>
                  <td className="px-6 py-3 text-right font-bold tabular-nums">{a.points}</td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-10 text-center text-ink/50">
                  No hay respuestas con esos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
