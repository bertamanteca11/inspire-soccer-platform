# Informe final de pruebas y alcance

Este informe conserva la primera entrega. Para la revisión posterior de Susan,
los resultados y archivos actuales están en `RELEASE_VALIDATION_2026_11_06.md` y
`RELEASE_REVIEW_2026_11_06.md`. Estos actualizan las antiguas referencias a cinco
cualidades, adaptadores sin implementar, falta de Docker y disciplina no atómica.

6 de noviembre de 2026. Repositorio: `inspire-soccer-platform`, rama
`feature/premium-ui-redesign`, HEAD preservado `49ea7a4`. Cambios locales sin commit.
No se consultó ni modificó Supabase real. No se usaron credenciales de producción
para comprobar permisos ni se ejecutó SQL de producción. Las peticiones externas
de las pruebas de navegador se interceptan o abortan.

## Resultados

| Comprobación | Resultado |
|---|---|
| Línea base `npm test` | 95/95 antes de cambios. |
| Línea base `npm run test:batch4` | 10/10 antes de cambios. |
| Línea base `npm run build:check` | TypeScript y Vite correctos. |
| `npm test` final ampliado | 111/111, incluye Batch 4 y nuevas regresiones. |
| `npm run test:batch4` | 12/12 también tras el último guard de estado NULL; incluido en npm test. PGlite sintético. |
| `npm run test:typecheck` | Correcto; también se ejecuta con build:check. |
| `npm run build:check` final | Correcto; salida ignorada `.veo-build-check/`, no sobrescribe dist. |
| `npm run test:phase4-ui` final | 40/40. |
| `npm run test:shell-ui` | 34/34; revisión puntual del modal también correcta tras el ajuste de foco. |
| `npm run test:design-ui` | 8/8. |
| `npm run test:veo-ui` | 8/8, con libro local existente, worker e importaciones interceptadas. |
| `npm run test:batch4-ui` final | 6/6. |
| `npm run test:final-ui` | 74/74 con jsPDF 4/AutoTable 5/Vite 6.4.5; incluye PDF largo, contraste de texto secundario y Solo registros sin elegibles. Revisión puntual de ficha posterior también correcta. |
| `npm audit --json` final | Código 0; 0 críticas, altas, moderadas o bajas, incluidas dependencias de desarrollo. |
| `git diff --check` | Correcto con la configuración original del repositorio; sin cambiar core.autocrlf. |
| Integración con esquema/RLS/triggers reales | BLOCKED: faltan definiciones completas y clon aprobado. |
| Concurrencia entre conexiones PostgreSQL reales | BLOCKED: motor Docker no disponible; no hay servidor aislado verificado. |
| Instalación PWA / iOS / Android real | No ejecutada. Faltan exportaciones de iconos y prueba en dispositivos reales. |

Total sin contar reintentos: **111 pruebas Node/PGlite + 170 de navegador = 281**.
Las pruebas que fallaron inicialmente se diagnosticaron y corrigieron; no quedan
fallos en las suites enumeradas. La revisión de compatibilidad y permisos de la
base real sigue bloqueada, no aprobada por estos resultados.

## Qué verifican las pruebas

- Node/PGlite: fecha de corte oficial, elegibilidad desde convocatoria y asistencia
  persistidas, N/A, medias y límites, historial de Marcos, archivo/restauración,
  calendario de Copenhague, primas VEO desde J5, duplicados, importación y rollback.
- Nuevas regresiones SQL: roster completo y snapshot original al confirmar,
  prohibición de cambiar flags/origen mediante updates directos, creación abierta,
  evaluated protegido, identidad inmutable, snapshot de asistencia y estados válidos.
  No se amplía UPDATE general de sessions para Coach.
- Nuevas regresiones de datos: CSV con comillas, saltos de línea, acentos y fórmulas;
  snapshots de evaluación sensibles a puntuaciones/N/A/comentarios, no timestamps;
  respuestas null incompletas; próxima sesión abierta más allá del antiguo límite 20.
- Navegador: convocatoria/asistencia guardar-confirmar-reabrir, no escrituras al
  abrir/tocar/salir, fallos de lectura y cero filas, históricos/inactivos, formatos
  originales conservados, comentarios y elegibilidad, expansión de alertas y navegación.
