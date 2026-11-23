# MISIÓN: CAMBIO — Guía de despliegue

Escape room grupal para una dinámica educativa: equipos al azar, 10 puertas, votación de traición y ronda difícil.
Stack: React + Vite + TypeScript + Tailwind CSS + Supabase + Framer Motion + Lucide React.

---

## 1. Base de datos en Supabase (PASO OBLIGATORIO)

El schema no se puede aplicar por la API REST (requiere superusuario para crear
extensiones, políticas RLS y funciones `SECURITY DEFINER`). Debe ejecutarse desde
el **SQL Editor** del panel de Supabase.

### Pasos

1. Abre: https://supabase.com/dashboard/project/vjmolitrzczioyjnswub
2. Ve a **SQL Editor → New query**.
3. Copia el contenido completo de `supabase/schema.sql` y pégalo.
4. Pulsa **Run** (▶).
5. El script es **idempotente**: puedes volver a ejecutarlo tantas veces quieras.

### ¿Qué crea el schema?

| Tabla | Uso | Acceso público |
|-------|-----|----------------|
| `games` | Estado de la partida, fase, temporizador, pregunta actual y reveal | Solo lectura (Realtime) |
| `players` | Nombre y equipo de cada participante | Solo lectura (Realtime) |
| `groups`, `group_members` | Equipos, miembros, eliminados y fugados | **Ninguno** (solo `my_group_state` con token) |
| `group_answers`, `group_keys`, `eliminations` | Respuesta del equipo por puerta, llaves y eliminaciones | **Ninguno** |
| `finale_votes` | Votos secretos de la traición | **Ninguno** (se publican al cerrar la votación) |
| `questions` | 10 puertas + 1 pregunta de duelo + 5 de ronda difícil, con respuesta correcta y explicación | **Ninguno** (solo funciones admin) |
| `player_secrets` | Token secreto por jugador | **Ninguno** |
| `app_config` | Hash del PIN de administrador | **Ninguno** |

Todas las tablas tienen **RLS activo**. Las respuestas correctas nunca viajan al
teléfono; solo se publican en `games.reveal` cuando el admin las muestra.

> Si ya tenías una versión anterior instalada, vuelve a ejecutar `schema.sql`: migra
> sin perder datos. Las preguntas que ya editaste a mano se respetan.

### Cambiar el PIN de administrador

El PIN inicial es `MISION2026`. Cámbialo antes de la exposición:

```sql
update public.app_config
set value = extensions.crypt('TU-NUEVO-PIN', extensions.gen_salt('bf'))
where key = 'admin_pin_hash';
```

Hazlo desde el SQL Editor o desde la función `admin_save_question` una vez
entrado al panel.

---

## 2. Variables de entorno

El archivo `.env` ya está en el proyecto (no se sube a git):

```env
VITE_SUPABASE_URL=https://vjmolitrzczioyjnswub.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_s2mWmmnCN0rOLUPqcSf-vg_zFYC0gAq
```

- Obtén ambos valores en Supabase → **Project Settings → API**.
- `VITE_SUPABASE_ANON_KEY` es la clave pública (anon/publishable). Nunca pongas la
  `service_role` aquí.
- `.env.example` tiene la plantilla para compartir sin credenciales reales.

En **Vercel**: Project → Settings → Environment Variables → añade los mismos dos
nombres y vuelve a desplegar.

---

## 3. Subir a GitHub

Desde la carpeta del proyecto:

```bash
# Crear el repositorio en GitHub (web), sin inicializar con README.
# Luego, localmente:

git remote add origin https://github.com/TU-USUARIO/mision-cambio.git
git branch -M main
git push -u origin main
```

Si usas SSH:

```bash
git remote add origin git@github.com:TU-USUARIO/mision-cambio.git
git push -u origin main
```

El `.env` está en `.gitignore` y no se sube. Las credenciales se configuran en
Vercel por separado.

---

## 4. Desplegar en Vercel

1. Ve a https://vercel.com y conecta tu cuenta de GitHub.
2. **Add New Project → Import** → selecciona `mision-cambio`.
3. Framework preset: **Vite**.
4. Build Command: `pnpm build` (ya está en `vercel.json`).
5. Output Directory: `dist` (ya está en `vercel.json`).
6. En **Environment Variables**, añade:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
7. Despliega.

