# Tarjetas y sanciones independientes

## Causa y alcance

La evaluación guardaba una única categoría antigua de tarjeta; no distinguía una amarilla seguida de roja directa. La sanción de expulsión exigía un número y la interfaz proponía un partido aunque no hubiera resolución. El botón de cumplimiento fijaba directamente `matches_served=matches_total`, sin identificar partidos. El reinicio de acumulación tomaba todas las amarillas simples existentes, por lo que podía consumir también amarillas posteriores al quinto aviso. Inicio y la ficha mostraban principalmente el total histórico.

La consulta de producción sí contiene dos expedientes separados para el jugador del caso comunicado: acumulación cumplida con una base de cinco, y una roja posterior marcada cumplida. No contiene evidencia del partido que cumplió la roja. Esto demuestra un cumplimiento no verificable, no que la aplicación haya fusionado automáticamente ambos expedientes. El antiguo `advance_suspensions_for_match` no está expuesto al usuario autenticado; tampoco se encontró una llamada actual del frontend. La actualización bloquea expresamente esa ruta antigua y la finalización ciega.

## Comportamiento nuevo

- Evaluación: sin tarjeta, una amarilla, doble amarilla con expulsión, roja directa, amarilla + roja directa. La duración puede dejarse vacía.
- Una tarjeta se corrige mediante el RPC y conserva su identificador y expediente. Quitarla crea una retirada lógica con auditoría, sin borrar el original. Cambiar un incidente cuyo cumplimiento ya está verificado exige revisar primero ese cumplimiento. Si la corrección invalidaría una acumulación pendiente, hay que revisar/cancelar explícitamente esa decisión primero; no queda una sanción inválida ni se duplica. Los duplicados históricos no se fusionan automáticamente.
- Las revisiones de tarjeta y de expediente se verifican por separado. Un borrador de evaluación antiguo no puede sobrescribir una resolución introducida desde otro dispositivo.
- Inicio, ficha, historial, resumen e informes distinguen el tipo combinado y las tarjetas retiradas. La cuenta de liga actual y el total histórico se muestran por separado en Inicio y ficha.
- **Coach y Admin** pueden registrar decisiones y verificar partidos. Solo Admin configura reglas. Esto sustituye la anterior restricción de gestión de sanciones a Admin por petición expresa de esta ampliación. El staff privado sigue siendo exclusivo de Admin; reabrir convocatorias/asistencias/evaluaciones sigue siendo exclusivo de Admin.
- «Sanción» abre decisión, duración opcional, aplicación, fecha de resolución, notas, cancelación e historial de partidos. Una duración desconocida sigue pendiente aunque se hayan verificado partidos.
- Solo un partido de liga completado, no futuro, posterior al origen y desde la fecha oficial de aplicación puede registrarse. Hay que confirmar que el jugador no participó y explicar el cumplimiento. Una asistencia de participación registrada impide servirlo, incluso si el jugador no es evaluable.
- Un partido no puede cumplir dos expedientes del mismo jugador. Corregir un cumplimiento lo revoca con motivo; no elimina su evidencia. Tampoco se puede cambiar después la asistencia/convocatoria para registrar participación sin revisar el cumplimiento.
- Completar una acumulación verificada consume el umbral de ese expediente, no todas las amarillas disponibles. Siete amarillas y un ciclo de cinco cumplido dan 2/5 y siete históricas. La base antigua se conserva y nunca se vuelve a descontar el mismo expediente.

## Reglas confirmadas y pendientes

Berta confirmó: acumulación solo en liga FCF, umbral actual cinco. La temporada configurable usa inicialmente el convenio julio–junio existente en la app. Todas las tarjetas, incluidas las de amistosos, permanecen en el histórico.

Las contribuciones de la doble amarilla (0, 1 o 2) y de la amarilla anterior a roja directa (0 o 1) empiezan como **pendientes**, no como cero confirmado. Las amarillas físicas siempre se conservan. Un jugador con un incidente pendiente muestra una cuenta por revisar; no se crea un expediente automático basándose en una regla desconocida. Admin puede confirmar estas reglas en «Reglas de la liga» tras comprobar la categoría/temporada FCF correspondiente. Cambiar reglas ya utilizadas por ciclos completados exige revisión; no se reescriben sus créditos.

El esquema actual no identifica competiciones de liga diferentes: se configura una liga por temporada. Si se incorporan varias ligas simultáneas, hará falta identificar la competición de cada sesión antes de separar sus acumulaciones. No se presupone una regla para solapar sanciones ni una suspensión automática de un partido por roja. La fecha de aplicación se introduce conforme a la resolución, no se deduce de una ausencia ni de la fecha de alta del registro.

## Cambios de esquema

Migración: `supabase/discipline/001_cases_and_service.sql`.

