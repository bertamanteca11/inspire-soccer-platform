# Inspire Soccer — cambios solicitados por Susan (10/10/2026)

## Antes de desplegar

1. Haz una copia de seguridad de Supabase.
2. Ejecuta `supabase/2026_10_attendance_injuries.sql` en Supabase SQL Editor. **Necesario antes de usar los nuevos estados.** Si la columna `attendance.status` es un ENUM en vez de texto, detente y revisa el esquema antes de ejecutarlo.
3. En Windows, dentro del proyecto, ejecuta `npm install`, `npm run build`, `npm run dev` y prueba con una sesión de prueba sin confirmar.
4. Revisa en especial permisos RLS para que los entrenadores puedan registrar asistencia de jugadores no convocados; en algunos esquemas antiguos la asistencia puede estar limitada a convocados.
5. Tras verificar en local, sube el código a GitHub y comprueba el despliegue en Vercel.

## Cambios incluidos

- Asistencia para toda la plantilla activa y lesionada, incluidos no convocados; distingue ausencias justificadas y no justificadas y tres estados de lesión.
- Los lesionados y ausentes quedan excluidos de evaluaciones; los no convocados siguen excluidos porque Evaluación usa la lista de convocatoria.
- Evaluación por cualidad (por defecto) o por jugador; navegación junto al nombre.
- Comentario individual controlado por jugador, con guardado explícito y al avanzar.
- Jugadores con estado «Baja» ocultos por defecto; casilla para mostrarlos.

## Datos de Susan que deben revisarse manualmente

- Marcar **Ian Ben** y **Pol Pariente** como **Baja** en sus fichas (no se modifican registros de producción automáticamente).
- Añadir **Danzel** desde «Jugadores → Añadir jugador»; faltan datos de posición, fecha de nacimiento y dorsal.
- Revisar los registros históricos de 7 y 9 de octubre y asignar estados a Medi, Romano, Edu Montoro y José del Río. No se sobrescriben datos existentes automáticamente.
- Para «lesionado presente», seleccionar el estado correspondiente; el jugador no aparece en Evaluación.

## Limitaciones / revisión pendiente

No se ha podido ejecutar una prueba de integración real con Supabase. TypeScript compila; la construcción de Vite en este contenedor no se completó por faltar el binario nativo de Rollup para Linux (el ZIP trae dependencias de Windows). Ejecutar `npm install` en el equipo local.
