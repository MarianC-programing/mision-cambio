import { LogOut, Lock, Zap } from 'lucide-react'
import { useCallback, useState, type FormEvent } from 'react'
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
    <main className="grid min-h-dvh place-items-center px-6">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-8">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-ink text-lime">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="display text-4xl">
          Panel <span className="serif-i text-blue">admin.</span>
        </h1>
        <label className="block">
          <Label>PIN de administrador</Label>
          <input
            type="password"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-2 h-12 w-full rounded-2xl bg-pale px-4 font-mono outline-none focus:ring-2 focus:ring-blue"
          />
        </label>
        {error && <p className="rounded-2xl bg-pink/10 px-4 py-3 text-sm font-medium text-pink">{error}</p>}
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
    <div className="mx-auto min-h-dvh max-w-7xl px-6 pb-16 pt-6">
      <header className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue text-lime">
            <Zap className="h-5 w-5" fill="currentColor" />
          </div>
          <div className="leading-tight">
            <p className="display text-xl">MISIÓN: <span className="serif-i text-blue">cambio</span></p>
            <Label>Panel de administración</Label>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {g && <Badge tone="blue">Código {g.code}</Badge>}
          {g && <Badge tone={g.status === 'finished' ? 'pale' : 'lime'}>{STATUS_LABEL[g.status]}</Badge>}
          <Button variant="quiet" size="sm" onClick={onLogout}>
            <LogOut className="h-4 w-4" /> Salir
          </Button>
        </div>
      </header>

      <nav className="mt-6 flex flex-wrap gap-2">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
              tab === id ? 'bg-ink text-white' : 'bg-pale text-ink hover:bg-[#e4e1db]'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {admin.error && (
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-pink/10 px-5 py-3 text-sm font-semibold text-pink">
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
