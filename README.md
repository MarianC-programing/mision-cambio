MISION: CAMBIO
==============

Dinamica educativa competitiva para una exposicion universitaria. Dura 5 minutos y consta de 5 preguntas. Los estudiantes entran desde sus telefonos con un codigo o QR y el profesor controla la partida desde un panel de administrador en laptop.

Tecnologias
-----------

- React + Vite
- TypeScript
- Tailwind CSS
- Supabase (base de datos, Realtime y almacenamiento)
- Framer Motion (animaciones)
- Lucide React (iconos)
- Preparado para GitHub y Vercel

Flujo de la dinamica
--------------------

Participantes (telefono):

1. Escriben su nombre.
2. Se unen a la partida con el codigo de 5 caracteres.
3. Esperan el inicio.
4. Responden 5 preguntas (30 segundos cada una).
5. Reciben puntos y ven su posicion final.

No requieren registro de cuenta.

Administrador (laptop, ruta /admin):

- Crea la partida y muestra el codigo QR.
- Inicia, pausa, reanuda y finaliza la partida.
- Avanza entre preguntas y muestra la respuesta correcta.
- Ve participantes conectados, puntuaciones y respuestas en tiempo real.
- Edita las 5 preguntas, opciones, respuestas correctas y explicaciones.

Las 5 preguntas son configurables y tratan sobre:

1. Modelo Quick-Fix
2. Modelo de Boehm
3. Modelo de Osborne
4. Modelo de mejora iterativa
5. Modelo orientado a la reutilización

Puntuacion
----------

- 100 puntos por respuesta correcta.
- Hasta 50 puntos adicionales por rapidez.
- 0 puntos por respuesta incorrecta.
- Clasificacion automatica con desempate por tiempo acumulado.

Base de datos (Supabase)
------------------------

El archivo supabase/schema.sql contiene todo el esquema: tablas, políticas de seguridad (RLS), funciones RPC y Realtime.

Pasos:

1. Abre el SQL Editor en tu proyecto de Supabase.
2. Copia y pega el contenido de supabase/schema.sql.
3. Ejecuta la consulta.

El script es idempotente: se puede ejecutar más de una vez sin duplicar datos.

El PIN de administrador inicial es MISION2026. Cámbialo antes de la exposición si lo deseas.

Variables de entorno
--------------------

Crea un archivo .env en la raíz del proyecto con:

VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU-CLAVE-PUBLICA

Obtén ambos valores en Supabase -> Project Settings -> API.

En Vercel, agrega las mismas variables en Settings -> Environment Variables y vuelve a desplegar.

Despliegue en Vercel
--------------------

1. Conecta tu repositorio de GitHub en Vercel.
2. Importa el proyecto mision-cambio.
3. Framework preset: Vite.
4. Build command: pnpm build.
5. Output directory: dist.
6. Agrega las variables de entorno de Supabase.
7. Despliega.

Comandos locales
----------------

pnpm dev      Servidor de desarrollo
pnpm build    Build de producción
pnpm preview  Previsualizar el build localmente

Descripcion del repositorio
---------------------------

Configura esta descripción en GitHub (Settings -> General -> Description):

Aplicacion web para una dinamica educativa competitiva de 5 minutos y 5 preguntas. Estudiantes responden desde el telefono y el profesor controla la partida desde un panel de administrador. Construido con React, Vite, TypeScript, Tailwind CSS, Supabase, Framer Motion y Lucide React.
