/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Dominio público para el QR y el enlace de los participantes (opcional). */
  readonly VITE_PUBLIC_URL?: string
}
