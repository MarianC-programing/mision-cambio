import { Handshake, Swords } from 'lucide-react'
import { Badge, Button, Label } from '../../components/ui'
import { OUTCOME_LABEL, teamHex, teamName } from '../../lib/teams'
import type { Admin } from './useAdmin'

export default function Groups({ admin }: { admin: Admin }) {
  const snap = admin.snap
  if (!snap) return <p className="mt-10 text-center text-ink/50">Crea una partida para ver los equipos.</p>

  const { game, groups, finale_votes: allVotes } = snap
  const s = game.status
  const votesVisible = s === 'betrayal_reveal' || s === 'trial' || s === 'trial_reveal' || s === 'finished'
  const voteOf = new Map(allVotes.map((v) => [v.player_id, v]))
  const canFix = s === 'question' || s === 'paused' || s === 'reveal'

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <Label>Equipos ({groups.length})</Label>
        {s === 'lobby' && (
          <Button size="sm" onClick={() => void admin.formGroups()} disabled={admin.busy || snap.players.length === 0}>
            {groups.length ? 'Reformar equipos' : 'Formar equipos'}
          </Button>
        )}
      </div>

      {groups.length === 0 && (
        <div className="p-16 text-center text-ink/50">
          <p>No hay equipos aún. Cuando entren los participantes, pulsa «Formar equipos».</p>
        </div>
      )}

      <div className="divide-y divide-line">
        {groups.map((grp) => {
          const alive = grp.members.filter((m) => !m.eliminated).length
          const cast = grp.members.filter((m) => !m.eliminated && voteOf.has(m.player_id)).length
          const winner = grp.winner_player_id
          return (
            <div key={grp.id} className="px-6 py-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full" style={{ backgroundColor: teamHex(grp.color) }} />
                  <div>
                    <p className="font-semibold">Equipo {teamName(grp.color)}</p>
                    <Label>
                      {alive}/{grp.members.length} vivos · {grp.key_count} llave{grp.key_count === 1 ? '' : 's'}
                      {s === 'betrayal' && grp.outcome === null ? ` · ${cast}/${alive} votaron` : ''}
                    </Label>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canFix && (
                    <>
                      <Button
                        size="sm"
                        variant="quiet"
                        disabled={admin.busy}
                        onClick={() => window.confirm(`¿Eliminar a un miembro al azar del equipo ${teamName(grp.color)}?`) && void admin.eliminateMember(grp.id, game.q_index)}
                      >
                        Eliminar a uno
                      </Button>
                      <Button
                        size="sm"
                        variant="quiet"
                        disabled={admin.busy}
                        onClick={() => void admin.awardKey(grp.id, game.q_index)}
                      >
                        Dar llave
                      </Button>
                    </>
                  )}
                  {grp.outcome ? (
                    <Badge tone={grp.outcome === 'escaped' || grp.outcome === 'lone_winner' ? 'lime' : grp.outcome === 'trap' ? 'blue' : 'pink'}>
                      {OUTCOME_LABEL[grp.outcome]}
                    </Badge>
                  ) : (
                    <Badge tone="pale">En juego</Badge>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="label text-ink/50">
                    <tr>
                      <th className="px-4 py-3">Miembro</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                      <th className="px-4 py-3 text-center">Voto</th>
                      <th className="px-4 py-3 text-right">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {grp.members.map((m) => {
                      const v = voteOf.get(m.player_id)
                      return (
                        <tr key={m.id} className={m.eliminated ? 'bg-pink/5' : m.escaped ? 'bg-lime/30' : ''}>
                          <td className="px-4 py-3 font-semibold">
                            {m.player_name}
                            {winner === m.player_id && <span className="label ml-2 text-ink/50">traidor</span>}
                          </td>
                          <td className="px-4 py-3 text-center text-xs font-bold">
                            {m.escaped ? <span className="text-ink">Escapó</span> : m.eliminated ? <span className="text-pink">Eliminado</span> : <span className="text-blue">Vivo</span>}
                          </td>
                          <td className="px-4 py-3 text-center text-xs">
                            {!v ? '—' : !votesVisible ? 'Votó' : (
                              <span className={`inline-flex items-center gap-1 font-bold ${v.vote === 'steal' ? 'text-pink' : 'text-blue'}`}>
                                {v.vote === 'steal' ? <Swords className="h-3.5 w-3.5" /> : <Handshake className="h-3.5 w-3.5" />}
                                {v.vote === 'steal' ? 'Traicionó' : v.auto ? 'No votó' : 'Cooperó'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-xs italic text-ink/40">{m.elimination_reason ?? '—'}</td>
                        </tr>
                      )
                    })}
                    {grp.members.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-ink/50">Sin miembros.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
