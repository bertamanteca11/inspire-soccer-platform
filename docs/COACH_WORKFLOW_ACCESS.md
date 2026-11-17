# Convocatoria, asistencia y evaluación para Admin y Coach

Cambio del 17/11/2026: ambas clases de cuenta pueden preparar y confirmar las
tres etapas de jugadores. Confirmar cierra la etapa y bloquea las ediciones.
Solo Admin puede reabrirla explícitamente. El staff privado conserva su acceso
exclusivo de Admin y la administración de sesiones conserva sus permisos.

## Causa verificada en producción

Berta confirmó que el problema de convocatoria afectaba solo a Coach. La
consulta `diagnostics/workflow_closure_read_only.sql` mostró la restricción
Admin en `batch4_guard_records`, `batch4_workflow_access` y
`batch4_workflow_action`. La pantalla también bloqueaba a Coach por su rol.
El acceso general de las dos cuentas Coach ya estaba habilitado por rol;
las tres cuentas Admin estaban aprobadas.

Las convocatorias y asistencias consultadas constaban confirmadas y los
triggers de cierre estaban activos. Algunas evaluaciones seguían abiertas;
estar abierta no demuestra un fallo al confirmar. No se han confirmado,
reabierto ni corregido registros deportivos durante esta revisión.

## Actualización de una instalación existente

1. Ejecutar completo `supabase/batch4/ENABLE_COACH_CALLUPS.sql` como `postgres`
   en el SQL Editor de Supabase. No repetir el instalador de Batch 4.
2. Comprobar `coach_workflow_check.all_ok: true`. Esta salida comprueba la
   instalación; la comprobación con una cuenta real se hace en la app.
3. Publicar la pantalla actualizada en `main` y recargar la app.

Berta ejecutó el parche el 17/11/2026 y compartió `all_ok: true`, con los seis
controles correctos. La revisión de los datos de producción fue de solo lectura;
la instalación del parche no confirmó ni reabrió sesiones.

El parche modifica exclusivamente las tres definiciones de función existentes.
Conserva sus firmas, propietarios, permisos y configuración; puede repetirse.
Si alguna definición difiere de la esperada, toda la actualización se revierte.
No cambia políticas RLS, listas de acceso, roles ni registros. La convocatoria
se guarda y confirma a través del RPC revisado; no hace falta permitir a Coach
escrituras directas en `sessions` o añadir políticas amplias sobre `callups`.
Los instaladores para proyectos nuevos incorporan el mismo cambio.

## Comprobación de los cierres

- Convocatoria: revisar todos los jugadores y pulsar Confirmar convocatoria.
  La confirmación guarda las decisiones completas y cierra la etapa.
- Asistencia: Guardar asistencia conserva los cambios; Confirmar asistencia
  cierra exactamente los registros guardados. Primero debe estar confirmada
  la convocatoria.
- Evaluación: Confirmar evaluación verifica elegibilidad, notas, comentarios,
  tarjetas y límites antes de cerrar. Primero deben estar confirmadas
  convocatoria y asistencia.
- Una etapa confirmada no permite más ediciones. La reapertura es explícita
  y está reservada a Admin. Las sesiones archivadas, canceladas o bloqueadas
  globalmente conservan las restricciones anteriores.
- Una lectura incompleta, cambios de otro dispositivo o datos pendientes
  impiden confirmar hasta recargar y revisar; nunca se confirma parcialmente.

Las pruebas aisladas comprueban el recorrido completo con dos Admin y dos
Coach, persistencia de los tres cierres, bloqueo de ediciones, denegación de
reapertura para Coach y privacidad del staff. Verifican también el parche sobre
las definiciones antiguas, su idempotencia, reversión atómica y conservación
de datos, RLS, triggers y permisos. Las pruebas de navegador cubren selección,
guardado y confirmación con ambos roles, incluidas las evaluaciones de sesiones
sin marcador de borrador. Los datos son sintéticos y no se escriben en producción.

Validación local: 182 pruebas de regresión y 18 casos de navegador correctos;
compilación de producción correcta. La prueba final con usuarios reales se hace
tras recargar la versión publicada, sin crear sesiones ficticias en producción.
