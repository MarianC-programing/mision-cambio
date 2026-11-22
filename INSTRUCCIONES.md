# MISIÓN: CAMBIO — Guía de despliegue

Aplicación web para dinámica educativa competitiva (5 preguntas, 5 minutos).
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
| `games` | Estado de la partida, pregunta actual, temporizador, reveal | Solo lectura (Realtime) |
| `players` | Nombre, puntuación, aciertos, conexión | Solo lectura (Realtime) |
| `questions` | Las 5 preguntas, opciones, respuesta correcta, explicación | **Ninguno** (solo funciones admin) |
| `answers` | Respuestas de los participantes | **Ninguno** (solo RPC `submit_answer`) |
| `player_secrets` | Token secreto por jugador (valida una respuesta por pregunta) | **Ninguno** |
| `app_config` | Hash del PIN de administrador | **Ninguno** |

Todas las tablas tienen **RLS activo**. Las respuestas correctas nunca viajan al
teléfono; solo se publican en `games.reveal` cuando el admin las muestra.

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

## 5. Flujo de uso en la exposición

### Participantes (teléfono)

1. Escanean el QR o escriben el código de 5 caracteres (pestaña **General** del admin).
2. Escriben su nombre y se unen.
3. Esperan en la sala hasta que el admin inicie.
4. Responden 5 preguntas (30 s cada una, 100 pts + hasta 50 por rapidez).
5. Al final ven su puesto y puntuación.

### Administrador (laptop, ruta `/admin`)

1. Entra con el PIN de administrador.
2. **Preguntas**: edita modelo, pregunta, 4 opciones, respuesta correcta y explicación de cada una (las 5 modelos: Quick-Fix, Boehm, Osborne, mejora iterativa, reutilización).
3. **General**: crea la partida, muestra el QR y el código.
4. **Control**: Iniciar partida → avanza preguntas → pausa/reanuda → muestra respuesta correcta → siguiente → finalizar.
5. **Participantes**: tabla con nombre, puntuación, aciertos, estado de conexión; puede expulsar.
6. **Respuestas**: todas las respuestas con participante, pregunta, modelo, selección, correcta, resultado, tiempo y puntos; filtros por participante y por correcta/incorrecta.
7. **Ranking**: podio top 3 y clasificación completa en tiempo real.

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

- Fondo off-white `#f7f6f3`, texto near-black `#111111`.
- Tarjetas blancas con bordes suaves y radios grandes.
- Acentos: azul `#3158f5`, púrpura `#8337ed`, lima `#c8ff18`, naranja `#ff6b16`,
  rosa `#f72585`, amarillo `#ffd51a`, cian `#16c6e8`.
- Tipografía: Geist (sans) + Geist Mono + Instrument Serif (cursiva para énfasis).
- Participantes optimizado para móvil; dashboard para laptop.
- Respeta `prefers-reduced-motion`.
