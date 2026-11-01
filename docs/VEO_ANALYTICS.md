# VEO Analytics: uso, validación y activación

## Estado de entrega

El módulo incluye Dashboard, Partidos, Jugadores, Rankings y comparación, Primas e
Importación. Administradores pueden analizar Excel local, revisar correspondencias,
publicar y retirar lotes; entrenadores pueden consultar datos publicados. Viewer
no tiene acceso VEO. Las operaciones de escritura se autorizan también en SQL.

Estado de producción confirmado por el responsable: las migraciones 001 y 002 ya
están aplicadas en Supabase PostgreSQL 17.6; existen las cuatro tablas con RLS y
la vista `security_invoker=true`. J5 (18/10/2026, Alzamora 3–3) ya está publicado:
23 observaciones, 1.089 minutos efectivos y 30 € calculados (Montoro, Koshey y
Luna: 10 € cada uno). Se validaron las cinco secciones tras recargar y el acceso
real del entrenador (lectura, sin importación). La vista permite SELECT
a authenticated y no permite INSERT/UPDATE/DELETE. El fichero local 002 refleja
ese ajuste. **No volver a ejecutar las migraciones iniciales.** Ver el cierre y
los pasos pendientes en [VEO_ACTIVATION_HANDOFF.md](VEO_ACTIVATION_HANDOFF.md).

## Prueba local sin publicar

1. Desde la raíz del proyecto: `npm install` si faltan dependencias.
2. Ejecutar `npm run dev -- --host 127.0.0.1`.
3. Abrir `http://127.0.0.1:5173/?veo-preview=1` e iniciar sesión con una cuenta
   existente de administrador. Si Vite usa otro puerto, usar el que indique.
4. Seleccionar `data/BIG DATA EQUIPO.xlsx` desde el control de archivo del navegador.
5. Comprobar la reconciliación del piloto y recorrer las seis pestañas. El origen
   cambia a **Excel local · sin publicar**. Temporada y serie separan los conjuntos.
6. En Partidos inspeccionar las notas MVP, estadísticas manuales y observaciones.
   En Jugadores y Rankings comprobar filtros, cobertura y métricas pendientes.
   En Primas revisar desglose y explicación por jugador/partido.
7. En Importación inspeccionar celdas originales, fórmulas, advertencias y el plan
   de cambios. Sin esquema activado, directorios y publicación quedan deshabilitados.
8. Limpiar la previsualización elimina el archivo analizado de la memoria del módulo.
   Recargar o cerrar la aplicación también lo descarta. Cambiar de pestaña conserva
   el análisis mientras permanece montado el proveedor autenticado.

La entrada general es `/?veo=1`; la navegación habitual ofrece **Más → VEO Analytics**.
El enlace directo autentica y verifica el rol, pero evita montar páginas operativas
con RPC de inicio ajenas a VEO. Para pruebas exclusivamente VEO, usar este enlace.
El panel del perfil existente muestra únicamente datos publicados por UUID revisado;
no vincula un Excel local por parecido de nombre o dorsal.

El Excel no se copia a public/ o dist/, no se importa desde el código y no se sube
al seleccionarlo. El parser vive en un Web Worker con límites y cancelación.
La previsualización no usa localStorage. Solo la publicación aprobada envía hechos
y procedencia a las tablas VEO. Las pruebas de navegador bloquean accesos externos.

## Cálculos y límites de interpretación

- Un cero VEO explícito prevalece sobre FCF. VEO vacío usa FCF; no convocado da cero.
  Participar exige minutos efectivos positivos. Las columnas originales conservan
  sus valores, incluidos null y cero, aunque una fórmula aporte cero al cálculo.
- Índice por partido: goles×10, asistencias×6, ocasiones×3, tiros×2, entradas×2,
  intercepciones×2, recuperaciones×2, paradas×3, regates×1, pases exitosos×0,2,
  fallidos×−0,1, amarillas×−3, rojas×−8; redondeo Excel a un decimal. Sin participación
  no hay índice. Si faltan pases exitosos, la fórmula verificada usa pases totales
  en esa contribución; no inventa un dato de precisión. Los otros inputs ausentes
  aportan cero al índice y siguen ausentes en la fuente. Parámetros distintos a los
  verificados generan bloqueo en el importador.
- Totales: suma de observaciones conocidas; si todas faltan, pendiente. Medias de
  métricas deportivas: partidos jugados que contienen ese dato, incluidos ceros
  explícitos. Índice: media de índices de participantes. Precisión: exitosos/pases
  de las filas con dato de éxito. Velocidad máxima: máximo; velocidad media:
  ponderada por minutos efectivos. No se suman velocidades ni porcentajes.
