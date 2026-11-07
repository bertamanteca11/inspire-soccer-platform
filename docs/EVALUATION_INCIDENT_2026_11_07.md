# Incidencia de Evaluación del entrenamiento del 6 de noviembre

## Evidencia comprobada

- El diagnóstico de producción aportado por Berta muestra una única sesión del
  06/11/2026: `training`, `planned`, sin bloqueo, convocatoria y asistencia
  confirmadas, 25 filas de cada una, ningún convocado sin asistencia y cero
  evaluaciones. El marcador `draft_defaults_version` es NULL; esto es válido.
- Berta y Susan usan la misma cuenta desde dispositivos distintos. Además, los
  perfiles Admin existentes aparecen aprobados en el diagnóstico.
- Las definiciones instaladas de `batch4_workflow_action`,
  `batch4_guard_session_flags`, acceso y adaptadores coinciden con el contrato
  revisado. El RPC es `SECURITY DEFINER`, propiedad de `postgres`. No hay motivo
  identificado para reinstalar SQL ni modificar la sesión.
- El dominio público sirve `/assets/index-CZsZ1Lx0.js`, SHA-256
  `6e7ea2c2373f24dccd350a995155c0091cd87438c3540e463691bf6a62d5523a`,
  idéntico al build revisado del commit `f538147`. Esta comprobación pública no
  demuestra qué JavaScript seguía ejecutándose en el dispositivo de Susan.

## Origen exacto de la excepción

`supabase/batch4/002_workflow_security.sql` define el trigger
`batch4_session_flags_guard` (`BEFORE INSERT OR UPDATE ON public.sessions`).
Su función `batch4_guard_session_flags()` lanza la excepción `42501`:

> Use the reviewed workflow RPC; session flags and draft origin are protected

La rama de UPDATE solo la lanza cuando el rol efectivo es `authenticated` o
`anon` y cambia una confirmación, su fecha, `records_only_confirmed` o
`draft_defaults_version`. También se incluye en los bundles generados
`REVIEW_INSTALL.sql` y `CHECK_INSTALL_ROLLBACK.sql`; no son tres protecciones
distintas. No procede de una política RLS ni de una lectura de Evaluación.

Un Admin de la aplicación sigue usando el rol SQL `authenticated`; no queda
exento del trigger. El RPC revisado sí ejecuta su actualización como su
propietario `postgres`, después de comprobar cuenta, sesión y snapshots.

## Flujo auditado

1. `App` verifica autenticación y `app_access()`. `Platform.load()` lee catálogo,
   sesión seleccionada, convocatoria, asistencia, jugadores, evaluaciones y
   totales de tarjetas. No modifica sesiones.
2. Al montar `EvaluationPage`, los efectos sincronizan estado local y leen
   tarjetas, asistencia, convocatoria y `batch4_workflow_access`. Activar el modo
   de registros añade lecturas. Los 3 iniciales son borradores locales.
3. Guardar notas o comentarios modifica filas de evaluaciones tras una acción
   explícita. En sesiones sin marcador, confirmar materializa explícitamente
   los borradores pendientes; no añade ni cambia el marcador.
4. Confirmar/reabrir convocatoria, asistencia o evaluación pasa por
   `src/lib/workflows.ts` y `batch4_workflow_action`. Tarjetas y sanciones usan
   sus RPC de disciplina. Staff usa sus RPC y confirmaciones independientes.
5. Las únicas actualizaciones directas de sesiones en el frontend actual son
   edición de metadatos en `SessionsPage` y archivo/restauración de `status`.
   Ninguna incluye los campos protegidos. La inserción de una sesión operativa
   nueva puede establecer el marcador permitido, sin modificar otras sesiones.

El frontend antiguo (por ejemplo `8af9ded`) sí ejecutaba desde AttendancePage
un UPDATE directo de `attendance_confirmed`/`attendance_confirmed_at` y mostraba
`error.message`. Con el esquema actual reproduce exactamente esta excepción.
Su confirmación/reapertura de Evaluación también usaba cambios directos. Una
pestaña abierta puede seguir ejecutando ese código aunque Vercel ya publique
otro build. No se ha encontrado un service worker en el repositorio actual.

