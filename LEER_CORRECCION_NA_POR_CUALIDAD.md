# Corrección específica para Susan: N/A por cualidad y comentarios

- Cada cualidad permite 1, 2, 3, 4, 5 o N/A, en ambos modos de evaluación.
- N/A es reversible hasta confirmar la evaluación. No se muestra ningún bloque de «¿Jugó este partido?».
- Los promedios de la interfaz y los informes excluyen las cualidades N/A; si todas son N/A no se computa evaluación.
- Los comentarios de evaluaciones están asociados al ID del jugador y se mantienen separados al cambiar de jugador y al cargar datos.
- No se ha cambiado la lógica de tarjetas.

## Antes de abrir la versión
Ejecuta `supabase/2026_10_evaluation_na_per_quality.sql` una sola vez en Supabase SQL Editor. La columna anterior `not_applicable` se conserva por compatibilidad con registros previos.

## Prueba obligatoria antes de publicar
En una sesión de prueba: para un jugador pon 4, 3, N/A, 5 y comprueba el cálculo; cambia N/A por 2; cambia de jugador y vuelve; escribe comentarios diferentes en dos jugadores; recarga la página y verifica ambos. Prueba también el modo «por cualidad». No publiques sin ejecutar `npm install` y `npm run build` y comprobar el comportamiento en Supabase.

## Nota técnica
La columna `total_score` de la base de datos no se altera porque no conocemos su fórmula/trigger original. La aplicación calcula los promedios teniendo en cuenta N/A. Si otros servicios externos consultan `total_score` directamente, deben adaptar sus cálculos a `na_fields`.
