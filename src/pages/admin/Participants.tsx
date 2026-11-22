import { Trash2 } from 'lucide-react'
import { Badge, Label } from '../../components/ui'
import { sortPlayers } from '../../lib/clock'
import type { Admin } from './useAdmin'

export default function Participants({ admin }: { admin: Admin }) {
  const players = sortPlayers(admin.snap?.players ?? [])
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <Label>Participantes ({players.length})</Label>
        <Label>{players.filter((p) => admin.online.has(p.id)).length} conectados</Label>
      </div>
      <table className="w-full text-left text-sm">
        <thead className="label text-ink/50">
          <tr>
            <th className="px-6 py-3">Nombre</th>
            <th className="px-3 py-3">Puntuación</th>
            <th className="px-3 py-3">Respuestas correctas</th>
            <th className="px-3 py-3">Respondidas</th>
            <th className="px-3 py-3">Conexión</th>
            <th className="px-6 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {players.map((p) => {
            const on = admin.online.has(p.id)
            return (
              <tr key={p.id}>
                <td className="px-6 py-3 font-semibold">{p.name}</td>
                <td className="px-3 py-3 tabular-nums">{p.score}</td>
                <td className="px-3 py-3 tabular-nums">{p.correct_count}</td>
                <td className="px-3 py-3 tabular-nums">{p.answers_count}</td>
                <td className="px-3 py-3">
                  <Badge tone={on ? 'lime' : 'pale'}>
                    <span className={`h-2 w-2 rounded-full ${on ? 'bg-ink' : 'bg-ink/30'}`} />
                    {on ? 'Conectado' : 'Desconectado'}
                  </Badge>
                </td>
                <td className="px-6 py-3 text-right">
                  <button
                    title="Expulsar"
                    onClick={() => window.confirm(`¿Expulsar a ${p.name}?`) && void admin.removePlayer(p.id)}
                    className="rounded-full p-2 text-ink/40 transition hover:bg-pink/10 hover:text-pink"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            )
          })}
          {players.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-10 text-center text-ink/50">
                Aún no se ha unido nadie.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  )
}