## Fallo local demostrado y corrección

Antes del parche, cambiar de pestaña conservaba `selectedSession` sin volver a
leerla. Si otro dispositivo confirmaba asistencia, entrar en Evaluación seguía
mostrando «Primero hay que confirmar la asistencia». Una reapertura remota
también podía dejar visibles confirmaciones antiguas. El banner global podía
seguir mostrando el error de una operación anterior al cambiar de apartado.

La nueva prueba de App completo reprodujo el aviso falso antes del parche.
`Platform.navigate()` ahora vuelve a ejecutar la carga de solo lectura antes de
mostrar Convocatoria, Asistencia o Evaluación. Espera la respuesta, conserva la
sesión elegida, limpia el error de la operación anterior al recargar y bloquea
el editor si falla la lectura. No hay refresco automático que sobrescriba un
borrador mientras se edita.

Esto corrige un fallo confirmado de datos en memoria. La explicación más
consistente para la excepción inglesa es un frontend antiguo aún abierto o un
error anterior conservado; falta la petición fallida o la versión ejecutada en
el dispositivo de Susan para atribuirle con certeza el origen del UPDATE.
No debe presentarse esa hipótesis como una captura de su tráfico.

## Verificación local

- Regresión del navegador: confirmar y reabrir desde otro dispositivo,
  lectura lenta, lectura fallida y ausencia de escrituras al entrar.
- Base de datos aislada: dos Admin sintéticos reciben la excepción exacta en
  un UPDATE directo; ambos pueden confirmar asistencia y evaluación mediante
  RPC, manteniendo el marcador NULL y las protecciones activas.
- Las pruebas usan datos y cuentas sintéticos; ninguna ejecuta operaciones en
  producción. El diagnóstico manual solo consulta datos y definiciones.

Resultados: `npm test`, 160 pruebas aprobadas; Playwright
`workflow-session.ui.spec.cjs`, 4 aprobadas (la primera fallaba con el código
anterior); `auth.ui.spec.cjs`, 5 aprobadas. Build TypeScript/Vite correcto con
`npm run build -- --outDir .phase4-test-artifacts/evaluation-incident/frontend`.
Persiste el aviso conocido de tamaño de algunos chunks, sin errores de build.

## Acción necesaria en producción

1. Si no hay cambios pendientes de guardar, cerrar completamente las pestañas
   y la app instalada en el dispositivo de Susan y abrir de nuevo
   https://inspire-soccer-platform.vercel.app/ . Seleccionar el entrenamiento del
   6 de noviembre y entrar en Evaluación. La asistencia ya está confirmada;
   no hay que reabrirla, reconfirmarla ni cambiar registros mediante SQL.
2. Si persiste, identificar el archivo `/assets/index-*.js` realmente cargado y
   la petición fallida (método, ruta y nombres de campos; ocultar Authorization,
   cookies y tokens). Un PATCH de confirmaciones a `/rest/v1/sessions` identifica
   un cliente antiguo; el cliente actual usa `/rest/v1/rpc/batch4_workflow_action`.
   Un fallo en el RPC revisado exigiría revisar ese tráfico antes de cambiar SQL.
3. Publicar el parche frontend para que la entrada a cada flujo consulte el
   estado actual y verificar el build servido por el dominio de producción.
   Berta autorizó esta publicación después de la investigación, el 07/11/2026.
   No requiere migración ni reinstalar Batch 4 o Staff.

Puede consultar Equipo, Resumen, Historial y VEO mientras se resuelve. En el
dispositivo afectado conviene evitar guardados/confirmaciones de convocatoria,
asistencia, evaluación y disciplina hasta haber recargado y verificado la
versión: el cliente antiguo puede guardar algunas filas antes de que falle la
confirmación. El error no demuestra corrupción; el diagnóstico no audita el
contenido de cada asistencia y no se han corregido datos deportivos.
