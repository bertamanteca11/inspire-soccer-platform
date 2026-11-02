# Fase 2: previsualización local de Excel VEO

## Abrir el visor

1. Instalar las dependencias con `npm install` si aún no están disponibles.
2. Ejecutar `npm run dev -- --host 127.0.0.1`.
3. Acceder con una cuenta existente de administrador.
4. Abrir **Más → VEO Excel (local)** y seleccionar `data/BIG DATA EQUIPO.xlsx`.

También se puede entrar directamente en
`http://127.0.0.1:5173/?veo-preview=1`. Esta entrada exige autenticación y consulta
el rol existente, pero evita montar las páginas operativas y sus RPC de inicio.
No es un bypass de autenticación. Para este módulo nuevo se ha elegido el acceso
conservador de administrador; no se cambian los permisos existentes de otras páginas.

El archivo se selecciona desde el dispositivo, nunca se carga automáticamente
desde `data/`. No se copia a `public/`, no se empaqueta en la aplicación, no se
envía a Supabase y no se conserva en almacenamiento del navegador. Salir de la
página o pulsar Limpiar descarta la previsualización. Las incidencias y valores
originales se inspeccionan en la propia pantalla. No existe acción de publicación.

## Funcionalidad

- Soporte de las seis hojas reales y sus cabeceras simples/compuestas.
- Exclusión de filas formateadas, plantillas de solo fórmulas y filas de ceros
  sin identidad. Filas parciales con información real se presentan como errores.
- Conservación de entradas originales, fórmulas, cachés, notas y correcciones.
- Fechas dd/mm/aaaa, ISO y seriales Excel con sistema 1900/1904; validación de
  calendario y rechazo de unidades o separadores numéricos ambiguos.
- Separación de minutos FCF, VEO y efectivos. Un cero VEO explícito tiene prioridad.
- Participación, pases fallidos/precisión, índice con los pesos verificados y primas.
- Cálculo de primas en céntimos, octava ocurrencia incluida, categorías independientes,
  derrotas que acumulan pero no pagan y umbral de P0 estrictamente superior a 65.
- Acumulación por jornada, como el SUMIFS del libro, no por fecha ni orden de filas.
- Estadísticas manuales de equipo/rival separadas de las sumas de jugadores.
- Cobertura de datos, originales por fila e inspector paginado de celdas/fórmulas.
- Filtros de incidencias por gravedad y texto, referencias exactas a celdas,
  perfiles ambiguos y discrepancias con el resumen y las cachés del Excel.
- Ninguna asociación automática a UUIDs de jugadores o sesiones. Los campos
  correspondientes permanecen explícitamente en null.

## Límites y tratamiento de errores

El parser usa SheetJS CE 0.20.3, fijado desde la distribución oficial indicada en
https://docs.sheetjs.com/docs/getting-started/installation/frameworks/ . El registro
npm de `xlsx` mantiene una versión antigua; no se usa esa distribución antigua.
La dependencia se incluye en el bundle del worker, sin descargas de CDN en ejecución.

El análisis se ejecuta en un Web Worker cancelable. Límite: 10 MB de archivo,
5.000 filas/64 columnas por hoja, 100.000 celdas con contenido y 30 segundos de
análisis. Se rechazan macros y referencias externas en fórmulas; no se evalúa
ninguna fórmula Excel. No se aceptan lecturas truncadas silenciosamente.

Las entradas manuales que contienen fórmulas se conservan para inspección y se
marcan como errores; sus cachés no se consideran fuentes fiables. La aritmética
local solo admite la versión de parámetros verificada en la auditoría. Un cambio
de pesos o parámetros bloquea índices/primas hasta revisar la metodología.

Los duplicados de dorsal, identidad, partido u observación se señalan; no se
fusionan ni se elige una fila arbitrariamente. Los errores del libro bloquean
las primas y los totales se identifican como potencialmente parciales. Goles o
asistencias pendientes de participantes también impiden calcular primas fiables.

Los valores ausentes permanecen null. El índice reproduce la contribución cero
que usa la fórmula del libro sin reemplazar los datos fuente. Las sumas de datos
completamente ausentes se muestran pendientes. Solo la reconciliación del resumen
reproduce el SUM de Excel que puede dar cero sin observaciones.

Las cachés del libro contienen números, porcentajes y monedas como texto. Se
interpretan únicamente para comparar con los resultados calculados, con tolerancia
para su precisión de presentación. No se afirma haber recalculado el libro en Excel.

## Piloto verificado

