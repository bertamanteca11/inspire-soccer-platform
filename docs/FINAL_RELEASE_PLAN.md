# Plan de publicación — BACKEND INSTALADO, PUBLICACIÓN EN CURSO

Actualizado: 6 de noviembre de 2026. Esta entrega es local. Los adaptadores y
operaciones atómicas ya están preparados. Consultar primero
`RELEASE_REVIEW_2026_11_06.md`: detalla el paquete transaccional REVIEW_INSTALL.sql,
disciplina, cuatro cualidades y cierre de permisos de vistas.
El usuario ha instalado manualmente el backend y aportado `all_ok: true` en la
comprobación de firmas, grants, guards, vistas y RLS. La API externa confirma la
columna requerida con HTTP 200. Con la autorización de publicación ya recibida,
se publica ahora el frontend compatible mediante `main` y Vercel. El backup no
ha sido confirmado expresamente y los recorridos autenticados Admin/Coach aún
necesitan una comprobación real; no se presentan como verificados.

Comprobación anterior a la instalación manual, del 6 de noviembre: el Supabase configurado devolvía
`42703` al consultar la columna `sessions.draft_defaults_version` (no existe) y
`PGRST202` para el RPC de acceso consultado por GET anónimo. Esa consulta no certifica
los permisos de usuarios autenticados, pero la columna ausente ya confirma que
el esquema todavía era incompatible con esta versión. Ese bloqueo concreto queda
resuelto por la instalación manual. Ver `PRODUCTION_READINESS_2026_11_06.md`.

## Condiciones previas y aprobaciones manuales

1. Susan confirma las decisiones de `SUSAN_REVIEW_CHECKLIST.md`, especialmente
   los datos reales pendientes. El usuario ya confirmó cuatro cualidades, nota
   inicial 3 para nuevas evaluaciones y bandas altas 4–5/bajas 1–2, además de las
   tres sesiones de la revisión del 18/21/23 de octubre. El audio posterior pide
   últimas cuatro semanas por defecto y temporada completa; el usuario confirma
   julio–junio. Susan indica injustificada para Marcos el 18 y el 21; la corrección
   remota sigue pendiente de aplicación y verificación. Sergi aportará la lista VEO.
2. Una persona autorizada obtiene el inventario de solo lectura de
   `diagnostics/final_schema_read_only.sql`. El archivo no se ejecutó aquí. Incluye
   funciones completas, propietarios, permisos, RLS, triggers y restricciones.
   La consulta final admite que todavía no exista `draft_defaults_version`.
   Para obtener todas las secciones en una sola celda JSON, usar
   `diagnostics/final_schema_export_read_only.sql`, también de solo lectura.
3. Revisar `prevent_locked_session_edits()` completo. El predicado aportado es
   `status='locked' OR locked_at IS NOT NULL`; faltan la excepción Admin, los eventos
   cubiertos y las reglas reales sobre archivo y reapertura. No adivinarlas.
4. Revisar `enforce_high_rating_limit()`, `create_yellow_accumulation_suspensions`,
   triggers de cards/suspensions, cálculo de doble amarilla, unicidad e idempotencia.
5. Cumplir las condiciones de publicación con el paquete SQL definitivo revisado,
   copia recuperable y pruebas autenticadas antes de activar la interfaz nueva.
   La solicitud actual de publicación no elimina esos requisitos. Las reparaciones
   de datos personales siguen fuera de este despliegue hasta verificarlas.

## Copia de seguridad y línea base

- Crear y verificar una copia recuperable de datos y esquema antes de la ventana
  de mantenimiento. Conservar políticas, grants, owners, funciones, triggers, vistas,
  valores de confirmación, timestamps y marcadores existentes. Probar restauración
  en una base aislada, nunca sobre la base activa como ensayo.
- Guardar métricas por sesión/jugador y snapshots de asistencia, evaluaciones,
  tarjetas, sanciones, destacados y VEO. Comparar antes/después. Los datos reales no
  deben entrar en tests, commits ni documentos públicos; anonimizar el clon.
- Conservar la versión desplegada, las variables de entorno y sus referencias
  seguras. No imprimir claves ni introducir credenciales privilegiadas en Vite.

## Orden de SQL propuesto, solo tras revisión

| Orden | Artefacto | Estado |
|---|---|---|
| 0 | Migraciones antiguas realmente pendientes | Inventariar; no ejecutar el ZIP entero. En particular, `FINAL_2026_27.sql` cambia permisos de destacados y no debe ejecutarse por rutina. |
| 1 | `supabase/batch4/001_draft_defaults_version.sql` | Preparado; columna nullable, sin default ni backfill. Requiere aprobación manual. |
| 2 | `001a_live_adapters.sql` | Preparado a partir del diagnóstico real; incluye ambos adaptadores y límites/N/A para cuatro cualidades. Probado localmente, pendiente Supabase. |
| 3 | `002_workflow_security.sql` | Guards y RPC; rechaza instalaciones Batch 4 previas que necesitan un upgrade específico. |
| 4 | `003_discipline_and_standouts.sql` | Tarjeta/sanción y destacados atómicos, cumplidas, cuenta actual e histórico; bloquea escrituras directas. |
| 5 | `004_view_security.sql` | Las tres vistas usan security_invoker y SELECT autenticado; revoca acceso anónimo y escrituras por vistas. |
| 6 | Actualizar caché PostgREST si es necesario | Solo tras comprobar firmas y grants en el clon. No crear sobrecargas ambiguas. |

