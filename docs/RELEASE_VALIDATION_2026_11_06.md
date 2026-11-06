# Validación de la revisión de Susan

Fecha: 6 de noviembre de 2026. Rama local `feature/premium-ui-redesign`, HEAD
`49ea7a4` preservado. Sin commit, push, merge, publicación ni SQL remoto.

## Resultados de esta revisión

| Comprobación | Resultado |
|---|---|
| `npm test` | 131/131; incluye 14 checks SQL PGlite y seis pruebas nuevas de calidad |
| PostgreSQL 17 real, conexiones independientes | 18/18; cuatro casos adicionales de concurrencia |
| `npm run test:phase4-ui` | 41/41; cuatro cualidades, medias, periodos, revisión de Susan y originales |
| `npm run test:final-ui` | 76/76; móvil 320/360/390/430, roles, PDF/CSV, snapshots, sanción cumplida, RPC ausente y fallos atómicos |
| `npm run test:batch4-ui` | 6/6; confirmaciones, reopen y defaults prospectivos |
| `npm run build:check` | TypeScript y build correctos; continúa el aviso de fragmento inicial mayor de 500 kB |
| `npm audit` | 0 vulnerabilidades conocidas en dependencias del proyecto |
| `npm run demo:check` | Endpoint/clave ficticios, cuatro cualidades y peticiones externas interceptadas o bloqueadas |
| `git diff --check` | Correcto |

No sumar los 18 checks nativos como si fueran todos distintos de los 14 checks
PGlite: se repiten contratos en otro motor y se añaden cuatro concurrencias.
Las suites de shell/diseño/VEO de la entrega anterior se documentan en
FINAL_TEST_REPORT; no se presentan como nuevas ejecuciones aquí.

## Esquema y SQL

`tests/fixtures/live-schema-2026-11-06.sql` reproduce las once tablas exportadas,
tipos, restricciones, políticas, grants, triggers, funciones y tres vistas.
current_role y security_invoker reflejan el segundo diagnóstico del usuario.
No contiene filas de producción. auth.users/auth.uid son adaptaciones de prueba;
uuid_generate_v4 se sustituye por gen_random_uuid para PGlite.

PostgreSQL nativo 17.11 usa un contenedor temporal `postgres:17`, expuesto solo en
127.0.0.1:55438. Cada suite crea y elimina su propia base de datos ficticia.
`tests/helpers/releaseDatabase.cjs` rechaza URLs fuera de ese destino. El cliente
pg 8.16.3 se instaló solo bajo `.phase4-test-artifacts`, sin añadir dependencias
a package.json/package-lock. Docker pudo arrancarse en esta revisión; el bloqueo
anterior del motor no disponible queda resuelto.

Verificado: finalización/reopen sin borrar quinta cualidad/comentarios,
snapshots parciales/obsoletos, N/A, límites, Solo registros, roles, escrituras
directas, vistas, rollback de tarjeta/sanción y destacados, reset idempotente,
inicialización de ciclos antiguos y paquete SQL en una transacción.

Concurrencia: dos reintentos de tarjeta; sanción cumplida frente a tarjeta nueva;
dos notas altas con límite uno; confirmar frente a editar. Se comprueba que la
segunda conexión espera un lock y se conservan datos/restricciones. No es una
prueba exhaustiva de todos los interleavings.

## Fallos encontrados y corregidos

- Pruebas antiguas exigían cinco cualidades y medias 3.80/4.20: se actualizaron
  a cuatro, verificando también que la quinta se conserva.
- Un alias PL/pgSQL coincidía con una variable: se corrigió antes de validar SQL.
- Los tests de errores usan savepoints para simular peticiones independientes;
  una excepción esperada no invalida comprobaciones posteriores.
- Snapshots de tarjetas/destacados excluyen timestamps del servidor, evitando
  diferencias de formato/precisión sin relajar identidad ni contenido.
- Snapshot de tarjeta distingue NULL de un objeto antes de operar con JSON.
- Rutas simuladas actualizadas a RPC atómicos y nueva lectura de sanciones;
  un RPC fallido deja cero tarjetas y sanciones.
- Demo con caché Vite propia, etiquetas accesibles y espera de primera carga;
  no comparte credenciales ni caché de optimización con las suites normales.

## Límites antes de producción