Jornada 5, Alzamora C.F., 18/10/2026, visitante, 3–3. Las 14 comprobaciones coinciden:

- 23 observaciones, 20 convocados, 15 participantes, 11 titulares.
- 990 minutos FCF, 1.089 efectivos, 3 goles individuales y marcador 3–3.
- Una amarilla, 112,9 km, 70 sprints, índice de Eloy 61,1.
- 30 € de primas calculadas SOLO con el historial contenido en el libro.

Las referencias se usan como comprobaciones de regresión. Si se cambia una
entrada, el visor calcula el nuevo resultado y muestra que la referencia difiere.

Se conserva la corrección de Montoro (+1 gol y +1 tiro ya incorporados); no se suma
otra vez. Las 16 paradas de Eloy ya incluyen 9 intercepciones de portero; no se
duplican. Se mantiene y avisa la nota manual Partidos!N2: dice segundo Luna, mientras
el índice sitúa a Montoro segundo (47,5 frente a 45,0).

El visor también explica las diferencias esperadas entre totales manuales del
equipo y sumas de jugadores. Las ocasiones siguen pendientes y los perfiles
genéricos/reutilizados se señalan para confirmación.

## Validación

- `npm test`: 38 pruebas correctas, incluidas las 17 de Fase 1 sin modificaciones.
- `npm run test:veo-ui`: 4 pruebas correctas con Edge headless en Windows.
- `npm run build:check`: TypeScript y build de producción Vite correctos. La salida
  se escribe en `.veo-build-check/`, ignorada, con `emptyOutDir=false`; no toca dist.
- `git diff --check`: sin errores de whitespace.

Las pruebas de navegador interceptan autenticación y rol con respuestas ficticias
y bloquean cualquier otro acceso externo. Ninguna petición llega a producción.
Comprueban archivo real mediante worker, filtros, limpieza, reimportación, rechazo
de viewer, archivo malformado y diseño móvil sin desbordamiento de página.

En otros sistemas se puede usar Chromium instalado por Playwright o definir
`VEO_BROWSER_CHANNEL`. Las pruebas que necesitan el libro privado se omiten con
un motivo explícito cuando no está disponible; en esta validación no se omitió ninguna.
No se incluye una copia del libro en los tests ni se escribe en él.

Vite conserva el aviso de chunk grande de la aplicación existente y la advertencia
de su API CJS. El visor se carga de forma diferida y el parser va en un worker separado.

## Inventario exacto de cambios

Archivos nuevos:

- `src/veo/types.ts`
- `src/veo/schema.ts`
- `src/veo/values.ts`
- `src/veo/calculations.ts`
- `src/veo/parser.ts`
- `src/veo/preview.ts`
- `src/veo/client.ts`
- `src/veo/worker.ts`
- `src/pages/VeoPreviewPage.tsx`
- `src/styles/veo-preview.css`
- `tests/veo.test.cjs`
- `tests/veo.playwright.config.cjs`
- `tests/veo.ui.spec.cjs`
- `docs/VEO_PREVIEW.md`

Archivos modificados:

- `src/App.tsx`: página diferida, título y entrada autenticada directa.
- `src/components/BottomNav.tsx`: acceso de administrador desde Más.
- `src/utils/appTypes.ts`: nueva pestaña veo.
- `vite.config.ts`: preoptimización xlsx para evitar recargas al primer análisis local.
- `package.json`, `package-lock.json`: parser, pruebas y comandos de validación.
- `.gitignore`: libro privado y artefactos de build/tests. Se conserva la línea
  previa de la usuaria `/data/*.xlsx1`; se añade la exclusión correcta de .xlsx.

No se modifican SQL, migraciones, políticas, datos, páginas operativas ni utilidades
de asistencia/evaluación. Los cambios previos de dist no pertenecen a esta función.
No se ha hecho commit, push, merge, cambio de rama ni despliegue.

## Antes de conectar Supabase

Falta aprobar: correspondencias con UUIDs reales (incluidos Isra/Pol y De Lima),
vínculo del partido a sessions.id, esquema aditivo y RLS, permisos de publicación,
historial anterior para contadores de primas, correcciones/revisiones y retirada
transaccional de lotes. Los importes actuales son orientativos sobre el historial
seleccionado; no constituyen pagos ni saldos definitivos.

Asistencia, convocatoria, evaluación del entrenador, tarjetas, sanciones y Solo
registros permanecen sepyarados: minutos o acciones VEO no escriben ni infieren
estados en esas entidades. No se ha implementado publicación ni integración VEO API.