- Estadísticas manuales equipo/rival permanecen separadas de sumas individuales.
  Las notas no generan eventos: las correcciones existentes de goles, tiros y
  paradas ya están incorporadas. No se suman de nuevo.
- Para 2026–2027 **solo J5 en adelante** acumula primas. J1–J4 conserva estadísticas
  deportivas y nunca cambia contadores financieros, aunque se importe después.
  Otras temporadas no tienen regla financiera aprobada: importes no calculables.
- Contadores independientes por serie, temporada, UUID y categoría, ordenados por
  jornada. Primeras siete ocurrencias: 10 € cada una; desde la octava: 20 €.
  Un partido con varias ocurrencias puede atravesar el umbral. Goles/asistencias
  en derrota acumulan pero no generan importe; solo victorias/empates lo generan.
  P0 exige elegibilidad revisada, portería a cero y más de 65 minutos efectivos.
- Se detectan huecos desde J5 hasta la última jornada importada. Ausencia de huecos
  no certifica fin de temporada ni integridad de observaciones omitidas por el libro.
  Los importes son cálculos sobre el historial disponible, **no registros de pago**.
  Entradas financieras incompletas impiden presentar importes fiables.

Piloto Alzamora, J5, 18/10/2026, 3–3: 23 observaciones, 20 convocados,
15 participantes, 11 titulares, 990 minutos FCF, 1.089 efectivos, 3 goles,
1 amarilla, 112,9 km, 70 sprints, Eloy 61,1 y 30 € calculados. Las 14
comprobaciones de referencia coinciden y proceden de cálculos sobre el archivo.
La nota Partidos!N2 sitúa segundo a Luna; se conserva y se advierte que Montoro
obtiene 47,5 frente a 45,0. Ocasiones permanecen pendientes.

## Activación de Supabase: procedimiento único, manual

No ejecutar estas instrucciones automáticamente desde la aplicación ni desde los
tests. Debe revisarlas y aplicarlas la persona responsable de la base. La guía no
requiere ni proporciona credenciales service-role en el frontend.

### 1. Verificaciones previas de solo lectura

Confirmar el proyecto Supabase correcto y disponer de su procedimiento habitual de
backup/restauración. Se recomienda validar primero en una copia aislada del esquema.
Las migraciones requieren PostgreSQL 15+ por `security_invoker`, `auth.uid()`,
`gen_random_uuid()`, `public.profiles(id, role)`, `public.players(id)` y
`public.sessions(id, session_date, type)`. Roles admitidos: admin, coach, viewer,
con perfiles y RLS existentes confiables. No modificar roles ni políticas operativas.

Consultas opcionales en el editor SQL, todas de lectura:

```sql
SELECT current_database(), current_setting('server_version');
SELECT table_name, column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('profiles','players','sessions')
ORDER BY table_name, ordinal_position;
SELECT role::text, count(*) FROM public.profiles GROUP BY role::text;
SELECT DISTINCT type::text FROM public.sessions ORDER BY 1;
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies WHERE schemaname='public' AND tablename='profiles';
SELECT to_regclass('public.veo_import_batches'), to_regclass('public.veo_matches');
```

Si los objetos VEO ya existen, **no volver a aplicar el primer fichero a ciegas**:
comparar su definición/versión con esta entrega. No se incluyen DROP ni resets.
Las sesiones elegibles para vincular son las existentes de tipo league_match,
friendly_match, scrimmage o tryout y con la misma fecha; el administrador debe
confirmar también rival y jornada. Nunca se crea una sesión por la importación.

### 2. Solo para una instalación nueva: revisar y ejecutar ambos ficheros en orden

En el editor SQL de Supabase, ejecutar el contenido completo de cada archivo:

1. `supabase/veo/001_veo_analytics.sql`
2. `supabase/veo/002_veo_read_model.sql`

Cada fichero contiene BEGIN/COMMIT y notificación de recarga de esquema PostgREST.
El primero crea cuatro tablas VEO, índices, claves, RLS y RPC; el segundo crea la
vista de cálculo de solo lectura. No alteran tablas, funciones ni políticas
operativas existentes. La versión esperada es esquema 1 / regla `2026-j5-v1`.
Si falla el segundo, sus cambios revierten por transacción; revisar el error y
completarlo antes de publicar. No interpretar el primer commit como activación
verificada de todo el procedimiento.

### 3. Verificar roles y lectura desde la aplicación

Recargar `/?veo=1` o pulsar **Volver a comprobar**. Con administrador debe terminar
la carga y mostrar un conjunto vacío real, no el aviso de esquema ausente.
El frontend usa únicamente la sesión/clave pública habitual de Supabase.