| Entidad | Cambio |
| --- | --- |
| `cards` | Tipo estructurado compatible con el enum antiguo, retirada lógica y revisión |
| `suspensions` | Duración nullable; estados pendiente/parcial; tarjeta de origen, decisión/aplicación/notas, umbral/temporada del ciclo, revisión histórica, idempotencia y revisión de concurrencia |
| `discipline_rules` | Liga, temporada, umbral y contribuciones configurables |
| `discipline_service_matches` | Evidencia por expediente/partido/jugador, verificador y revocaciones; índice único impide compartir partido |
| `discipline_cycle_credits` | Umbrales consumidos por ciclos verificados, separados por temporada |
| `discipline_audit` | Antes/después y autor de cambios explícitos |
| `player_card_totals`, `active_suspensions` | Tipos combinados y decisiones pendientes; vistas con `security_invoker` |

Se conservan `batch4_discipline_cycles`, `batch4_card_suspensions`, los originales deportivos y todos los guardas de Batch 4. Las tablas nuevas permiten lectura solo a roles autorizados; las escrituras se hacen mediante tres RPC: `discipline_workspace`, `discipline_save_card`, `discipline_action`. El guardado de evaluaciones y su columna calculada no se cambian.

Frontend principal: `DisciplineManager.tsx`, `PlayerDiscipline.tsx`, `SuspensionManager.tsx`, `lib/discipline.ts`, `utils/discipline.ts` y las páginas Evaluation, Home, Players, Callup, History y Summary. Los informes PDF comparten los mismos contadores físicos y no convierten duración desconocida en cero.

## Instalación coordinada

1. Publicar el frontend verificado. Detecta el nuevo RPC; si aún no existe (`PGRST202`) conserva la compatibilidad con el esquema anterior. Otros errores bloquean la gestión, no provocan una degradación silenciosa.
2. En Supabase SQL Editor como `postgres`, ejecutar **completo** `supabase/discipline/001_cases_and_service.sql`. Es una instalación atómica única; si ya existe, aborta e indica usar el diagnóstico. No repetir `REVIEW_INSTALL.sql` ni el instalador de staff.
3. Ejecutar `diagnostics/discipline_post_install_check.sql` y comprobar `all_ok: true`. Los contadores de históricos por revisar y reglas pendientes pueden ser positivos: son avisos deliberados.
4. Cerrar/reabrir la app o recargarla en los dispositivos. Los clientes antiguos no podrán usar los RPC de escritura disciplinaria sustituidos; recibirán una indicación de actualizar. La migración no confirma evaluaciones ni completa ninguna sanción existente.
5. Validar primero con una sesión de prueba y datos sintéticos. Revisar después los expedientes históricos individualmente; no se reparan en masa.

La migración añade metadatos de revisión a casos existentes, pero no cambia sus valores originales de estado, duración, servicio, tarjetas, evaluaciones, asistencias o convocatorias. No hay un rollback destructivo automático después de empezar a registrar nuevos expedientes. Conservar el esquema nuevo y corregir hacia delante evita perder las nuevas evidencias de servicio.

## Revisión del caso comunicado

En la ficha del jugador → Sanciones, abrir **la roja posterior**, no la acumulación anterior. Comprobar la resolución y si existe realmente un partido de liga posterior que la cumpla. Guardar fecha de aplicación, notas y duración oficial, o dejarla vacía si no se conoce. La opción «He revisado esta sanción histórica» sustituye expresamente el contador antiguo por los partidos verificados de ese expediente, con confirmación y auditoría. Con cero partidos verificados, la roja vuelve a quedar pendiente en lugar de reutilizar el descanso anterior. No efectuar este cambio sin confirmar la historia con el responsable deportivo.

La acumulación anterior mantiene su base de cinco. Para documentar sus partidos sin consumir otras cinco amarillas, guardar origen/aplicación, verificar el partido real y completar la revisión histórica; el RPC reconoce la base anterior. Si no se conoce el origen/partido, conservar el aviso de revisión en vez de inventarlo. Una base antigua incompatible con las amarillas conocidas de liga también se muestra como pendiente de revisión.

## Validación reproducible

- `npm test`: incluye PostgreSQL aislado con exportación del esquema real, migración preservando originales, permisos, A–J, temporada y pruebas de informes/contadores.
- `npm run test:discipline-ui`: navegador con componentes reales y un PostgreSQL aislado detrás de los RPC, sin acceso a Supabase. Comprueba selección, edición sin duplicados, Coach, resolución posterior, dos partidos independientes, móvil, concurrencia y revisión histórica explícita.
- `npm run test:final-ui`: regresión de evaluaciones, cierres, informes, navegación, acceso y staff con el esquema anterior.
- `npm run build`: TypeScript y compilación de producción.

Prueba manual: registrar «Amarilla + roja directa» en una evaluación abierta, dejar duración vacía, guardar y comprobar histórico. Abrir «Sanción», guardar resolución de dos partidos y aplicación. Verificar un partido elegible con comentario: queda uno. Verificar el segundo: queda cumplida. Intentar usar ese mismo partido en otro expediente: debe rechazarse. Confirmar que las notas, cierres y total histórico siguen intactos. Para acumulación, usar cinco amarillas de liga en datos de prueba y dos más; al verificar el ciclo de cinco deben quedar 2/5 y siete históricas.
