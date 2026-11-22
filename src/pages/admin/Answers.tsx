import { useMemo, useState } from 'react'
import { Badge, Label } from '../../components/ui'
import { teamHex, teamName } from '../../lib/teams'
import type { Admin } from './useAdmin'

const LETTERS = ['A', 'B', 'C', 'D']

export default function Answers({ admin }: { admin: Admin }) {
  const [team, setTeam] = useState('all')
  const [result, setResult] = useState<'all' | 'ok' | 'bad'>('all')
  const snap = admin.snap

  const qs = useMemo(() => new Map((snap?.questions ?? []).map((q) => [q.pos, q])), [snap?.questions])
  const colorOf = useMemo(() => new Map((snap?.groups ?? []).map((g) => [g.id, g.color])), [snap?.groups])

  const rows = useMemo(() => {
    if (!snap) return []
    return snap.group_answers.filter((a) => {
      const ok = a.choice === qs.get(a.question_pos)?.correct_index
      return (team === 'all' || a.group_id === team) && (result === 'all' || (result === 'ok') === ok)
    })
  }, [snap, qs, team, result])

  if (!snap) return <p className="mt-10 text-center text-ink/50">Crea una partida para ver respuestas.</p>
  const select = 'h-10 rounded-full bg-pale px-4 text-sm font-semibold outline-none focus:ring-2 focus:ring-lime'

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-4">
        <Label>Respuestas de los equipos ({rows.length})</Label>
        <div className="ml-auto flex flex-wrap gap-3">
          <select value={team} onChange={(e) => setTeam(e.target.value)} className={select} aria-label="Filtrar por equipo">
            <option value="all">Todos los equipos</option>
            {snap.groups.map((g) => (
              <option key={g.id} value={g.id}>
                Equipo {teamName(g.color)}
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
              <th className="px-6 py-3">Equipo</th>
              <th className="px-3 py-3">Puerta</th>
              <th className="px-3 py-3">Modelo</th>
              <th className="px-3 py-3">Respondió</th>
              <th className="px-3 py-3">Elegida</th>
              <th className="px-3 py-3">Correcta</th>
              <th className="px-6 py-3 text-right">Resultado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((a) => {
              const q = qs.get(a.question_pos)
              const ok = q ? a.choice === q.correct_index : false
              const color = colorOf.get(a.group_id)
              return (
                <tr key={a.id}>
                  <td className="px-6 py-3 font-semibold">
                    <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ backgroundColor: teamHex(color) }} />
                    {teamName(color)}
                  </td>
                  <td className="px-3 py-3 tabular-nums">{q?.kind === 'final' ? 'Final' : `#${a.question_pos + 1}`}</td>
                  <td className="px-3 py-3">{q?.model ?? '—'}</td>
                  <td className="px-3 py-3">{a.answered_by_name}</td>
                  <td className="max-w-56 px-3 py-3">
                    <b className="mr-1.5 font-mono">{LETTERS[a.choice]}</b>
                    <span className="text-ink/70">{q?.options[a.choice]}</span>
                  </td>
                  <td className="max-w-56 px-3 py-3">
                    <b className="mr-1.5 font-mono">{q ? LETTERS[q.correct_index] : '?'}</b>
                    <span className="text-ink/70">{q?.options[q.correct_index]}</span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Badge tone={ok ? 'lime' : 'pink'}>{ok ? 'Correcta' : 'Incorrecta'}</Badge>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-ink/50">
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
