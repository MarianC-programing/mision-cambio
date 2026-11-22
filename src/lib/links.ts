/**
 * Dirección pública para compartir con los participantes (QR y enlace).
 *
 * Los despliegues individuales de Vercel (mision-cambio-abc123-usuario.vercel.app)
 * tienen "Vercel Authentication" activa por defecto: quien los abre ve el inicio
 * de sesión / registro de Vercel en lugar del juego. Por eso, si el administrador
 * abre el panel desde una de esas direcciones, el enlace compartido usa igualmente
 * el dominio público de producción.
 *
 * Para cambiar el dominio (por ejemplo, uno propio) define VITE_PUBLIC_URL en Vercel.
 */
const PRODUCTION_URL = (import.meta.env.VITE_PUBLIC_URL ?? 'https://mision-cambio.vercel.app').replace(/\/+$/, '')

export function publicOrigin(): string {
  const { origin, hostname } = window.location
  const onVercelDeployment = hostname.endsWith('.vercel.app') && origin !== PRODUCTION_URL
  return onVercelDeployment ? PRODUCTION_URL : origin
}

export const joinLink = (code: string) => `${publicOrigin()}/unirse?c=${encodeURIComponent(code)}`
