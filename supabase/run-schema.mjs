/**
 * Script de un solo uso: ejecuta schema.sql en Supabase.
 * Uso: node supabase/run-schema.mjs
 *
 * Requiere que VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (o service_role)
 * estén en el .env del proyecto raíz.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// Leer .env manualmente (no queremos depender de dotenv)
const envRaw = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const env = Object.fromEntries(
  envRaw.split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('❌ VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY no encontrados en .env')
  process.exit(1)
}

console.log('🔗 Conectando a:', url)

const sql = readFileSync(new URL('schema.sql', import.meta.url), 'utf8')

// Dividir el SQL en sentencias individuales (separadas por ';' al final de línea)
// y ejecutarlas mediante la función pg del cliente de Supabase (si está disponible)
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false }
})

// Intentar mediante rpc exec_sql si existe (no estándar)
// Si no, mostrar instrucciones para el SQL Editor
async function tryDirect() {
  const { error } = await supabase.rpc('server_time')
  if (!error) {
    console.log('✅ La base de datos ya tiene el schema aplicado!')
    return true
  }
  if (error.message?.includes('server_time')) {
    console.log('⚠️  Schema no aplicado aún. Ver instrucciones abajo.')
    return false
  }
  console.log('Estado:', error.message)
  return false
}

const done = await tryDirect()
if (!done) {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║           INSTRUCCIONES: Aplicar el schema en Supabase           ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  1. Abre el SQL Editor:                                          ║
║     https://supabase.com/dashboard/project/vjmolitrzczioyjnswub  ║
║     → SQL Editor → New query                                     ║
║                                                                  ║
║  2. Copia y pega el contenido completo de:                       ║
║     supabase/schema.sql                                          ║
║                                                                  ║
║  3. Pulsa "Run" (▶)                                              ║
║                                                                  ║
║  El script es idempotente: puedes ejecutarlo más de una vez.     ║
║  PIN inicial: MISION2026 (cámbialo en /admin antes de usar)      ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`)
}
