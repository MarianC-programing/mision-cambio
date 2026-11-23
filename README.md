<p align="center"><img src="docs/logo.png" alt="Misión: Cambio" width="96"></p>

<h1 align="center">MISIÓN: CAMBIO</h1>

<p align="center">Escape room grupal sobre mantenimiento de software. 10 puertas, una traición.</p>

<p align="center">
  <a href="https://mision-cambio.vercel.app"><b>Jugar</b></a> ·
  <a href="https://mision-cambio.vercel.app/admin"><b>Panel de administrador</b></a>
</p>

## Admin

Entra a **[/admin](https://mision-cambio.vercel.app/admin)**, escribe la clave de administrador y listo: ahí creas la partida, muestras el QR y controlas cada paso.

## Cómo se juega

1. Los participantes entran con el QR o el código y se reparten al azar en 4 equipos.
2. **10 puertas**: una pregunta fácil por puerta. El primero que responde fija la respuesta de todo el equipo. Acertar da una llave; fallar elimina a un compañero al azar.
3. **Última puerta**: cada sobreviviente vota en secreto *salgo yo solo* o *salvarnos todos juntos*.
   - Si traiciona **uno solo**, escapa y gana; los demás caen.
   - Si **nadie** traiciona, el equipo empieza de cero (pierde todas las llaves) y pasa a la **ronda difícil**.
   - Si traicionan **dos o más**, el servidor sortea una variante para la partida: **duelo de traidores** (pregunta de velocidad, el primero en acertar escapa solo), **segunda vuelta** (se revela cuántos traicionaron y se vota otra vez) o **acusación** (cada uno señala a quien cree traidor). Los que cooperaron pasan a la ronda difícil.
4. **Ronda difícil**: 5 preguntas mucho más difíciles. Cada error o falta de respuesta elimina a **dos** miembros al azar. El equipo que termina con al menos un vivo escapa.

## Stack

React · Vite · TypeScript · Tailwind CSS · Supabase · Framer Motion · Vercel

## Puesta en marcha

```bash
pnpm install
cp .env.example .env   # URL y clave pública de Supabase
pnpm dev
```

1. Ejecuta `supabase/schema.sql` en el SQL Editor de Supabase (es idempotente).
2. Cambia la clave de administrador antes de usarlo en público (instrucciones al final del `schema.sql`).
3. En Vercel agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

`pnpm build` compila · `pnpm test:sql` prueba el esquema (requiere Docker). Más detalle en [INSTRUCCIONES.md](INSTRUCCIONES.md).
