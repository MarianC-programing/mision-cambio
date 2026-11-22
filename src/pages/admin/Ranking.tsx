import { Label, Leaderboard, Podium } from '../../components/ui'
import { sortPlayers } from '../../lib/clock'
import type { Admin } from './useAdmin'

export default function Ranking({ admin }: { admin: Admin }) {
  const players = sortPlayers(admin.snap?.players ?? [])
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
      <section className="card p-8">
        <Label>Podio</Label>
        <div className="mt-8">
          <Podium players={players} />
        </div>
        <p className="mt-6 text-center text-xs text-ink/45">
          El ranking se actualiza al mostrar cada respuesta. Desempate: menor tiempo acumulado en aciertos.
        </p>
      </section>
      <section className="card overflow-hidden">
        <div className="border-b border-line px-6 py-4">
          <Label>Clasificación ({players.length})</Label>
        </div>
        <div className="max-h-[560px] overflow-y-auto">
          <Leaderboard players={players} />
        </div>
      </section>
    </div>
  )
}
