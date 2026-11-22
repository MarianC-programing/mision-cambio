import { Crown, Key } from 'lucide-react'
import { Badge, Label } from '../../components/ui'
import { OUTCOME_LABEL, teamHex, teamName } from '../../lib/teams'
import type { AdminGroup, GroupOutcome } from '../../lib/types'
import type { Admin } from './useAdmin'

const PRIORITY: Record<GroupOutcome | 'none', number> = { escaped: 0, lone_winner: 1, trap: 2, none: 2, reset: 3, wiped: 4 }
const alive = (g: AdminGroup) => g.members.filter((m) => !m.eliminated).length

export default function Ranking({ admin }: { admin: Admin }) {
  const snap = admin.snap
  if (!snap) return <p className="mt-10 text-center text-ink/50">Crea una partida para ver el ranking.</p>

  const sorted = [...snap.groups].sort(
    (a, b) =>
      PRIORITY[a.outcome ?? 'none'] - PRIORITY[b.outcome ?? 'none'] ||
      b.key_count - a.key_count ||
      alive(b) - alive(a),
  )
  const finished = snap.game.status === 'finished'
  const winners = sorted.filter((g) => g.outcome === 'escaped' || g.outcome === 'lone_winner')

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
      <section className="card p-8">
        <Label>{finished ? 'Ganadores' : 'Ganadores hasta ahora'}</Label>
        {winners.length === 0 ? (
          <p className="display mt-6 text-4xl text-ink/60">{finished ? 'Nadie escapó.' : 'Aún nadie ha escapado.'}</p>
        ) : (
          <div className="mt-6 space-y-4">
            {winners.map((g) => {
              const names =
                g.outcome === 'lone_winner'
                  ? g.members.filter((m) => m.player_id === g.winner_player_id).map((m) => m.player_name)
                  : g.members.filter((m) => m.escaped).map((m) => m.player_name)
              return (
                <div key={g.id} className="rounded-3xl p-5" style={{ backgroundColor: `${teamHex(g.color)}1f` }}>
                  <div className="flex items-center gap-3">
                    <Crown className="h-6 w-6" style={{ color: teamHex(g.color) }} fill="currentColor" />
                    <p className="display text-3xl">Equipo {teamName(g.color)}</p>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-ink/70">
                    {g.outcome === 'lone_winner' ? 'Escapó solo, traicionando al equipo: ' : 'Escaparon: '}
                    {names.join(', ')}
                  </p>
                </div>
              )
            })}
          </div>
        )}
        <p className="mt-6 text-xs text-ink/60">
          Escapan los equipos que superan la prueba final y el único traidor de un equipo, si hubo uno.
        </p>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-line px-6 py-4">
          <Label>Clasificación de equipos ({sorted.length})</Label>
        </div>
        <ol className="divide-y divide-line">
          {sorted.map((g, i) => (
            <li key={g.id} className="flex items-center gap-3 px-6 py-4">
              <span className="display w-7 text-xl text-ink/60">{i + 1}</span>
              <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: teamHex(g.color) }} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{teamName(g.color)}</p>
                <p className="text-xs text-ink/50">
                  {alive(g)}/{g.members.length} con vida
                </p>
              </div>
              <span className="flex items-center gap-1 text-sm font-bold tabular-nums">
                <Key className="h-4 w-4 text-ink/60" /> {g.key_count}
              </span>
              <Badge tone={g.outcome === 'escaped' || g.outcome === 'lone_winner' ? 'lime' : g.outcome === 'trap' ? 'blue' : g.outcome ? 'pink' : 'pale'}>
                {g.outcome ? OUTCOME_LABEL[g.outcome] : 'En juego'}
              </Badge>
            </li>
          ))}
          {sorted.length === 0 && <li className="px-6 py-10 text-center text-sm text-ink/50">Aún no hay equipos.</li>}
        </ol>
      </section>
    </div>
  )
}