- Admin: consulta tablas VEO y directorios; revisa/importa/retira con aprobación.
- Coach: consulta partidos activos y sus observaciones; no importa ni lee la
  procedencia privada de lotes, historial administrativo o correspondencias.
- Viewer y anónimo: sin lectura VEO ni publicación.
- Ningún usuario autenticado tiene INSERT/UPDATE/DELETE directo sobre tablas VEO.
  Las funciones de publicación y retirada vuelven a consultar profiles/auth.uid().

Comprobar con sesiones reales de esos roles, no con el SQL Editor como propietario:
el propietario puede eludir RLS. `veo_status()` exige una sesión staff y debe devolver
`{"version":1,"ruleVersion":"2026-j5-v1"}`. La vista `veo_calculated_stats` usa RLS
del invocador. Verificar que los usuarios no puedan editar su propio role mediante
políticas existentes; el módulo depende de la autoridad actual de perfiles.

### 4. Primer lote y correspondencias

Subir el libro piloto, mantener serie estable (por defecto inspire) y confirmar
temporada. Seleccionar los 23 UUIDs de jugadores y sessions.id del 18/10/2026.
No hay asignación automática de candidatos nuevos por nombre, dorsal o perfil VEO.
Se reutilizan solo correspondencias previamente aprobadas y no ambiguas. Si falta
un jugador o sesión en el directorio, resolverlo por el flujo operativo autorizado
fuera de VEO antes de continuar; el importador no los crea.

Revisar en particular Pol Pariente #11/perfil reutilizado de Isra y Roger De Lima
#18/perfil De Lima. La correspondencia concreta requiere conocimiento humano;
ningún UUID real se ha adivinado. Revisar también las otras identidades y el rival
de la sesión. Cambiar dorsal posteriormente no cambia el UUID histórico publicado.

Inspeccionar errores, advertencias, cambios y primas. Marcar la aprobación explícita
y pulsar **Publicar lote aprobado** solo cuando se desee escribir. Esperar respuesta
del servidor y recarga; elegir **Datos publicados** para consultar. Los datos locales
siguen etiquetados como no publicados. Si la respuesta se pierde, recargar el
historial antes de repetir: el servidor trata el contenido idéntico como no-op.

### 5. Correcciones, revisiones y retirada

Una clave de partido es serie+temporada+jornada, con vínculo único a sessions.id.
Una observación es partido+players.id. Reimportar el mismo contenido no crea otro
lote ni duplicados. Un archivo diferente con datos iguales tampoco duplica hechos.
Un lote corregido muestra qué cambia y qué filas VEO retira de la revisión activa;
los partidos omitidos del archivo se conservan. Los snapshots del lote preservan
la revisión anterior y las celdas fuente conservan el origen de las correcciones.

Publicar usa un único RPC transaccional: validación completa, bloqueo por serie y
temporada, revisión esperada, snapshot y sustitución de hechos VEO. Si otra persona
cambió los datos desde la revisión, se rechaza con conflicto; recargar y revisar.
Una excepción SQL revierte todo el lote, sin estado parcialmente publicado.

Para retirar, abrir **Historial de importaciones → Revisar retirada de este lote**,
leer el efecto, marcar su aprobación y pulsar **Retirar lote aprobado**. Se restauran
los snapshots previos o se desactivan partidos nuevos, sin borrar historia de lotes.
No se permite retirar un lote si otro posterior sigue modificando sus partidos:
retirar las revisiones posteriores primero. Las correspondencias aprobadas se
conservan como historial; si hay varias identidades para la misma clave de origen,
la próxima importación vuelve a exigir selección explícita.

Para desactivar uso sin perder información, dejar de publicar y retirar los lotes
desde la interfaz según corresponda; no hay script automático de DROP ni borrado
de tablas. Cualquier retirada física del esquema requiere una revisión separada
y conservación previa de su historial. No se necesita revertir tablas operativas.

## Modelo y consultas de lectura

| Objeto | Finalidad / integridad |
|---|---|
| veo_import_batches | Procedencia privada, hash SHA-256 de archivo, hash de contenido, actor, versión de reglas, validación, snapshots y retirada |
| veo_player_links | Correspondencias revisadas por serie/clave de origen/UUID; FK restrict a players; conserva aprobaciones históricas |
| veo_matches | Serie/temporada/jornada únicos, sesión única FK restrict, datos manuales originales, revisión y lote activo |
| veo_player_match_stats | PK partido+UUID, vínculo revisado y lote FK, métricas originales JSONB con null y ceros |
| veo_calculated_stats | Vista security_invoker: minutos, índice, pases, contadores y primas por observación |

