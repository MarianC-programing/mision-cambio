import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { Logo, LogoTile, PixelIcon } from '../components/pixel'
import { Badge, btn, TimerRing } from '../components/ui'

/** Pastilla blanca en pixel: señal de "arcade" sobre los títulos. */
const SIGNPOST = 'pixel inline-flex rounded-full bg-white px-4 py-2.5 text-[10px] tracking-[0.1em] text-black'

export default function Landing() {
  const [params] = useSearchParams()
  const code = params.get('c')
  // Los QR antiguos apuntaban a /?c=CODIGO: los llevamos directo a la pantalla de entrada.
  if (code) return <Navigate to={`/unirse?c=${encodeURIComponent(code)}`} replace />

  return (
    <div id="top">
      <Hero />
      <SectionNav />
      <Marquee />
      <Manifesto />
      <MediaFrame />
      <Capabilities />
      <Screens />
      <Gallery />
      <Access />
      <Footer />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 1. Hero                                                             */
/* ------------------------------------------------------------------ */

const PHRASES = [
  'Tic, tac… te quedan 25 segundos.',
  'Spoiler: alguien de tu equipo va a traicionar.',
  'Las llaves no se piden prestadas.',
  'Aquí no hay salida de emergencia.',
  'Confía en tu equipo. Pero no tanto.',
  'Si fallas, la puerta cobra. Casi siempre a un compañero.',
  'Ningún bug fue maltratado en este juego. Tus amigos, sí.',
  '¿Tienes la llave? ¿Y el valor?',
]

/** Frases de escape room que rotan bajo el título. */
function Rotator() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % PHRASES.length), 3600)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="mt-8 flex min-h-[4.5rem] w-full max-w-md items-center justify-center" aria-hidden="true">
      <AnimatePresence mode="wait">
        <motion.p
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="glass pixel rounded-2xl px-5 py-3.5 text-[9px] leading-[1.9] text-white sm:text-[11px]"
        >
          {PHRASES[i]}
        </motion.p>
      </AnimatePresence>
    </div>
  )
}

