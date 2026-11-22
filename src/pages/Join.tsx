import { motion } from 'framer-motion'
import { ArrowRight, Zap } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Button, Label, Spinner } from '../components/ui'
import { joinGame } from '../lib/api'
import { saveSession } from '../lib/clock'

export default function Join() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [code, setCode] = useState((params.get('c') ?? '').toUpperCase().slice(0, 5))
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      saveSession(await joinGame(code, name))
      nav('/play')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo entrar.')
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-10 safe-b">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-1 flex-col">
        <div className="flex items-center justify-between">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-blue text-lime">
            <Zap className="h-5 w-5" fill="currentColor" />
          </div>
          <Badge tone="lime">5 min · 5 puertas</Badge>
        </div>

        <div className="mt-14">
          <Label>Dinámica en vivo</Label>
          <h1 className="display mt-3 text-[64px] sm:text-7xl">
            ESCAPE ROOM
            <br />
            <span className="serif-i text-blue">misión: cambio.</span>
          </h1>
          <p className="mt-5 max-w-xs text-[15px] leading-relaxed text-ink/60">
            Encuentra los 5 códigos y escapa antes de que se acabe el tiempo.
          </p>
        </div>

        <form onSubmit={submit} className="card mt-10 space-y-4 p-5">
          <label className="block">
            <Label>Código de partida</Label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="ABCDE"
              className="mt-2 h-14 w-full rounded-2xl bg-pale px-4 text-center font-mono text-2xl font-semibold tracking-[0.4em] outline-none focus:ring-2 focus:ring-blue"
            />
          </label>
          <label className="block">
            <Label>Tu nombre</Label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 24))}
              autoComplete="off"
              placeholder="¿Cómo te llamas?"
              className="mt-2 h-14 w-full rounded-2xl bg-pale px-4 text-lg font-semibold outline-none focus:ring-2 focus:ring-blue"
            />
          </label>
          {error && <p className="rounded-2xl bg-pink/10 px-4 py-3 text-sm font-medium text-pink">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy || code.length < 5 || name.trim().length === 0}>
            {busy ? <Spinner /> : <>Unirme a la partida <ArrowRight className="h-5 w-5" /></>}
          </Button>
        </form>

        <p className="mt-auto pt-8 text-center text-xs text-ink/40">Sin registro. Solo tu nombre. 5 minutos para salir.</p>
      </motion.div>
    </main>
  )
}