La app será una SPA; `vercel.json` ya incluye el rewrite de rutas para que
`/admin`, `/play` y `/` funcionen en recarga directa.

---

### Si a los participantes les pide iniciar sesión o crear una cuenta

Pasa cuando se comparte un **enlace de despliegue individual** de Vercel (los que tienen
un código en medio, tipo `mision-cambio-abc123-usuario.vercel.app`): esos traen
*Vercel Authentication* activa y muestran el inicio de sesión de Vercel.

- El QR y el enlace del panel admin ya usan siempre el dominio público
  `https://mision-cambio.vercel.app`, aunque abras el panel desde otra dirección.
  Si usas un dominio propio, define `VITE_PUBLIC_URL` en Vercel y vuelve a desplegar.
- Comparte solo ese dominio. Para que cualquier enlace de despliegue también sea público:
  Vercel → Project → Settings → **Deployment Protection** → desactiva *Vercel Authentication*.

## 5. Flujo de uso en la exposición

### Participantes (teléfono)

1. Escanean el QR o escriben el código de 5 caracteres (pestaña **General** del admin).
2. Escriben su nombre y se unen. Esperan en la sala.
3. Cuando el admin forma los equipos, ven su color y a sus compañeros.
4. **10 puertas** (25 s cada una): el primero del equipo que responde decide por todos. Acertar da una llave; fallar elimina a un miembro al azar.
5. **La última puerta**: cada sobreviviente vota en secreto *salgo yo solo* o *salvarnos todos juntos*. Un único traidor escapa solo; si nadie traiciona, el equipo empieza de cero (sin llaves) y pasa a la ronda difícil; si traicionan dos o más, se sortea una variante (duelo, segunda vuelta o acusación).
6. **Ronda difícil**: 5 preguntas difíciles de 25 s. Cada error elimina a dos miembros. Terminar con al menos un vivo es escapar.

### Administrador (laptop, ruta `/admin`)

1. Entra con el PIN de administrador.
2. **Preguntas**: revisa o edita las 10 puertas, la pregunta del duelo y las 5 de la ronda difícil antes de empezar.
3. **General**: crea la partida y muestra el QR en el proyector.
4. **Control**: cuando todos hayan entrado pulsa *Formar equipos* y luego *Iniciar partida*.
   Después, el botón grande siempre es el siguiente paso: *Cerrar puerta y revelar* → *Siguiente puerta*
   (×10) → *Abrir la última puerta* → *Cerrar votación y revelar* → (si hay disputa: *Lanzar: <variante>* →
   *Cerrar «<variante>» y revelar*, y *Otra vuelta de votación* en la segunda vuelta) → *Empezar la ronda difícil* →
   *Cerrar pregunta difícil* → *Siguiente pregunta difícil* (×5) → *Ver resultado final*.
5. **Grupos**: miembros, eliminados, votos (solo visibles tras cerrar la votación) y correcciones manuales.
6. **Participantes**: equipo, estado y conexión de cada uno; puede expulsar.
7. **Respuestas**: la respuesta de cada equipo por puerta, con quién la dio y si fue correcta.
8. **Ranking**: ganadores y clasificación de equipos.

> Tiempo aproximado: 10 puertas × 25 s + 45 s de votación + 5 preguntas difíciles × 25 s, más
> las pausas que tú decidas al mostrar cada resultado.

---

## 6. Comandos útiles

```bash
pnpm dev        # servidor de desarrollo (localhost:5173)
pnpm build      # build de producción
pnpm preview    # previsualizar el build localmente
pnpm typecheck  # comprobación de TypeScript
```

---

## 7. Diseño

- Tema oscuro `#0a0a0a` con líneas de escaneo tenues; texto blanco, gris `#9aa0a6`, acento lima `#d7f36a` solo para estados activos.
- Tipografía: Press Start 2P (pixel, títulos/botones/etiquetas) + Geist (cuerpo).
- Rutas: `/` landing (hero con `public/ciudad_flotante_loop.mp4`), `/unirse` entrada de jugadores, `/play` partida, `/admin` panel.
- Todo es responsivo: móvil en una columna; en tablet/escritorio la vista del jugador se expande a dos columnas.
- Logo: `public/mision-cambio.svg`. Los derivados (silueta blanca, favicon) y el arte pixel-art se generan con `python3 scripts/make-art.py` (requiere Pillow).
- Respeta `prefers-reduced-motion` (el hero usa el póster en lugar del video).
