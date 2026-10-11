# Actualización Susan — seguridad de datos

NO publiques sin realizar primero copia de seguridad completa de Supabase y pruebas con una sesión de prueba.

1. SQL Editor: ejecutar `supabase/2026_10_attendance_injuries.sql` (amplía ENUM; no elimina datos).
2. Comprobar en SQL Editor: `SELECT unnest(enum_range(NULL::public.attendance_status));` y verificar que aparecen los tres valores nuevos.
3. En local: `npm install`, `npm run build`, `npm run dev`.
4. Revisar asistencia: ahora obliga a seleccionar un estado explícito para cada jugador y nunca asume que un no convocado está presente. La confirmación exige guardar todos los estados. El campo notas explica los motivos.
5. En evaluación solo aparecen jugadores convocados con asistencia presente/tarde. No se eliminan evaluaciones históricas al cambiar asistencia. Comprobar la sesión real antes de modificar nada.
6. Evaluación por cualidad aparece por defecto; también hay modo por jugador. Botones anterior/siguiente bajo el nombre.
7. Los jugadores con estado `inactive` se ocultan en la plantilla principal. NO se borran físicamente: así se conserva su historial. Para Ian Ben y Pol Pariente, marcar 'Baja' desde su ficha ANTES de que desaparezcan. Si ya desaparecieron, cambiar el estado desde Supabase Table Editor tras verificar sus identificadores.
8. Crear Danzel manualmente en la aplicación cuando Susan confirme nombre completo, dorsal y posición. NO se ha creado ningún jugador en producción.
9. Verificar los entrenamientos 7 y 9 octubre y los motivos de Edu Montoro, José del Río, Medi y Romano. NO se han cambiado datos reales automáticamente.
10. Después de probar, copiar código al clon GitHub, commit/push y comprobar despliegue Vercel.

ATENCIÓN: Este paquete NO se ha probado contra la base de datos real ni se ha podido ejecutar la compilación completa en este entorno. Si algo falla, detener despliegue.