Falta instalar y probar el circuito completo mediante Auth/PostgREST de un
Supabase separado, con usuarios reales de prueba, datos anonimizados y backup
restaurado. Lo local no certifica el proyecto alojado, sus cachés ni identidades.
La comprobación y aprobación de publicación siguen pendientes.

El usuario ejecutó `diagnostics/susan_review_attendance_read_only.sql` y aportó
el resultado: cuatro injustificadas anteriores al periodo, sin fila el 18/10,
justificada con nota el 21/10 y presente el 23/10. Las tres sesiones están
completadas/confirmadas y el dorsal actual es 18. La selección operativa muestra
cero injustificadas y un hueco; no fuerza dos. Cualquier cambio de clasificación
requiere revisión de Susan y guardado explícito; no se modificó producción.

POLAR, alcance de métricas VEO en PDF e instalación PWA en teléfonos mantienen
los límites documentados antes; no se simulan esas integraciones. Posteriormente
el usuario confirmó el 3 inicial y las bandas 4–5 / 1–2; ver la actualización de
validación al final de este documento.

Logs ignorados: `.phase4-test-artifacts/release-*.log` y `release-audit.json`;
no incluyen exportaciones de usuarios.

## Inventario del árbol de trabajo en la revisión anterior

50 archivos ya versionados modificados y 35 archivos nuevos, sin staging.
Incluye el trabajo local anterior conservado y esa revisión; no representa un commit.

| Estado | Archivo |
|---|---|
| Modificado | INSTRUCCIONES_ACTUALIZACION.md |
| Modificado | docs/BATCH4_IMPLEMENTATION.md |
| Modificado | index.html |
| Modificado | package-lock.json |
| Modificado | package.json |
| Modificado | public/manifest.webmanifest |
| Modificado | src/App.tsx |
| Modificado | src/components/BottomNav.tsx |
| Modificado | src/components/SessionHeading.tsx |
| Modificado | src/components/shell/LoginPanel.tsx |
| Modificado | src/components/ui.tsx |
| Modificado | src/lib/data.ts |
| Modificado | src/lib/performance.ts |
| Modificado | src/lib/summary.ts |
| Modificado | src/lib/workflowReads.ts |
| Modificado | src/lib/workflows.ts |
| Modificado | src/pages/AttendancePage.tsx |
| Modificado | src/pages/CallupPage.tsx |
| Modificado | src/pages/EvaluationPage.tsx |
| Modificado | src/pages/HistoryPage.tsx |
| Modificado | src/pages/HomePage.tsx |
| Modificado | src/pages/InjuriesPage.tsx |
| Modificado | src/pages/IntelligencePage.tsx |
| Modificado | src/pages/LoginPage.tsx |
| Modificado | src/pages/PlayersPage.tsx |
| Modificado | src/pages/ReportsPage.tsx |
| Modificado | src/pages/SessionsPage.tsx |
| Modificado | src/pages/StandoutsPage.tsx |
| Modificado | src/pages/SummaryPage.tsx |
| Modificado | src/pages/VeoModule.tsx |
| Modificado | src/styles.css |
| Modificado | src/utils/appTypes.ts |
| Modificado | src/utils/attendance.ts |
| Modificado | src/utils/evaluationEligibility.ts |
| Modificado | src/utils/evaluationScores.ts |
| Modificado | src/utils/formatters.ts |
| Modificado | src/utils/summaryScope.ts |
| Modificado | src/utils/useWorkflowAccess.ts |
| Modificado | src/utils/workflowDrafts.ts |
| Modificado | supabase/batch4/002_workflow_security.sql |
| Modificado | tests/batch4-database.test.cjs |
| Modificado | tests/batch4.test.cjs |
| Modificado | tests/batch4.ui.spec.cjs |
| Modificado | tests/evaluation-correctness.test.cjs |
| Modificado | tests/evaluation.ui.spec.cjs |
| Modificado | tests/phase1.test.cjs |
| Modificado | tests/phase4.ui.spec.cjs |
| Modificado | tests/session-archive.test.cjs |
| Modificado | tests/shell.ui.spec.cjs |
| Modificado | tests/veo.ui.spec.cjs |
| Nuevo | diagnostics/final_schema_export_read_only.sql |
| Nuevo | diagnostics/final_schema_followup_read_only.sql |
| Nuevo | diagnostics/final_schema_read_only.sql |
| Nuevo | diagnostics/susan_review_attendance_read_only.sql |
| Nuevo | docs/FINAL_PROJECT_ROADMAP.md |
| Nuevo | docs/FINAL_RELEASE_PLAN.md |
| Nuevo | docs/FINAL_TEST_REPORT.md |
| Nuevo | docs/LIVE_SCHEMA_REVIEW.md |
| Nuevo | docs/LOCAL_PREVIEW_GUIDE.md |
| Nuevo | docs/RELEASE_REVIEW_2026_11_06.md |
| Nuevo | docs/RELEASE_VALIDATION_2026_11_06.md |
| Nuevo | docs/SUSAN_REVIEW_CHECKLIST.md |
| Nuevo | scripts/prepare-release-sql.cjs |
| Nuevo | scripts/preview-demo.cjs |
| Nuevo | src/components/SuspensionManager.tsx |
| Nuevo | src/lib/discipline.ts |
| Nuevo | src/styles/final-quality.css |
| Nuevo | src/utils/csv.ts |
| Nuevo | src/utils/evaluationSnapshot.ts |
| Nuevo | src/utils/workflowErrors.ts |
| Nuevo | supabase/batch4/001a_live_adapters.sql |
| Nuevo | supabase/batch4/003_discipline_and_standouts.sql |
| Nuevo | supabase/batch4/004_view_security.sql |
| Nuevo | supabase/batch4/REVIEW_INSTALL.sql |
| Nuevo | tests/auth.fixture.ts |
| Nuevo | tests/auth.ui.spec.cjs |
| Nuevo | tests/final-quality.test.cjs |
| Nuevo | tests/final.fixture.ts |
| Nuevo | tests/final.harness.tsx |
| Nuevo | tests/final.playwright.config.cjs |
| Nuevo | tests/final.ui.spec.cjs |
| Nuevo | tests/fixtures/live-schema-2026-11-06.sql |
| Nuevo | tests/helpers/releaseDatabase.cjs |
| Nuevo | tests/release-database.test.cjs |
| Nuevo | tests/release-quality.test.cjs |

