# Fase 1: cambios controlados y validacion

Estado: A, B y C implementados localmente. B aplica las reglas de asistencia
confirmadas posteriormente por la usuaria. Pendiente la comprobacion autenticada
en la aplicacion real; no se ha modificado ni consultado produccion desde esta sesion.
No se ha accedido a Supabase ni ejecutado SQL. No hay despliegue, push ni merge.

## Archivos modificados en esta intervencion

| Archivo | Cambio |
| --- | --- |
| `src/pages/HomePage.tsx` | Top global desde la vista oficial, etiqueta de periodo y error visible. |
| `src/pages/PlayersPage.tsx` | Media/evolucion desde la vista oficial; orden por fecha de sesion y error de rendimiento separado. |
| `src/components/MiniLineChart.tsx` | Usa `evaluationTotal()` como la ficha; excluye resultados N/A o sin puntuacion. |
| `src/pages/SummaryPage.tsx` | Rendimiento por sesion/global desde la vista oficial; conserva consultas de asistencia/tarjetas. |
| `src/pages/HistoryPage.tsx` | Top 3 limitado a sesiones oficiales; consulta original, notas, comentarios y detalle historico conservados. |
| `src/pages/IntelligencePage.tsx` | Evaluaciones oficiales y Top/Bottom de sesiones oficiales; asistencia conserva el periodo semanal. |
| `src/pages/ReportsPage.tsx` | Rendimiento oficial y Top/Bottom oficiales en PDF/CSV; otros registros conservan el periodo solicitado. |
| `src/pages/CallupPage.tsx` | Orden compartido por dorsal y nombre. |
| `src/pages/AttendancePage.tsx` | Solo orden de presentacion por dorsal y nombre. No cambia guardados ni estados. |
| `src/pages/EvaluationPage.tsx` | Solo orden por dorsal y nombre, incluido selector de registros. No cambia elegibilidad ni puntuacion. |

Archivos nuevos:

- `src/lib/performance.ts`: fuente central de consultas de rendimiento actual.
- `src/utils/performance.ts`: fecha, etiqueta y predicado de sesion oficial.
- `src/utils/playerOrder.ts`: comparador numerico compartido, sin mutar la lista.
- `tests/phase1.test.cjs`: pruebas locales sin dependencias adicionales.
- `diagnostics/phase1_read_only.sql`: consultas manuales, exclusivamente SELECT.
- `docs/TECHNICAL_DEBT.md`: auditoria aplazada y decisiones no autorizadas.
- `docs/PHASE1_REPORT.md`: este informe.

El repositorio ya tenia cambios locales en nueve paginas y en `dist/` antes
de esta intervencion. Se conservaron. `StandoutsPage.tsx` no se modifico aqui.
El diff contra HEAD incluye esos cambios anteriores y no representa solo esta fase.

## A. Rendimiento oficial

`officialEvaluations()` consulta exclusivamente la vista existente
`public.official_evaluations`. La aplicacion no crea ni modifica la vista.
La definicion proporcionada por la usuaria aplica el 14/10/2026 inclusivo
por fecha de sesion y excluye `records_only_confirmed = true`.
Las pantallas conservan su condicion previa de evaluacion confirmada/evaluated
y su tratamiento N/A. No hay fallback a evaluaciones antiguas si falla la vista.

Top/Bottom subjetivos viven en otra tabla. Sus agregados usan
`isOfficialPerformanceSession()` con la misma fecha y exclusion Solo registros.
La pantalla de seleccion historica de destacados no se modifica.

La ficha ordena la evolucion por fecha de sesion, no por fecha de edicion.
El grafico usa la misma media N/A que la ficha, en vez de `total_score` almacenado.
No se cambia ninguna formula almacenada, categoria, significado, peso, valor
por defecto ni puntuacion historica. Los valores ausentes no se convierten en cero.

El detalle de Historico, sus puntuaciones y comentarios siguen consultando
`evaluations`. El contador historico y el progreso operativo de evaluacion en
Inicio siguen describiendo registros del flujo, no medias de rendimiento actual.
Asistencia, convocatorias, tarjetas, sanciones y lesiones no reciben este corte.

## B. Asistencia: reglas confirmadas e implementacion

La usuaria confirmo que todos los registros explicitos de temporada cuentan,
incluidos los anteriores al 14/10/2026 y los de jugadores no convocados.
`unjustified_absence` e `injured_unjustified_absence` cuentan como injustificadas.
Una fila inexistente no anade ausencias. `injured` permanece separado, sin
atribuirle ausencia ni justificacion mientras su significado no este confirmado.

