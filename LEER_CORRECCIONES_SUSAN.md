# Correcciones Susan (12 octubre 2026)

- Las tarjetas pendientes se guardan automáticamente al avanzar, retroceder, seleccionar otro jugador o confirmar la evaluación. Las tarjetas ya guardadas se consultan desde Supabase por jugador.
- El comentario de evaluación se mantiene en un borrador independiente por ID de jugador, se guarda al navegar y no se reescribe al recibir una recarga de datos. Attendance ya utiliza borradores separados por ID de jugador.
- N/A se mantiene para los jugadores convocados que no jugaron.

## Antes de publicar

1. Ejecuta `supabase/2026_10_evaluation_na.sql` en Supabase SQL Editor **si todavía no lo ejecutaste**.
2. `npm install` y `npm run build` en tu ordenador. La compilación no pudo verificarse aquí porque faltaban dependencias en la caché local.
3. Prueba con una sesión de prueba (sin alterar registros reales): jugador A tarjeta amarilla y comentario A, jugador B tarjeta distinta y comentario B, vuelve a A y comprueba datos; actualiza el navegador y verifica persistencia. Comprueba también los comentarios en Attendance.
4. Solo publica si todo funciona. No ejecutes migraciones antiguas del ZIP de nuevo.

Nota: las tarjetas ya guardadas son eventos y pueden existir varias por jugador; cambiar una selección nueva no elimina tarjetas históricas. Si la creación de una sanción falla, se informa del error y la tarjeta ya guardada no se duplica automáticamente.
