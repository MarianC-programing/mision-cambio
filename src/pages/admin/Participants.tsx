import { Trash2 } from 'lucide-react'
import { Badge, Label } from '../../components/ui'
import { teamHex, teamName } from '../../lib/teams'
import type { Admin } from './useAdmin'

export default function Participants({ admin }: { admin: Admin }) {
  const snap = admin.snap
  const players = [...(snap?.players ?? [])].sort((a, b) => a.name.localeCompare(b.name))
  const info = new Map<string, { color: string; eliminated: boolean; escaped: boolean }>()
  for (const g of snap?.groups ?? []) {
    for (const m of g.members) info.set(m.player_id, { color: g.color, eliminated: m.eliminated, escaped: m.escaped })
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <Label>Participantes ({players.length})</Label>
        <Label>{players.filter((p) => admin.online.has(p.id)).length} conectados</Label>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="label text-ink/50">
          <tr>
            <th className="px-6 py-3">Nombre</th>
            <th className="px-3 py-3">Equipo</th>
            <th className="px-3 py-3">Estado</th>
            <th className="px-3 py-3">Conexión</th>
            <th className="px-6 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {players.map((p) => {
            const on = admin.online.has(p.id)
            const t = info.get(p.id)
            return (
              <tr key={p.id}>
                <td className="px-6 py-3 font-semibold">{p.name}</td>
                <td className="px-3 py-3">
                  {t ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: teamHex(t.color) }} />
                      {teamName(t.color)}
                    </span>
                  ) : (
                    <span className="text-ink/40">Sin equipo</span>
                  )}
                </td>
                <td className="px-3 py-3 text-xs font-bold">
                  {!t ? '—' : t.escaped ? 'Escapó' : t.eliminated ? <span className="text-pink">Eliminado</span> : <span className="text-lime">Vivo</span>}
                </td>
                <td className="px-3 py-3">
                  <Badge tone={on ? 'lime' : 'pale'}>
                    <span className={`h-2 w-2 rounded-full ${on ? 'bg-black' : 'bg-white/30'}`} />
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
              <td colSpan={5} className="px-6 py-10 text-center text-ink/50">
                Aún no se ha unido nadie.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </section>
  )
}
