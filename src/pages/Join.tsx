import { motion } from 'framer-motion'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { LogoTile, PixelIcon } from '../components/pixel'
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

  const field =
    'mt-2 w-full rounded-2xl border border-line bg-pale px-4 text-ink outline-none transition focus:border-lime focus:ring-2 focus:ring-lime/30'

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-5 safe-b md:max-w-5xl md:px-8 md:pt-8">
      <header className="flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-3" aria-label="Volver al inicio">
          <LogoTile className="h-10 w-10" />
          <span className="pixel hidden text-[10px] sm:inline">Misión: Cambio</span>
        </Link>
        <Badge>10 puertas · en equipo</Badge>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-1 flex-col justify-center gap-10 py-10 md:grid md:grid-cols-2 md:items-center md:gap-14 lg:gap-20"
      >
        <div>
          <Label>Dinámica en vivo</Label>
          <h1 className="pixel mt-4 text-[clamp(1.25rem,6vw,1.9rem)] md:text-[clamp(1.25rem,4.4vw,3.25rem)]">
            Escape room
            <br />
            <span className="text-ink/60">Misión: Cambio</span>
          </h1>
          <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-ink/60 md:text-base">
            Responde en equipo, consigue las llaves y cuidado con quién confías en la última puerta.
          </p>
          <img
            src="/art/hero-poster.jpg"
            alt=""
            className="mt-10 hidden aspect-[4/3] w-full max-w-md rounded-[28px] border border-line object-cover object-[50%_40%] md:block"
          />
        </div>

        <form onSubmit={submit} className="card w-full space-y-5 p-5 sm:p-7 md:max-w-md md:justify-self-end">
          <label className="block">
            <Label>Código de partida</Label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="ABCDE"
              className={`${field} pixel h-16 text-center text-xl tracking-[0.35em]`}
            />
          </label>
          <label className="block">
            <Label>Tu nombre</Label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 24))}
              autoComplete="off"
              placeholder="¿Cómo te llamas?"
              className={`${field} h-14 text-lg font-semibold`}
            />
          </label>
          {error && <p className="rounded-2xl border border-pink/30 bg-pink/10 px-4 py-3 text-sm font-medium text-pink">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy || code.length < 5 || name.trim().length === 0}>
            {busy ? (
              <Spinner />
            ) : (
              <>
                Unirme a la partida <PixelIcon name="arrow" flip className="h-4 w-4" />
              </>
            )}
          </Button>
          <p className="text-center text-xs text-ink/60">Sin registro. Solo tu nombre. Tu equipo se asigna al azar (sí, puede tocarte quien no te cae bien).</p>
        </form>
      </motion.div>
    </main>
  )
}