- Suite nueva: 15 pantallas/modos × 4 anchos (320/360/390/430), sin escrituras al
  abrir; controles contenidos dentro de tarjetas; ficha anterior/siguiente con vuelta
  y bajas; diálogo con foco atrapado/Escape/restauración; PDF equipo/jugador con
  cabecera `%PDF`, trayectoria extensa paginada y CSV de datos persistidos;
  contraste AA del texto secundario, checkbox con etiqueta táctil de 44 px;
  Solo registros sin participantes deportivos, sin puntuaciones inventadas;
  doble clic, puntuación en curso,
  snapshot obsoleto, tarjetas ilegibles, tarjeta cero filas y sanción fallida.
- Autenticación aislada: no se monta la operativa hasta verificar el perfil,
  el cambio Admin→Coach elimina estado/permisos anteriores, la respuesta tardía
  del perfil anterior se descarta y los roles desconocidos/lecturas denegadas cierran acceso.

Estas son pruebas de componentes y contratos locales, no certificación de RLS real,
de compatibilidad con triggers existentes ni una auditoría completa de accesibilidad.
El test de tarjetas/sanciones prueba errores de cliente con respuestas simuladas;
no demuestra una transacción disciplinaria ni idempotencia entre clientes.

## Fallos encontrados durante el trabajo

- Un test SQL empezó a seleccionar la primera sesión sin filtrar después de que
  la nueva prueba insertara otra. Se corrigió la identidad del fixture, conservando
  la aserción de independencia de flags. Los guards no se relajaron para hacerlo pasar.
- La traducción de «Email» a «Correo electrónico» dejó un selector antiguo de VEO.
  Se actualizó el selector a la etiqueta accesible; las ocho regresiones pasan.
- El diálogo nuevo no restauraba correctamente el foco inicial y el navegador
  permitía llegar a su interfaz al tabular desde el último control. Se retiró el
  autofocus anterior a showModal y se añadió foco inicial y vuelta de Tab explícitos.
- El test del snapshot obsoleto encontraba dos alertas legítimas y fallaba en modo
  estricto. Ahora identifica la alerta concreta; sigue exigiendo cero mutaciones.
- El primer arranque frío de Vite 6, mientras se construía en paralelo, agotó el
  tiempo de navegación de un test de autenticación. La suite completa posterior
  con Vite 6.4.5 pasa los 74 casos sin relajar timeouts ni omitir pruebas.

## Rendimiento, activos y límites

Build inicial: JS de entrada 936,71 kB (gzip 284,34). Final con dependencias corregidas
y presentación española: **546,35 kB (gzip 154,79)**, con ReportsPage de 430,71 kB
bajo demanda. La reducción del JS de entrada es aproximadamente del 42 %.
No se han cambiado fórmulas VEO. Persiste el aviso de chunk >500 kB; no se ocultó.
El aviso CJS de Vite 5 desaparece al pasar a Vite 6.

La revisión de idioma traduce estados y tarjetas conocidos, tipos de sesión,
destacados y los títulos de navegación VEO/club. Los identificadores internos,
la importación, métricas y cálculos VEO se conservan. Los selectores de los tests
VEO se actualizan a los títulos españoles y se vuelve a ejecutar su regresión:
8/8 VEO, 40/40 Phase 4, y revisiones finales de 16 casos móviles/PDF y 14 del shell
correctas. Estos reintentos no se vuelven a sumar al total de 281.
Las capturas de 320 px se inspeccionaron localmente: se corrigieron el contraste
de texto secundario y la alineación del selector de bajas, manteniendo el escudo,
header y navegación aprobados. Se guardan en
`.phase4-test-artifacts/final-mobile-review/`; la revisión de shell está en
`.phase4-test-artifacts/shell-final-review/`.

## Auditoría de dependencias

`npm audit --omit=dev --json` encontró inicialmente cinco paquetes afectados:
jsPDF (crítica), DOMPurify y AutoTable (altas), Vite (alta) y esbuild (moderada).
Esto describe avisos de dependencias; no demuestra explotación en esta aplicación.
Se actualizaron explícitamente jsPDF 2.5.2→4.2.1, AutoTable 3.8.4→5.0.9 y Vite
5.4.21→6.4.5, con package-lock. La primera selección Vite 6.4.4 tenía otro aviso
moderado específico de esa versión; se aplicó el parche recomendado 6.4.5.
Se usó npm install --ignore-scripts, nunca npm audit fix --force.
El plugin React existente declara compatibilidad con Vite 6; AutoTable acepta
jsPDF 4. PDF/CSV se descargan correctamente con la nueva cadena, incluida trayectoria
individual extensa paginada. npm audit final completo devuelve cero avisos y código 0.
Se repiten las regresiones de navegador/build después del parche final.
Los JSON de evidencia quedan en el directorio ignorado
`.phase4-test-artifacts/`.

