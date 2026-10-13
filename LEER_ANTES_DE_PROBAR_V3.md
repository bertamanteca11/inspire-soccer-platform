# Correcciones Susan v3 — instrucciones importantes

## 1. Antes de probar N/A
En Supabase > SQL Editor ejecuta **una sola vez** el contenido de `supabase/2026_10_evaluation_na.sql`.
El error `Could not find the 'not_applicable' column` indica que la columna aún no existe en la base de datos (o la caché no se ha actualizado).
Si la columna ya existe y el error persiste, ejecuta `NOTIFY pgrst, 'reload schema';` y espera unos segundos.

## 2. Tarjetas
El desplegable muestra la tarjeta ya guardada del jugador. Volver a entrar en el jugador sin cambios NO crea nuevas tarjetas.
Cambiar una amarilla existente actualiza ese registro en vez de insertar otro.
Una tarjeta roja requiere motivo. No se modifican automáticamente tarjetas rojas con sanciones ni se eliminan duplicados previos: requieren revisión manual.

## 3. Comentarios
Se mantienen independientes por player_id. Prueba dos jugadores diferentes, navega entre ellos y recarga la página.

## 4. Antes de publicar
Ejecuta `npm install`, `npm run build`, `npm run dev` y prueba en una sesión de prueba sin datos reales.
No publiques si aparece algún error o si hay tarjetas duplicadas preexistentes.