La aplicación pagina lecturas con límites; falla explícitamente ante errores o
conjuntos excesivos en lugar de presentar resultados parciales como completos.
Agrega por temporada/serie y UUID mediante el motor tipado. La vista SQL reproduce
los cálculos y se contrasta con ese motor en pruebas. Ejemplos de lectura tras activar:

```sql
SELECT namespace, season, round, session_id, revision
FROM public.veo_matches WHERE active ORDER BY season, namespace, round;
SELECT match_id, player_id, effective_minutes, performance_index, passing_rate,
       previous_goals, goal_bonus_cents, total_bonus_cents
FROM public.veo_calculated_stats
WHERE season='2026-2027' AND namespace='inspire'
ORDER BY round, player_id;
```

No se deriva asistencia, convocatoria, elegibilidad operativa, tarjetas, sanciones
ni suspensiones a partir de métricas VEO. Coach evaluations y su corte de Fase 1
son independientes. Records Only y datos históricos operativos se preservan.

## Validación automatizada y aceptación

- `npm test`: 63 pruebas correctas, 0 fallos y 0 omitidas con el libro disponible;
  incluye las 17 regresiones de Fase 1, parser/cálculos, UUIDs, duplicados,
  correcciones, ranking, agregaciones, repositorio y PostgreSQL real en memoria.
- `npm run test:veo-ui`: 8 pruebas Edge headless correctas: Excel real vía worker,
  errores, reimportación, permisos, publicación/retirada con transporte simulado,
  seis secciones móviles (390×844) sin desbordamiento horizontal de página.
- La autorización SQL, RLS, atomicidad, idempotencia, revisiones, retirada, piloto
  y corte J5 se prueban ejecutando ambos ficheros en PGlite en memoria. No se
  conecta a Supabase ni se usa una base de producción para los tests.
- `npx tsc --noEmit --incremental false`: comprobación TypeScript estricta.
- `npm run build:check`: TypeScript más build Vite en `.veo-build-check/`, ignorado;
  no escribe en dist/. No hay configuración adicional de lint en el proyecto.
- Capturas y resultados de navegador en `.veo-test-artifacts/`, ignorado y privado.
  En Windows se usa Edge instalado; otros entornos pueden usar Chromium de
  Playwright o configurar VEO_BROWSER_CHANNEL.

El responsable confirmó la publicación real de J5, sus cifras, las cinco secciones
tras recargar y la lectura del entrenador sin importación. Las migraciones ya están
aplicadas y no deben repetirse. Tras el despliegue de la aplicación, repetir una
comprobación de lectura y roles sin modificar ni volver a publicar el partido.
La base debe cumplir el contrato de perfiles descrito. No hay integración con la
API VEO ni administración de pagos: la fuente aprobada es el Excel y el alcance
financiero son importes calculados, no pagos.

## Inventario de archivos de esta entrega (incluye el preview reutilizado)

Modificados respecto a 1d4bea2:

- `.gitignore`, `package.json`, `package-lock.json`, `vite.config.ts`.
- `src/App.tsx`, `src/components/BottomNav.tsx`, `src/pages/PlayersPage.tsx`,
  `src/utils/appTypes.ts`.

Nuevos respecto a ese commit:

- `src/veo/types.ts`, `schema.ts`, `values.ts`, `calculations.ts`, `parser.ts`,
  `preview.ts`, `client.ts`, `worker.ts`, `analytics.ts`, `importProtocol.ts`,
  `repository.ts`, `VeoContext.tsx` (todos dentro de src/veo/).
- `src/pages/VeoPreviewPage.tsx`, `VeoModule.tsx`, `VeoImportAdmin.tsx`.
- `src/components/VeoCharts.tsx`, `VeoPlayerPanel.tsx`.
- `src/styles/veo-preview.css`, `veo-analytics.css`.
- `supabase/veo/001_veo_analytics.sql`, `002_veo_read_model.sql`.
- `tests/veo.test.cjs`, `veo-analytics.test.cjs`, `veo-database.test.cjs`,
  `veo.ui.spec.cjs`, `veo.browser-fixture.cjs`, `veo.playwright.config.cjs`.
- `docs/VEO_PREVIEW.md`, `docs/VEO_ANALYTICS.md`.

No incluir los cambios preexistentes de dist/ en esta entrega. El build de
validación no los modifica. El Excel fuente permanece sin cambios ni copia pública.
No se hizo commit, push, merge, despliegue, cambio de rama ni migración de producción.
