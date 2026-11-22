MISION: CAMBIO
==============

Escape room grupal para una exposicion universitaria sobre mantenimiento de software. Los estudiantes entran desde sus telefonos con un codigo o QR, se reparten al azar en equipos y el profesor controla la partida desde un panel de administrador en laptop.

Tecnologias
-----------

- React + Vite
- TypeScript
- Tailwind CSS
- Supabase (base de datos, Realtime y funciones RPC)
- Framer Motion (animaciones)
- Lucide React (iconos)
- Preparado para GitHub y Vercel

Como se juega
-------------

1. El servidor reparte a los participantes al azar en hasta 4 equipos equilibrados (rosa, azul, verde, amarillo).
2. 10 puertas, cada una con una pregunta facil y 25 segundos. El primer miembro del equipo que responde fija la respuesta de todos; no hay lider.
3. Si el equipo acierta, gana la llave de su color. Si falla o no responde, un miembro al azar queda eliminado con un mensaje dramatico y el equipo sigue con uno menos.
4. La ultima puerta (traicion). Cada sobreviviente vota en secreto "salimos todos" o "salgo yo solo":
   - Nadie traiciona: la puerta se sella y el equipo pasa a la prueba final.
   - Traiciona uno solo: sale en ese momento y gana; el resto queda eliminado.
   - Traicionan dos o mas: los traidores se anulan y caen; quienes cooperaron pasan a la prueba final.
   - Un unico sobreviviente: pasa directo a la prueba final.
   - Quien no vota a tiempo cuenta como "salimos todos".
5. Prueba final (1 pregunta, solo para los equipos clasificados). Acertar significa escapar. Fallar o no responder devuelve al equipo al nivel cero: pierde todas sus llaves.
6. Escapan los equipos que superan la prueba final y el traidor unico de un equipo, si lo hubo.

Con 10 puertas, un equipo de 7 personas necesita fallar 7 veces para quedar aniquilado, asi que normalmente llega a la ultima puerta con varios sobrevivientes. La votacion de traicion necesita al menos 2 sobrevivientes para tener sentido.

Administrador (laptop, ruta /admin):

- Crea la partida y muestra el codigo QR.
- Forma los equipos automaticamente cuando todos entraron.
- Un solo boton primario guia cada paso: iniciar, cerrar puerta, siguiente puerta, abrir la traicion, cerrar votacion, lanzar prueba final, ver resultado.
- Pausa y reanuda las puertas; puede terminar la partida en cualquier momento.
- Ve equipos, miembros, eliminados, votos (solo despues de cerrar la votacion) y respuestas en tiempo real.
- Correcciones manuales por equipo: eliminar a un miembro al azar o dar una llave.
- Edita las 11 preguntas (10 puertas + prueba final), sus opciones, respuestas correctas y explicaciones.

Las preguntas incluidas son faciles y tratan sobre: mantenimiento y sus tipos (correctivo, adaptativo, perfectivo, preventivo) y los modelos Quick-Fix, Boehm, Osborne, mejora iterativa y orientado a la reutilizacion. Son editables desde /admin.

Seguridad
---------

- El navegador solo usa la clave publica. Todo pasa por funciones RPC (SECURITY DEFINER) que validan en el servidor.
- Las respuestas correctas nunca llegan al telefono; se publican al revelar la puerta.
- Los votos de traicion no son legibles por nadie hasta que el administrador cierra la votacion.
- El estado privado de cada equipo se lee con un token por jugador, de modo que un equipo no ve a los demas.

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
pnpm test:sql Prueba el esquema SQL de extremo a extremo (requiere Docker)

Descripcion del repositorio
---------------------------

Configura esta descripción en GitHub (Settings -> General -> Description):

Escape room grupal para una dinamica educativa. Equipos de estudiantes responden desde el telefono, se traicionan o cooperan en la ultima puerta y el profesor controla la partida desde un panel de administrador. Construido con React, Vite, TypeScript, Tailwind CSS, Supabase, Framer Motion y Lucide React.
