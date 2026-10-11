# Inspire Soccer — actualización de evaluaciones y seguimiento semanal

## Cambios
- Valor 3 visual por defecto en ambos modos de evaluación.
- Al confirmar la evaluación, se guardan las puntuaciones 3 que falten de los jugadores evaluables, sin reemplazar valores existentes.
- Asistencia «Presente» por defecto cuando no existe registro previo. **Revisar los no convocados y lesionados antes de guardar**: este valor inicial NO significa que hayan asistido.
- Seguimiento semanal reorganizado: resumen, destacados, alertas, notas privadas y revisión mensual.
- Se mantienen los cambios anteriores de Susan: estados de lesión, evaluación por cualidad, navegación y comentarios individuales.

## Precauciones
1. Copia de seguridad de Supabase antes de editar datos reales.
2. Los nueve estados del ENUM `attendance_status` ya están añadidos en producción según las comprobaciones de la usuaria. **No ejecutar otra vez la migración anterior**.
3. Probar en una sesión de prueba. `localhost` puede apuntar a la base de datos de producción.
4. Ejecutar `npm install`, `npm run build` y `npm run dev` en Windows antes de publicar.
5. Probar el 3 por defecto y la confirmación en ambos modos. Comprobar en Supabase que se guardó y que una puntuación 2/4 existente se conserva.
6. Comprobar comentarios individuales, lesionados excluidos de evaluación y las notas privadas.
7. Solo después copiar archivos al clon de GitHub (excluyendo `.git`, `node_modules`, `dist`, `.env`) y publicar en Vercel.

## Estado de validación
La sintaxis de los TSX modificados se ha verificado con el compilador TypeScript. No ha sido posible ejecutar `npm run build` ni probar el flujo real con Supabase en este entorno por dependencias no instaladas. No se ha modificado la base de datos.