function Hero() {
  const still = useReducedMotion()
  return (
    <header className="relative isolate flex min-h-svh flex-col overflow-hidden bg-[#1b6fd1]">
      {still ? (
        <img src="/art/hero-poster.jpg" alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
      ) : (
        <video
          className="absolute inset-0 -z-20 h-full w-full object-cover"
          src="/ciudad_flotante_loop.mp4"
          poster="/art/hero-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
        />
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/65 via-black/30 to-black/90" />

      <div className="safe-t flex items-center gap-3 px-4 pb-3 sm:px-8">
        <Link to="/" className="flex items-center gap-3" aria-label="MISIÓN: CAMBIO">
          <LogoTile className="h-10 w-10" />
          <span className="pixel text-[9px] text-white sm:text-[11px]">Misión: Cambio</span>
        </Link>
        <div className="ml-4 hidden items-center gap-3 sm:flex">
          <span className="h-5 w-px bg-white/25" />
          <span className="pixel text-[11px] text-white/80">Escape room</span>
          <Badge tone="pale">En vivo</Badge>
        </div>
        <Link to="/admin" className={btn('quiet', 'sm', 'ml-auto bg-black/40')}>
          <PixelIcon name="lock" className="h-3.5 w-3.5" /> Profesor
        </Link>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-24 pt-8 text-center">
        <p className="label mb-6 text-white/90 [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">Escape room en equipo · Mantenimiento de software</p>
        <h1 className="pixel t-hero pixel-shadow text-white">
          Misión:
          <br />
          Cambio
        </h1>
        <p className="mt-7 max-w-xl text-base leading-relaxed text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.9)] sm:text-lg">
          Abre 10 puertas con tu equipo, gana llaves y decide si confías en ellos cuando solo queda una.
        </p>
        <Link to="/unirse" className={btn('white', 'lg', 'mt-10')}>
          ¡Abrir la primera puerta! <PixelIcon name="arrow" flip className="h-4 w-4" />
        </Link>
        <Rotator />
      </div>
    </header>
  )
}

/** Cinta de frases entre el hero y el manifiesto. */
const TICKER = [
  'No hay salida de emergencia',
  'Las llaves no se piden prestadas',
  '10 puertas · 25 segundos cada una',
  'Solo uno sale… o todos',
  'El primero que responde decide por todos',
  'Nivel cero: pierdes todas las llaves',
  'No mires el celular del vecino',
]

function Marquee() {
  const items = [...TICKER, ...TICKER]
  return (
    <div className="overflow-hidden border-b border-line bg-black/40 py-4" aria-hidden="true">
      <ul className="marquee flex w-max items-center gap-8 pr-8">
        {items.map((t, k) => (
          <li key={k} className="flex items-center gap-8">
            <span className="pixel whitespace-nowrap text-[10px] text-grey">{t}</span>
            <span className="h-2 w-2 bg-white/30" />
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 2. Navegación fija                                                  */
/* ------------------------------------------------------------------ */

const LINKS = [
  ['Misión', '#mision'],
  ['Reglas', '#reglas'],
  ['Puertas', '#puertas'],
  ['Acceso', '#acceso'],
] as const

function SectionNav() {
  return (
    <nav className="sticky top-0 z-40 border-b border-line bg-canvas/80 pt-[env(safe-area-inset-top)] backdrop-blur-md" aria-label="Secciones">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-8">
        <a href="#top" aria-label="Inicio" className="shrink-0">
          <Logo className="h-7 w-7" />
        </a>
        <ul className="no-scrollbar flex flex-1 items-center justify-center gap-5 overflow-x-auto text-[13px] text-grey sm:gap-10 sm:text-[15px]">
          {LINKS.map(([label, href]) => (
            <li key={href}>
              <a href={href} className="block whitespace-nowrap py-2 transition hover:text-ink">
                {label}
              </a>
            </li>
          ))}
        </ul>
        <Link
          to="/unirse"
          aria-label="Unirme a la partida"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-ink transition hover:bg-white/10"
        >
          <PixelIcon name="key" className="h-4 w-4" />
        </Link>
      </div>
    </nav>
  )
}

/* ------------------------------------------------------------------ */
/* 3. Manifiesto                                                       */
/* ------------------------------------------------------------------ */

function Manifesto() {
  return (
    <section id="mision" className="scroll-mt-14 px-4 py-32 text-center sm:py-44">
      <h2 className="pixel mx-auto max-w-5xl text-[clamp(1.35rem,5.2vw,4.5rem)] leading-[1.28]">
        10 puertas.
        <br />
        Una traición.
      </h2>
      <p className="mx-auto mt-9 max-w-xl text-base leading-relaxed text-grey sm:text-lg">
        Tu equipo responde preguntas de mantenimiento de software contra el reloj. Cada error le cuesta un compañero. Y en la última
        puerta, lo único que importa es cuánto confías en los demás. (Spoiler: no deberías confiar tanto.)
      </p>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 4. Marco de medios                                                  */
/* ------------------------------------------------------------------ */

function MediaFrame() {
  return (
    <section className="px-4 pb-32 sm:px-8 sm:pb-44">
      <figure className="relative mx-auto aspect-video max-w-4xl overflow-hidden rounded-[24px] border border-line sm:rounded-[32px]">
        <img
          src="/art/doors.png"
          alt="Un pasillo con diez puertas de colores, numeradas del 1 al 10. La última brilla en rojo."
          loading="lazy"
          className="px-img h-full w-full object-cover"
        />
        <figcaption className="glass pixel absolute bottom-3 left-3 rounded-full px-4 py-2.5 text-[8px] text-white/85 sm:bottom-5 sm:left-5 sm:text-[10px]">
          Puerta 10 · la última
        </figcaption>
      </figure>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 5. Capacidades (pestañas)                                           */
/* ------------------------------------------------------------------ */

const CAPS = [
  {
    id: 'equipo',
    tab: 'En equipo',
    text: 'El sistema reparte a todos al azar en hasta cuatro equipos equilibrados: rojo, azul, verde y amarillo. En cada puerta responde quien se anime primero, y esa respuesta vale por todo el equipo. Si aciertan, ganan una llave. Si fallan, un compañero al azar queda fuera.',
    cta: 'Ver las puertas',
    href: '#puertas',
  },
  {
    id: 'traicion',
    tab: 'Traición',
    text: 'La última puerta se decide con un voto secreto: «salimos todos» o «salgo yo solo». Si nadie traiciona, el equipo pasa unido. Si traiciona uno solo, escapa y deja atrás a los demás. Si traicionan dos o más, se anulan entre sí.',
    cta: 'Entrar y comprobarlo',
    href: '/unirse',
  },
  {
    id: 'vivo',
    tab: 'En vivo',
    text: 'Los estudiantes juegan desde el celular con un código o un QR. El profesor lleva el ritmo desde su laptop: pausa, revela, da llaves o elimina, y ve las respuestas de cada equipo en tiempo real.',
    cta: 'Panel del profesor',
    href: '/admin',
  },
]

function Capabilities() {
  const [active, setActive] = useState(0)
  const cap = CAPS[active]
  const linkClass = 'mt-6 inline-block text-[15px] font-semibold text-ink underline underline-offset-4 transition hover:text-white/70'
  return (
    <section id="reglas" className="scroll-mt-14 px-4 pb-32 sm:px-8 sm:pb-44">
      <div role="tablist" aria-label="Capacidades" className="flex flex-wrap justify-center gap-2.5">
        {CAPS.map((c, i) => (
          <button
            key={c.id}
            role="tab"
            id={`tab-${c.id}`}
            aria-selected={i === active}
            aria-controls="cap-panel"
            onClick={() => setActive(i)}
            className={`pixel rounded-full border px-5 py-3.5 text-[10px] tracking-[0.08em] transition sm:px-7 sm:text-xs ${
              i === active ? 'border-lime text-ink' : 'border-transparent bg-pale text-grey hover:text-ink'
            }`}
          >
            {c.tab}
          </button>
        ))}
      </div>

      <div id="cap-panel" role="tabpanel" aria-labelledby={`tab-${cap.id}`} className="mx-auto mt-12 min-h-[230px] max-w-xl sm:min-h-[200px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={cap.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            <p className="text-base leading-relaxed text-ink/75 sm:text-lg">{cap.text}</p>
            {cap.href.startsWith('/') ? (
              <Link to={cap.href} className={linkClass}>
                {cap.cta}
              </Link>
            ) : (
              <a href={cap.href} className={linkClass}>
                {cap.cta}
              </a>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 6. Carrusel de pantallas (simuladas)                                */
/* ------------------------------------------------------------------ */

function Screens() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setI((v) => (v + 1) % 2), 8000)
    return () => clearTimeout(t)
  }, [i])

  return (
    <section className="px-4 pb-32 sm:px-8 sm:pb-44" aria-label="Pantallas de la aplicación">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[24px] border border-line bg-[#0e0e10] sm:rounded-[32px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -32 }}
            transition={{ duration: 0.3 }}
            className="flex min-h-[560px] items-center justify-center sm:min-h-[520px]"
          >
            {i === 0 ? <PlayerSlide /> : <AdminSlide />}
          </motion.div>
        </AnimatePresence>
      </div>
      <p className="mt-4 text-center text-[11px] text-grey/70">Pantallas simuladas. Pueden variar en la partida real.</p>
      <div className="mt-5 flex justify-center gap-2" role="group" aria-label="Elegir pantalla">
        {[0, 1].map((n) => (
          <button
            key={n}
            aria-label={`Pantalla ${n + 1}`}
            aria-current={n === i}
            onClick={() => setI(n)}
            className={`h-2 rounded-full transition-all duration-300 ${n === i ? 'w-7 bg-lime' : 'w-2 bg-white/25 hover:bg-white/40'}`}
          />
        ))}
      </div>
    </section>
  )
}

function Phone({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`w-[264px] shrink-0 rounded-[32px] border border-white/15 bg-canvas p-4 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] ${className}`}>
      <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-white/10" />
      {children}
    </div>
  )
}

function Opt({ letter, children, on = false }: { letter: string; children: ReactNode; on?: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl border-2 p-2.5 ${on ? 'border-lime bg-lime/10' : 'border-line bg-pale'}`}>
      <span className={`pixel grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[10px] ${on ? 'bg-lime text-black' : 'bg-white/10 text-ink'}`}>{letter}</span>
      <span className="flex-1 text-[13px] font-semibold">{children}</span>
      {on && <PixelIcon name="check" className="h-3.5 w-3.5 text-lime" />}
    </div>
  )
}

function PlayerSlide() {
  return (
    <div className="flex items-center justify-center gap-8 px-4 py-10 sm:gap-12 sm:py-14">
      <Phone className="sm:-rotate-2">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-pale px-2.5 py-1.5">
              <span className="h-3 w-3 rounded-full bg-[#ff3d86]" />
              <span className="label text-[8px] text-ink/70">Equipo Rojo</span>
            </span>
            <p className="label block text-[8px]">Puerta 3 de 10</p>
          </div>
          <TimerRing ms={17000} totalMs={25000} size={58} />
        </div>
        <p className="display mt-4 text-[17px] leading-[1.1] tracking-tight">¿Qué tipo de mantenimiento corrige fallos que ya se detectaron?</p>
        <div className="mt-4 space-y-2">
          <Opt letter="A">Perfectivo</Opt>
          <Opt letter="B" on>
            Correctivo
          </Opt>
          <Opt letter="C">Adaptativo</Opt>
          <Opt letter="D">Preventivo</Opt>
        </div>
        <p className="mt-4 text-center text-[10px] text-ink/45">El primero que responda decide por todo el equipo.</p>
      </Phone>

      <Phone className="mt-12 hidden rotate-2 sm:block">
        <p className="label text-[8px]">La última puerta</p>
        <p className="pixel mt-3 text-[13px] leading-snug">
          Solo una puerta. <span className="text-ink/45">¿Confías en ellos?</span>
        </p>
        <div className="mt-5 space-y-2.5">
          <div className="flex items-center gap-3 rounded-2xl border-2 border-lime bg-lime/10 p-3.5">
            <Logo className="h-7 w-7" />
            <span>
              <span className="block text-sm font-extrabold">Salimos todos</span>
              <span className="text-[11px] text-ink/55">Cooperar con el equipo.</span>
            </span>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border-2 border-line bg-pale p-3.5">
            <PixelIcon name="sword" className="h-7 w-7 text-pink" />
            <span>
              <span className="block text-sm font-extrabold">Salgo yo solo</span>
              <span className="text-[11px] text-ink/55">Traicionar y cruzar la puerta.</span>
            </span>
          </div>
        </div>
        <p className="mt-6 text-center text-xs font-semibold">3 de 4 han votado</p>
        <p className="mt-1 text-center text-[10px] text-ink/45">Votan en secreto.</p>
      </Phone>
    </div>
  )
}

/** QR de adorno (no es un código real). */
const QR = (() => {
  const n = 21
  let s = 4321
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
  const finder = (x: number, y: number) => (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12)
  const cells: Array<[number, number]> = []
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!finder(x, y) && rnd() > 0.5) cells.push([x, y])
  return { n, cells, origins: [[0, 0], [14, 0], [0, 14]] as const }
})()

function FakeQr() {
  return (
    <svg viewBox="-1 -1 23 23" shapeRendering="crispEdges" className="w-full rounded-xl bg-white p-0.5" aria-hidden="true">
      {QR.cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#0a0a0a" />
      ))}
      {QR.origins.map(([ox, oy]) => (
        <g key={`${ox}-${oy}`}>
          <rect x={ox} y={oy} width="7" height="7" fill="#0a0a0a" />
          <rect x={ox + 1} y={oy + 1} width="5" height="5" fill="#fff" />
          <rect x={ox + 2} y={oy + 2} width="3" height="3" fill="#0a0a0a" />
        </g>
      ))}
    </svg>
  )
}

const TEAMS = [
  ['#ff3d86', 'Rojo', '3/4 vivos · 2 llaves'],
  ['#3158f5', 'Azul', '4/4 vivos · 3 llaves'],
  ['#22c55e', 'Verde', '2/4 vivos · 1 llave'],
  ['#ffd51a', 'Amarillo', '4/4 vivos · 3 llaves'],
] as const

function AdminSlide() {
  return (
    <div className="w-full max-w-4xl p-4 sm:p-8">
      <div className="rounded-2xl border border-white/15 bg-canvas p-4 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <LogoTile className="h-9 w-9" />
          <div className="leading-tight">
            <p className="pixel text-[10px]">Misión: Cambio</p>
            <p className="label mt-1 text-[8px]">Panel de administración</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Badge tone="blue">Código K7QX2</Badge>
            <Badge tone="lime">Puerta abierta</Badge>
          </div>
        </div>
        <div className="mt-4 flex gap-2 overflow-hidden">
          {['General', 'Control', 'Grupos', 'Respuestas'].map((t, k) => (
            <span key={t} className={`pixel rounded-full border px-3.5 py-2 text-[8px] ${k === 1 ? 'border-lime text-ink' : 'border-transparent bg-pale text-grey'}`}>
              {t}
            </span>
          ))}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_260px]">
          <div className="card p-5">
            <p className="label text-[8px]">Puerta 3 de 10</p>
            <div className="mt-3 flex items-center gap-4">
              <TimerRing ms={17000} totalMs={25000} size={84} />
              <p className="display text-lg leading-tight">Puerta abierta · han respondido 3 de 4 equipos.</p>
            </div>
            <div className="pixel mt-5 rounded-full bg-lime px-5 py-3.5 text-center text-[9px] leading-snug text-black">Cerrar puerta y revelar</div>
            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              <div className="pixel rounded-full border border-line bg-pale py-3 text-center text-[8px] text-ink/70">Pausar</div>
              <div className="pixel rounded-full border border-line bg-pale py-3 text-center text-[8px] text-ink/30">Reanudar</div>
            </div>
          </div>
          <div className="card p-4">
            <p className="label text-[8px]">Equipos (4)</p>
            <div className="mt-3 space-y-2">
              {TEAMS.map(([hex, name, info]) => (
                <div key={name} className="flex items-center gap-3 rounded-xl bg-pale px-3 py-2.5">
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: hex }} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold">{name}</p>
                    <p className="text-[11px] text-ink/50">{info}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 hidden items-center gap-4 rounded-2xl border border-line bg-pale p-3 sm:flex">
          <div className="w-16 shrink-0">
            <FakeQr />
          </div>
          <p className="text-[13px] text-ink/60">Los estudiantes entran con el QR o con el código de 5 caracteres.</p>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 7. Galería de conceptos                                             */
/* ------------------------------------------------------------------ */

const CARDS = [
  { slug: 'correctivo', tag: 'Tipo', meta: 'Tipo de mantenimiento', title: 'Correctivo', desc: 'Corrige los fallos ya detectados.', handle: '#fallos' },
  { slug: 'adaptativo', tag: 'Tipo', meta: 'Tipo de mantenimiento', title: 'Adaptativo', desc: 'Ajusta el software a un nuevo entorno.', handle: '#entorno' },
  { slug: 'perfectivo', tag: 'Tipo', meta: 'Tipo de mantenimiento', title: 'Perfectivo', desc: 'Mejora lo que ya funciona y suma funciones.', handle: '#mejoras' },
  { slug: 'preventivo', tag: 'Tipo', meta: 'Tipo de mantenimiento', title: 'Preventivo', desc: 'Se adelanta a los fallos antes de que ocurran.', handle: '#anticipar' },
  { slug: 'quickfix', tag: 'Modelo', meta: 'Modelo de mantenimiento', title: 'Quick-Fix', desc: 'Arreglo rápido sobre el código, sin rediseñar.', handle: '#rapido' },
  { slug: 'boehm', tag: 'Modelo', meta: 'Modelo de mantenimiento', title: 'Boehm', desc: 'Decide según el costo y el beneficio.', handle: '#economia' },
  { slug: 'osborne', tag: 'Modelo', meta: 'Modelo de mantenimiento', title: 'Osborne', desc: 'Lo aprendido al mantener retroalimenta el ciclo.', handle: '#ciclo' },
  { slug: 'iterativa', tag: 'Modelo', meta: 'Modelo de mantenimiento', title: 'Mejora iterativa', desc: 'Cambia el sistema en ciclos pequeños.', handle: '#iterar' },
  { slug: 'reutilizacion', tag: 'Modelo', meta: 'Modelo de mantenimiento', title: 'Reutilización', desc: 'Reaprovecha componentes para cambiar más rápido.', handle: '#componentes' },
]

function Card({ c }: { c: (typeof CARDS)[number] }) {
  return (
    <article className="group relative aspect-[4/5] w-[240px] shrink-0 overflow-hidden rounded-[24px] border border-line transition duration-300 hover:-translate-y-1.5 sm:w-[320px] sm:rounded-[28px]">
      <img
        src={`/art/card-${c.slug}.png`}
        alt=""
        draggable={false}
        loading="lazy"
        className="px-img h-full w-full object-cover transition duration-500 group-hover:scale-105"
      />
      <span className="pixel absolute left-3 top-3 rounded-full bg-white px-3 py-1.5 text-[8px] tracking-[0.08em] text-black">{c.tag}</span>
      <div className="glass absolute inset-x-3 bottom-3 rounded-2xl p-3.5 sm:p-4">
        <p className="label text-[8px] text-white/60">{c.meta}</p>
        <h3 className="pixel mt-2 text-[11px] text-white sm:text-[13px]">{c.title}</h3>
        <p className="mt-1.5 text-[13px] leading-snug text-white/80">{c.desc}</p>
        <p className="mt-2 text-[11px] text-white/50">{c.handle}</p>
      </div>
    </article>
  )
}

function Gallery() {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef({ down: false, x: 0, left: 0 })

  // Arranca centrado para que las tarjetas se salgan por ambos lados.
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
  }, [])

  const row2 = [...CARDS.slice(4), ...CARDS.slice(0, 4)]

  return (
    <section id="puertas" className="scroll-mt-14 pb-32 sm:pb-44">
      <div className="px-4 text-center">
        <span className={SIGNPOST}>Temario</span>
        <h2 className="pixel mt-8 text-[11px] text-white sm:text-sm">Explora lo que se juega</h2>
        <p className="mx-auto mt-4 max-w-md text-base text-grey">
          Cuatro tipos de mantenimiento y cinco modelos aparecen en las puertas. Arrastra para recorrerlos.
        </p>
      </div>

      <div
        ref={ref}
        className="no-scrollbar mt-14 cursor-grab select-none overflow-x-auto overscroll-x-contain active:cursor-grabbing"
        onMouseDown={(e) => {
          drag.current = { down: true, x: e.pageX, left: ref.current?.scrollLeft ?? 0 }
        }}
        onMouseMove={(e) => {
          if (drag.current.down && ref.current) ref.current.scrollLeft = drag.current.left - (e.pageX - drag.current.x)
        }}
        onMouseUp={() => (drag.current.down = false)}
        onMouseLeave={() => (drag.current.down = false)}
      >
        <div className="flex w-max flex-col gap-4 px-6 py-2 sm:gap-5">
          <div className="flex gap-4 sm:gap-5">
            {CARDS.map((c) => (
              <Card key={c.slug} c={c} />
            ))}
          </div>
          <div className="flex gap-4 pl-[130px] sm:gap-5 sm:pl-[170px]" aria-hidden="true">
            {row2.map((c) => (
              <Card key={c.slug} c={c} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 8. Acceso                                                           */
/* ------------------------------------------------------------------ */

function Access() {
  return (
    <section id="acceso" className="scroll-mt-14 px-4 pb-32 text-center sm:pb-44">
      <span className={SIGNPOST}>Acceso</span>
      <h2 className="pixel t-h2 mx-auto mt-8 max-w-2xl">¿Listo para entrar?</h2>
      <p className="mx-auto mt-5 max-w-sm text-base text-ink/70">Última advertencia: la puerta no se abre sola.</p>
      <p className="mx-auto mt-6 max-w-sm text-[13px] leading-relaxed text-grey">
        Disponible solo mientras el profesor tenga una partida abierta.
      </p>
      <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-grey">
        Necesitas el código de 5 caracteres y tu nombre. Sin registro: tu equipo se asigna al azar.
      </p>
      <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link to="/unirse" className={btn('white', 'lg', 'w-full sm:w-auto')}>
          Unirme con código
        </Link>
        <Link to="/admin" className={btn('quiet', 'lg', 'w-full sm:w-auto')}>
          Soy el profesor
        </Link>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 9. Pie                                                              */
/* ------------------------------------------------------------------ */

function Footer() {
  return (
    <footer className="overflow-hidden border-t border-line pt-14">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:flex-row sm:justify-between sm:px-8">
        <span className="label text-grey">Relacionado</span>
        <ul className="flex flex-wrap gap-x-8 gap-y-2 text-[15px] sm:justify-end">
          <li>Mantenimiento de software</li>
          <li>Exposición universitaria</li>
          <li>
            <Link to="/admin" className="transition hover:text-white/70">
              Panel del profesor
            </Link>
          </li>
        </ul>
      </div>

      <p className="mx-auto mt-10 max-w-md px-4 text-center text-[13px] text-grey">
        Hecho para sufrir en equipo. Ningún compañero fue lastimado en la creación de esta página; en el juego, no prometemos nada.
      </p>

      <p aria-hidden="true" className="pixel select-none whitespace-nowrap py-14 text-center leading-none tracking-normal text-white sm:py-20" style={{ fontSize: '6.9vw' }}>
        Misión: Cambio
      </p>

      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Logo className="h-8 w-8" />
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-grey">
            <li><a href="#top" className="transition hover:text-ink">Inicio</a></li>
            <li><a href="#reglas" className="transition hover:text-ink">Reglas</a></li>
            <li><a href="#puertas" className="transition hover:text-ink">Temario</a></li>
            <li><Link to="/unirse" className="transition hover:text-ink">Entrar</Link></li>
            <li><Link to="/admin" className="transition hover:text-ink">Profesor</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  )
}
