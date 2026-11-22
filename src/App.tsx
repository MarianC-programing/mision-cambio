import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { isConfigured } from './lib/supabase'
import Join from './pages/Join'
import Landing from './pages/Landing'
import Play from './pages/Play'

const Admin = lazy(() => import('./pages/Admin'))

function SetupNotice() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl place-items-center px-6">
      <div className="card p-6 sm:p-8">
        <p className="label text-ink/55">Falta configuración</p>
        <h1 className="pixel t-h2 mt-4">
          Conecta <span className="text-ink/45">Supabase.</span>
        </h1>
        <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-ink/70">
          <li>Copia <code className="rounded bg-pale px-1.5">.env.example</code> a <code className="rounded bg-pale px-1.5">.env</code>.</li>
          <li>Rellena <b>VITE_SUPABASE_URL</b> y <b>VITE_SUPABASE_ANON_KEY</b> (Supabase → Project Settings → API).</li>
          <li>En Vercel: Project → Settings → Environment Variables, con los mismos nombres, y vuelve a desplegar.</li>
          <li>Reinicia <code className="rounded bg-pale px-1.5">pnpm dev</code>.</li>
        </ol>
      </div>
    </main>
  )
}

export default function App() {
  if (!isConfigured) return <SetupNotice />
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/unirse" element={<Join />} />
        <Route path="/play" element={<Play />} />
        <Route path="/admin" element={<Suspense fallback={null}><Admin /></Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