Usar el paquete transaccional `REVIEW_INSTALL.sql` revisado para que un fallo
revierta todos los pasos, en lugar de dejar archivos individuales aplicados.
No se ha creado una nueva migración de VEO ni POLAR. Tampoco se ha creado
una nueva migración de VEO, POLAR ni de permisos generales para Coach.
Si ya existe alguna parte de Batch 4, diseñar un upgrade específico desde ese
inventario; los scripts de instalación no son idempotentes ni un mecanismo de reparación.

## Validación obligatoria en un clon aislado

- Reproducir dependencias desde package-lock (`npm ci --ignore-scripts`) con un
  entorno Node compatible; la comprobación local usa Node 22.20.0 y Edge. Las
  versiones fijadas son jsPDF 4.2.1, AutoTable 5.0.9 y Vite 6.4.5. Ejecutar audit,
  build y suites, especialmente PDF y worker VEO, sin saltar los binarios nativos.
- Aplicar el orden anterior con los tipos, vistas, RLS y triggers reales.
  Comprobar que no cambia ninguna fila histórica ni los grants originales.
- Probar autenticación Admin (Susan/Berta), Coach (Sergi), consulta y anónimo.
  Verificar también que un usuario no puede cambiar su propio rol en profiles.
- Probar peticiones directas a tablas y RPC, no solo botones: plantilla parcial,
  snapshot obsoleto, cero filas, identidades ajenas, estados desconocidos, INSERT
  ya confirmado, cambio de session_id/player_id y evaluated=true directo.
- Probar `locked` y `locked_at` por separado, archivo/restauración, confirmaciones
  independientes y reapertura Admin de un único flujo.
- Ejecutar transacciones concurrentes desde conexiones distintas: edición/confirmación,
  confirmación/reapertura, cambios de plantilla y puntuaciones simultáneas. Revisar
  deadlocks, rollback y reintento sin repetir efectos disciplinarios.
- Simular tarjeta guardada/sanción fallida, acumulación fallida y confirmación fallida.
  El RPC nuevo debe revertir toda la operación; verificarlo también vía PostgREST
  y confirmar que no se repiten efectos al reintentar desde otro cliente.
- Probar el reemplazo atómico de destacados: si falla la inserción, conserva la
  selección anterior. Confirmar que Coach tampoco escribe mediante API directa.
- Ejecutar todas las suites locales y contrastar informes/estadísticas con los
  registros persistidos del clon. No usar defaults visuales como fuente oficial.

## Compatibilidad y ventana de mantenimiento

El frontend actualmente desplegado, anterior a Batch 4, confirma con updates
directos de sessions/evaluations. Los nuevos guards rechazan esas operaciones.
No es compatible para escritura con migration 002. La rama WIP requiere los RPC;
no debe publicarse sola contra una base sin ellos.

La firma preparada tiene seis argumentos; el sexto, `p_expected_rows`, es opcional
salvo al confirmar convocatoria. Un cliente WIP de cinco argumentos no puede
confirmar convocatorias sin el snapshot original. Nunca conservar a la vez una
sobrecarga antigua de cinco argumentos que mantenga un bypass.

Secuencia tras todas las aprobaciones:

1. Cerrar temporalmente el acceso de escritura y avisar a los usuarios mediante el
   procedimiento humano aprobado. Cerrar pestañas antiguas; no confiar solo en caché.
2. Verificar backup y punto de recuperación. Aplicar SQL revisado en el orden anterior.
3. Comprobar funciones, grants y guards con las cuentas autenticadas de prueba.
4. Publicar el frontend compatible previamente construido y revisado, desde esta
   rama y sus commits aprobados. No copiar `.git`, `.env`, datos o node_modules.
5. Recargar clientes y ejecutar smoke tests antes de volver a permitir escritura.
6. Supervisar errores RPC/RLS, lecturas incompletas, duplicados y tiempos de carga.

## Smoke tests y recuperación

En una sesión explícitamente de prueba: crear origen operativo, revisar y confirmar
convocatoria Admin; comprobar Coach solo lectura; abrir asistencia sin escrituras,
guardar estados y notas, confirmar sin guardado implícito y reabrir como Admin.
Evaluar por cualidad/jugador, N/A reversible y comentarios separados; confirmar
atómicamente y comprobar denegaciones directas cuando está cerrado/bloqueado.
Verificar históricos/inactivos, PDF/CSV, corte oficial de rendimiento y primas
VEO desde J5 (J1–J4 no avanzan los contadores).

Si falla una migración dentro de su transacción, abortarla. Migration 001 es
aditiva e independiente; no borrar su columna ni sus valores para volver atrás.
Si falla el frontend, mantener suspendida la escritura y usar un frontend
compatible con los guards, o una versión de consulta previamente validada.
No volver a la versión antigua con autosave/confirmación parcial y no quitar
protecciones de flujos cerrados para hacerla funcionar.
Revocar un RPC problemático o restaurar datos requiere aprobación explícita y un
análisis de lo escrito desde el backup. Preferir una corrección hacia delante.
No usar CASCADE, borrar históricos, resetear flags en bloque ni reejecutar SQL antiguo.

Los iconos PWA siguen pendientes: el escudo actual es AVIF, aunque se llama PNG,
y mide 283×330. Conservarlo visualmente y preparar exportaciones PNG cuadradas
192/512 y apple-touch-icon desde el original aprobado. Probar instalación real
en Android/iOS; no prometer funcionamiento sin conexión.