## Actualización: nota inicial y límites confirmados por Susan

El usuario confirma 3 como nota inicial y las bandas altas 4–5 y bajas 1–2.
Cada cualidad respeta los límites de su sesión: por defecto seis altas y tres
bajas; una sesión configurada con cinco altas mantiene cinco. Cambiar de 4 a 5
para el mismo jugador ocupa una sola plaza alta.

Las cuatro notas iniciales se muestran en evaluaciones operativas nuevas sin
escribir al abrir la pantalla. La confirmación inserta los valores pendientes
en la misma transacción que valida y confirma la evaluación. Las notas y N/A
ya guardadas, las sesiones históricas y Solo registros conservan su significado.
Los controles impiden exceder las bandas; el servidor vuelve a validarlas.

La segunda entrada VEO correspondía al selector de pantallas de la demo. Ahora
hay una sola entrada; la importación continúa dentro del módulo VEO.

| Comprobación repetida tras los cambios | Resultado |
|---|---|
| `npm test` | 135/135, incluidos 17 checks SQL PGlite |
| PostgreSQL 17.11 nativo | 21/21, incluidas las cuatro pruebas de concurrencia |
| `npm run test:final-ui` | 81/81, incluidos inicial 3, N/A, cupos y comentario concurrente |
| `npm run test:phase4-ui` | 41/41 |
| `npm run build:check` | TypeScript y build correctos; persiste el aviso de tamaño del fragmento |
| `npm run demo:check` | Cuatro cualidades, inicial 3 y una sola entrada VEO; datos ficticios y peticiones externas bloqueadas |
| `git diff --check` | Correcto |

No se han realizado commits, push, despliegues ni cambios en Supabase remoto.
La validación nativa no sustituye las comprobaciones pendientes de Auth y
PostgREST en un entorno Supabase aislado descritas anteriormente.

## Actualización: audio de Susan, periodo reciente y temporada

El usuario confirma temporada julio–junio. Resumen abre las últimas cuatro
semanas (28 días inclusivos hasta hoy, calendario de Copenhagen); permite toda
la temporada, temporadas anteriores y selección personalizada. Las mismas
sesiones filtran asistencia, tarjetas y medias. No se modifican las fórmulas
de evaluación ni las filas de asistencia. Admin dispone de acceso desde la
tabla a la asistencia de esa sesión, y la opción ahora dice «Ausencia
injustificada» para distinguirla de la justificada.