Referencias primarias revisadas para la compatibilidad:
[migración Vite 5→6](https://v6.vite.dev/guide/migration.html),
[AutoTable](https://github.com/simonbengtsson/jsPDF-AutoTable),
[release jsPDF 4.2.1](https://github.com/parallax/jsPDF/releases/tag/v4.2.1).

El escudo existente se decodifica en el navegador, pero es AVIF 283×330 con nombre
logo.png. No se modificó. El manifest se ha traducido y alineado con azul de club;
faltan iconos de instalación adecuados. No se ha añadido caché offline de información
privada ni un service worker que pudiera conservar datos de otra cuenta.

Bloqueos de seguridad vigentes: adaptador global real, finalizador de evaluación,
atomicidad/idempotencia de disciplina, reemplazo atómico de destacados, políticas
reales de privacidad y pruebas concurrentes. Ver `FINAL_RELEASE_PLAN.md`.
POLAR no tiene implementación/modelo en src o supabase. El PDF actual no incorpora
estadísticas VEO ni todos los comentarios individuales; no se han inventado datos.

## Archivos modificados

Lista exacta: 56 archivos (41 modificados y 15 nuevos). Todos siguen sin staging/commit.

| Archivo desde la raíz del repositorio | Cambio |
|---|---|
| `diagnostics/final_schema_read_only.sql` | Nuevo |
| `docs/BATCH4_IMPLEMENTATION.md` | Modificado |
| `docs/FINAL_PROJECT_ROADMAP.md` | Nuevo |
| `docs/FINAL_RELEASE_PLAN.md` | Nuevo |
| `docs/FINAL_TEST_REPORT.md` | Nuevo |
| `docs/SUSAN_REVIEW_CHECKLIST.md` | Nuevo |
| `index.html` | Modificado |
| `INSTRUCCIONES_ACTUALIZACION.md` | Modificado |
| `package.json` | Modificado |
| `package-lock.json` | Modificado |
| `public/manifest.webmanifest` | Modificado |
| `src/App.tsx` | Modificado |
| `src/components/BottomNav.tsx` | Modificado |
| `src/components/SessionHeading.tsx` | Modificado |
| `src/components/shell/LoginPanel.tsx` | Modificado |
| `src/components/ui.tsx` | Modificado |
| `src/lib/data.ts` | Modificado |
| `src/lib/performance.ts` | Modificado |
| `src/lib/workflowReads.ts` | Modificado |
| `src/lib/workflows.ts` | Modificado |
| `src/pages/AttendancePage.tsx` | Modificado |
| `src/pages/CallupPage.tsx` | Modificado |
| `src/pages/EvaluationPage.tsx` | Modificado |
| `src/pages/HistoryPage.tsx` | Modificado |
| `src/pages/HomePage.tsx` | Modificado |
| `src/pages/InjuriesPage.tsx` | Modificado |
| `src/pages/IntelligencePage.tsx` | Modificado |
| `src/pages/LoginPage.tsx` | Modificado |
| `src/pages/PlayersPage.tsx` | Modificado |
| `src/pages/ReportsPage.tsx` | Modificado |
| `src/pages/SessionsPage.tsx` | Modificado |
| `src/pages/StandoutsPage.tsx` | Modificado |
| `src/pages/SummaryPage.tsx` | Modificado |
| `src/pages/VeoModule.tsx` | Modificado |
| `src/styles.css` | Modificado |
| `src/styles/final-quality.css` | Nuevo |
| `src/utils/appTypes.ts` | Modificado |
| `src/utils/attendance.ts` | Modificado |
| `src/utils/csv.ts` | Nuevo |
| `src/utils/evaluationSnapshot.ts` | Nuevo |
| `src/utils/formatters.ts` | Modificado |
| `src/utils/workflowDrafts.ts` | Modificado |
| `supabase/batch4/002_workflow_security.sql` | Modificado |
| `tests/auth.fixture.ts` | Nuevo |
| `tests/auth.ui.spec.cjs` | Nuevo |
| `tests/batch4.test.cjs` | Modificado |
| `tests/batch4.ui.spec.cjs` | Modificado |
| `tests/batch4-database.test.cjs` | Modificado |
| `tests/final.fixture.ts` | Nuevo |
| `tests/final.harness.tsx` | Nuevo |
| `tests/final.playwright.config.cjs` | Nuevo |
| `tests/final.ui.spec.cjs` | Nuevo |
| `tests/final-quality.test.cjs` | Nuevo |
| `tests/session-archive.test.cjs` | Modificado |
| `tests/shell.ui.spec.cjs` | Modificado |
| `tests/veo.ui.spec.cjs` | Modificado |