`src/utils/attendance.ts` centraliza recuentos y ranking por ID de jugador.
Se distinguen presencia, retraso, retraso justificado, ausencias justificadas e
injustificadas, presencia de lesionados, subtipos de ausencia por lesion y estado
antiguo. Los subtotales de lesion estan incluidos una sola vez en los totales.
Estados desconocidos y filas sin estado se muestran por separado.
No convocado sigue siendo un dato de convocatoria, no un enum de asistencia.

El mismo calculo se aplica a ficha, Inicio, Historico, resumen por sesion/global,
informes y exportaciones PDF/CSV. El seguimiento semanal reconoce ambos tipos
injustificados y conserva los pesos existentes; no cambia reglas disciplinarias.
Los acumulados no tienen corte de rendimiento. Informes y seguimiento mantienen
sus periodos explicitos. Las consultas de estadisticas se paginan por ID para no
truncar los acumulados al alcanzar el limite de respuesta de Supabase.

Se cuentan una sola vez las copias devueltas del mismo ID de asistencia.
Filas almacenadas con IDs distintos se conservan como registros distintos:
no se fusionan ni se elige una fila arbitrariamente. Revisar duplicados reales
requeriria diagnostico y autorizacion para corregir datos, si se encontraran.
Los errores de lectura paginada descartan resultados parciales y se muestran.

Segun las filas confirmadas por la usuaria, Marcos Zamora tiene CUATRO
injustificadas (4, 7, 11 y 14 de octubre), una justificada el 21 y presencia el 23.
No se infiere asistencia ni ausencia del 18. Este resultado no se hardcodea:
una prueba local reproduce esas fechas con identificadores ficticios.
No se modifican datos ni se requieren correcciones SQL para cambiar cuatro a dos.
`diagnostics/phase1_read_only.sql` queda disponible como diagnostico opcional.

Archivos exactos cambiados en esta continuacion B:

- Nuevos: `src/utils/attendance.ts`, `src/lib/attendance.ts`,
  `src/components/AttendanceBreakdown.tsx`.
- Modificados: `src/pages/PlayersPage.tsx`, `src/pages/HomePage.tsx`,
  `src/pages/SummaryPage.tsx`, `src/pages/HistoryPage.tsx`,
  `src/pages/IntelligencePage.tsx`, `src/pages/ReportsPage.tsx`,
  `tests/phase1.test.cjs`, `docs/PHASE1_REPORT.md`.

No se modifican en esta continuacion AttendancePage, CallupPage, EvaluationPage,
App, migraciones, SQL, RLS ni los flujos de entrada, elegibilidad o Solo registros.

## C. Orden por dorsal

Convocatoria, asistencia y evaluacion usan `sortPlayersByJersey()`:
numero ascendente (2 antes que 10), sin dorsal al final, nombre visible como
desempate con comparacion espanola y orden estable cuando coinciden las claves.
No se cambia el nombre, apodo, dorsal almacenado, elegibilidad o permisos.

## Validacion realizada

- TypeScript: `node_modules/.bin/tsc.cmd --noEmit --incremental false`, correcto.
- Tests: `node --test tests/phase1.test.cjs`, 17/17 correctos.
- Build Vite mediante `build({ build: { write: false } })`: correcto,
  2017 modulos y 6 salidas en memoria; no escribe `dist/`.
- `git diff --check`: correcto. Advertencias de conversion LF/CRLF en archivos
  que ya estaban modificados; sin errores de whitespace.
- No hay script de lint ni suite previa configurados en `package.json`.
- Las pruebas verifican corte inclusivo, exclusiones historicas y Solo registros,
  N/A, metodologia de cinco campos preservada, dorsal numerico/estable,
  coherencia del grafico y seleccion estatica de fuentes de consultas. Las nueve
  pruebas adicionales verifican reglas de asistencia, fechas anteriores al corte,
  ausencia de inferencias, estados de lesion/legacy, copias duplicadas, identidad
  por UUID, paginacion de mas de 1000 filas, errores y renderizado del desglose.

Pendiente validar con acceso autenticado a la aplicacion: relaciones PostgREST
de la vista con `players` y `sessions`, permisos existentes y datos reales.
El snapshot de 56 filas fue proporcionado por la usuaria; no se ha verificado
desde esta sesion ni se usa como limite fijo en el codigo.

## Decisiones pendientes

El significado del estado antiguo `injured` sigue pendiente y no bloquea los
recuentos confirmados: se muestra separado. La discrepancia metodologica
de entrenamientos queda documentada sin modificar: cuatro cualidades visibles
y cinco campos en el calculo existente. Cambiar ese modelo requiere aprobacion.
Solo registros, datos historicos, SQL/migraciones, permisos y flujos disciplinarios
permanecen intactos. No se ha iniciado ninguna fase futura.