La intención para Marcos queda confirmada por el audio: injustificada el 18 y
el 21, revisar la falta de registros del 18 y comprobar el 23. La corrección
remota sigue pendiente. Se ha preparado la guía de revisión, conservando las
notas y el histórico. Los requisitos concretos de VEO siguen pendientes de Sergi;
se ha preparado un recorrido para obtener su lista sin cambiar las fórmulas.

Validación repetida para esta actualización:

- `npm test`: 139/139, incluidos los contratos SQL PGlite existentes y cuatro
  pruebas nuevas de periodos: 28 días, DST/año bisiesto, límites de temporada,
  filtros comunes y comparación marzo/octubre.
- `npm run test:phase4-ui`: 46 casos comprobados. La primera ejecución pasó 44;
  se corrigió el contenedor del aviso «Sin registro» al añadir el botón de revisión
  y se repitieron los dos casos afectados: 2/2. Pasan los cinco casos nuevos:
  periodo inicial, selección de temporada anterior, medias en marzo, corrección
  Admin conservando nota y ausencia de acceso de corrección para Coach.
- `npm run test:batch4-ui`: 6/6, incluido guardado, remontaje y reapertura tras
  cambiar la etiqueta de ausencia.
- `npm run test:final-ui`: 81/81; controles y contenido móvil a 320/360/390/430 px,
  roles, cuatro cualidades, PDF/CSV, confirmaciones y fallos de escritura.
- `npm run build:check`: TypeScript y build correctos. Persiste el aviso de
  fragmento inicial mayor de 500 kB.
- `npm run demo:check`: correcto; incluye periodo de cuatro semanas y temporada,
  cuatro cualidades, inicial 3 y una entrada VEO, sin peticiones externas reenviadas.
- `git diff --check`: correcto.

No hay cambios de SQL en esta actualización ni nuevas dependencias. No se
repitieron las pruebas nativas PostgreSQL: los 21/21 anteriores corresponden
al mismo paquete SQL, ya validado. No hay commits, push, despliegues ni cambios
en Supabase remoto.

## Actualización: avisos de evaluaciones y sanciones en convocatoria

A petición del usuario se han retirado los contadores informativos de evaluaciones
excluidas de Inicio/Top global, Resumen, fichas, evaluación, informes y seguimiento.
Se conservan la elegibilidad, las medias, los registros y los errores de lectura.
No hay cambios de SQL ni de permisos.

La gestión de sanciones de Admin aparece antes de los jugadores en Convocatoria,
con confirmación visible al completar y actualización de avisos. Liga y amistosos
señalan las sanciones activas junto al jugador; un convocado afectado dispara además
un aviso destacado. Antes de confirmar se relee la vista completa por páginas y
se advierte de los afectados en el diálogo. Cancelar no escribe ni altera la
selección. Las sanciones se revisan según la fecha y el tipo de partido: el aviso
no presume reglas de competición ni suma sanciones distintas como partidos consecutivos.

Validación de esta actualización:

- `build:check`: TypeScript y compilación correctos; permanece el aviso de tamaño.
- Suite final de interfaz: 85 casos comprobados. Pasaron 84 en la ejecución general;
  un caso de carga de Lesiones a 360 px agotó su tiempo durante la ejecución
  interrumpida y pasó al repetirlo individualmente sin cambiar código.
- Cuatro casos nuevos verifican aviso por jugador/selección, actualización de
  sanciones antes de confirmar con cancelación sin escrituras, lectura denegada
  y visibilidad Coach sin permiso para marcar cumplida. El caso existente de
  sanción cumplida ahora comprueba también la retirada de ambos avisos del partido.
- Seis regresiones de medias, seguimiento, historial, error de elegibilidad y
  convocatoria: cinco pasaron en grupo; la de error de lectura agotó el tiempo
  durante la interrupción y pasó al repetirla sin cambios.
- Seis casos Batch 4: cinco pasaron en grupo; la carga inicial del caso de asistencia
  agotó el tiempo de navegación y pasó al repetirlo individualmente sin cambios.
- `demo:check` y `git diff --check`: correctos.

No se repitieron Node/PGlite ni PostgreSQL nativo: no se modificaron sus contratos
ni el paquete SQL. Se mantienen los resultados previos con ese alcance. No hay
commit, push, publicación ni modificación de datos remotos.
