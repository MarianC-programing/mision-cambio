import { LogOut } from 'lucide-react'
import { useCallback, useState, type FormEvent } from 'react'
import { LogoTile, PixelIcon } from '../components/pixel'
import { Badge, Button, Label, Spinner } from '../components/ui'
import { adminQuestions } from '../lib/api'
import Answers from './admin/Answers'
import Control from './admin/Control'
import General from './admin/General'
import Groups from './admin/Groups'
import Participants from './admin/Participants'
import Questions from './admin/Questions'
import Ranking from './admin/Ranking'
import { STATUS_LABEL, useAdmin } from './admin/useAdmin'

const PIN_KEY = 'mision-cambio-admin-pin'
const TABS = [
  ['general', 'General'],
  ['control', 'Control'],
  ['participantes', 'Participantes'],
  ['grupos', 'Grupos'],
  ['respuestas', 'Respuestas'],
  ['ranking', 'Ranking'],
  ['preguntas', 'Preguntas'],
] as const
type Tab = (typeof TABS)[number][0]

export default function Admin() {
  const [pin, setPin] = useState(() => sessionStorage.getItem(PIN_KEY) ?? '')
  const logout = useCallback(() => {
    sessionStorage.removeItem(PIN_KEY)
    setPin('')
  }, [])
  return pin ? <Dashboard pin={pin} onLogout={logout} /> : <Gate onOk={(p) => { sessionStorage.setItem(PIN_KEY, p); setPin(p) }} />
}

function Gate({ onOk }: { onOk: (pin: string) => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await adminQuestions(value)
      onOk(value)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
      setBusy(false)
    }
  }
  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-5 p-6 sm:p-8">
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-pale">
          <PixelIcon name="lock" className="h-6 w-6" />
        </div>
        <h1 className="pixel t-h2">
          Panel <span className="text-ink/60">del profesor</span>
        </h1>
        <p className="text-sm text-ink/55">Solo quien tiene el PIN controla las puertas. (Y las vidas de sus compañeros.)</p>
        <label className="block">
          <Label>PIN de administrador</Label>
          <input
            type="password"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-line bg-pale px-4 font-mono outline-none focus:border-lime focus:ring-2 focus:ring-lime/30"
          />
        </label>
        {error && <p className="rounded-2xl border border-pink/30 bg-pink/10 px-4 py-3 text-sm font-medium text-pink">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy || !value}>
          {busy ? <Spinner /> : 'Entrar'}
        </Button>
      </form>
    </main>
  )
}

function Dashboard({ pin, onLogout }: { pin: string; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('general')
  const admin = useAdmin(pin, onLogout)
  const g = admin.snap?.game

  if (admin.loading) return <div className="grid min-h-dvh place-items-center"><Spinner /></div>

  return (
    <div className="mx-auto min-h-dvh max-w-7xl px-4 pb-16 pt-5 sm:px-6 sm:pt-6">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-3">
          <LogoTile className="h-11 w-11" />
          <div className="leading-tight">
            <p className="pixel text-[11px] sm:text-xs">Misión: Cambio</p>
            <Label className="mt-1.5 block text-[9px]">Panel de administración</Label>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 sm:gap-3">
          {g && <Badge tone="blue">Código {g.code}</Badge>}
          {g && <Badge tone={g.status === 'finished' ? 'pale' : 'lime'}>{STATUS_LABEL[g.status]}</Badge>}
          <Button variant="quiet" size="sm" onClick={onLogout}>
            <LogOut className="h-4 w-4" /> Salir
          </Button>
        </div>
      </header>

      <nav className="no-scrollbar -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" aria-label="Secciones del panel">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-current={tab === id}
            className={`pixel shrink-0 rounded-full border px-4 py-3 text-[10px] tracking-[0.06em] transition sm:px-5 ${
              tab === id ? 'border-lime text-ink' : 'border-transparent bg-pale text-grey hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {admin.error && (
        <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-pink/30 bg-pink/10 px-5 py-3 text-sm font-semibold text-pink">
          {admin.error}
          <button onClick={admin.clearError} className="underline">Cerrar</button>
        </div>
      )}

      <div className="mt-6">
        {tab === 'general' && <General admin={admin} />}
        {tab === 'control' && <Control admin={admin} />}
        {tab === 'participantes' && <Participants admin={admin} />}
        {tab === 'grupos' && <Groups admin={admin} />}
        {tab === 'respuestas' && <Answers admin={admin} />}
        {tab === 'ranking' && <Ranking admin={admin} />}
        {tab === 'preguntas' && <Questions admin={admin} />}
      </div>
    </div>
  )
}
