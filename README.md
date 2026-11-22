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
3. **Última puerta**: cada sobreviviente vota en secreto *salimos todos* o *salgo yo solo*. Un único traidor escapa solo; si nadie traiciona, hay prueba final; si traicionan dos o más, se anulan.
4. **Prueba final**: una pregunta. Acertar es escapar; fallar manda al equipo al nivel cero.

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
