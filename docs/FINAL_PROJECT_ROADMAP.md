# Auditoría final y roadmap — Inspire Soccer

Actualizado: 6 de noviembre de 2026. Trabajo local en `inspire-soccer-platform`,
rama `feature/premium-ui-redesign`, HEAD `49ea7a4` preservado. La copia
`inspire-soccer-main-release`, main en `8af9ded`, no se modifica.

**PENDIENTE DE VALIDACIÓN FINAL EN SUPABASE ANTES DE PRODUCCIÓN.** Los adaptadores,
disciplina atómica y cierre de permisos ya están preparados localmente; falta la
validación autenticada del entorno separado y la aprobación de publicación.
Los documentos nuevos son la referencia de publicación; las instrucciones antiguas
se conservan como historial, no como autorización para ejecutar SQL o publicar.

Actualización del diagnóstico: el usuario ha aportado la exportación real de solo
lectura y confirma que no tiene un entorno de pruebas. La revisión inicial está en
`LIVE_SCHEMA_REVIEW.md`: faltan las funciones Batch 4; ya están disponibles los
cuerpos de bloqueo global, límites altos y acumulación de amarillas. Las referencias
posteriores a definiciones faltantes deben leerse con esa actualización. La
exportación de current_role/opciones de vistas también se ha recibido. Los cambios
posteriores de Susan y su estado actualizado se documentan en
`RELEASE_REVIEW_2026_11_06.md` y su informe de validación, que actualizan las filas
históricas posteriores sobre cinco cualidades, adaptadores y disciplina.

Estados: COMPLETE AND VERIFIED; IMPLEMENTED BUT NEEDS VERIFICATION; INCOMPLETE;
BLOCKED; REQUIRES SUSAN'S CONFIRMATION. «Verified» en este documento significa el
alcance local indicado. Una base con esquema sintético o un navegador interceptado
no certifican la base real. Cada fila distingue esa limitación cuando corresponde.

## 0. Preservación, auditoría y línea base

| Requisito | Estado | Evidencia, pruebas y trabajo restante |
|---|---|---|
| Historial Git, Batch 4 y premium preservados | COMPLETE AND VERIFIED | Árbol inicialmente limpio; 3a6f7db, 49ea7a4, 6ffda00, 060c493 y dddf53a conservados. Sin commits, reset, clean ni checkout. |
| Scripts y lockfile versionados | COMPLETE AND VERIFIED | package.json/package-lock.json y suites estaban en Git. npm test incluye Batch 4/final-quality. Versiones fijadas de seguridad: jsPDF 4.2.1, AutoTable 5.0.9 y Vite 6.4.5; sin nuevos paquetes directos. |
| Instrucciones, estructura, páginas, servicios, hooks, SQL y tests | COMPLETE AND VERIFIED | Inventario de los 82 archivos iniciales de src, migraciones, pruebas y documentación; revisión de rutas/mutaciones relevantes. No se halló AGENTS.md en repositorios/ancestros. Definiciones reales faltantes documentadas. |
| Línea base tests/build | COMPLETE AND VERIFIED | 95 generales + 10 Batch 4; TypeScript y build:check correctos antes de editar. FINAL_TEST_REPORT recoge verificaciones finales y límites. |
| Datos reales y archivos preexistentes | COMPLETE AND VERIFIED | No conexión a Supabase, backfill, SQL real, edición de credenciales ni cambios de producción. dist y .env preservados. |

## 1–2. Reglas de roles y seguridad

| Requisito | Estado | Código, tests y bloqueo |
|---|---|---|
| Susan/Berta Admin y Sergi Coach | IMPLEMENTED BUT NEEDS VERIFICATION | App verifica profiles y acepta únicamente admin/coach/viewer. auth.ui prueba cambio de cuenta y respuestas tardías. Falta comprobar identidades reales. |
| Convocatoria escribe/confirma Admin; Coach consulta | IMPLEMENTED BUT NEEDS VERIFICATION | CallupPage, useWorkflowAccess, 002, batch4-database/final.ui. Sin ampliación de RLS. Integración real bloqueada. |
| Asistencia/evaluación staff mientras abiertas; reapertura Admin | IMPLEMENTED BUT NEEDS VERIFICATION | workflows, guard/RPC 002, suites Batch 4/Phase 4; falta clon autenticado con esquema real. |
| Sin UPDATE general de sessions para Coach | COMPLETE AND VERIFIED | No se modifica una política de sessions ni grants de tabla. PGlite verifica cero filas Coach. Configuración real preexistente no certificada. |
| Estados independientes y sin reapertura cruzada | IMPLEMENTED BUT NEEDS VERIFICATION | RPC cambia solo flags del flujo elegido; tests SQL comprueban independencia. Mantener timestamps/records_only al revisar el clon. |
| Protección DB de confirmados y bloqueo de bypass directo | IMPLEMENTED BUT NEEDS VERIFICATION | 002 protege INSERT/UPDATE/DELETE de callups/attendance/evaluations/cards, identidades, flags de sessions y evaluated. Tests PGlite; instalación deliberadamente bloqueada. |
| Bloqueo global status=locked OR locked_at IS NOT NULL | IMPLEMENTED BUT NEEDS VERIFICATION | 001a reproduce el predicado y excepción Admin exportados; PostgreSQL 17 comprueba bloqueo Coach y archivo. Falta prueba autenticada Supabase. |
| Finalización atómica de evaluación | IMPLEMENTED BUT NEEDS VERIFICATION | 001a + 002 verifican snapshot, elegibilidad, cuatro cualidades/N/A y límites. Los 3 iniciales de sesiones operativas se insertan solo al confirmar, en la misma transacción. PostgreSQL real verificado; falta Auth/PostgREST Supabase. |
| Definer RPC, propietarios, search_path y privilegios | IMPLEMENTED BUT NEEDS VERIFICATION | Funciones concretas con revocaciones; sin SQL dinámico ni UPDATE arbitrario. Revisar ownership, roles PostgREST, perfiles y CREATE en esquemas reales. |
| Operaciones obsoletas, parciales y cero filas | IMPLEMENTED BUT NEEDS VERIFICATION | Snapshots completos, roster de servidor y respuestas verificadas. final.ui y SQL locales. Concurrencia entre conexiones reales pendiente. |
| Cards/suspensions y permisos existentes | IMPLEMENTED BUT NEEDS VERIFICATION | 003 instala guard de escritura directa y RPC atómico; 004 cierra vistas anónimas. Rollback de tarjeta/sanción e idempotencia comprobados. Falta validación Supabase. |
| Migración segura sobre instalación anterior | IMPLEMENTED BUT NEEDS VERIFICATION | 002 se niega a crear sobrecargas/instalaciones solapadas. Upgrade real y frontend antiguo incompatibles: FINAL_RELEASE_PLAN. |

## 3. Convocatorias

| Requisito | Estado | Código/tests y límites |
|---|---|---|
| Preselección visual solo en nuevas sesiones operativas | COMPLETE AND VERIFIED | SessionsPage marker=1 solo para origen explícito y planned; 001 sin default/backfill. workflowDrafts y batch4.ui. |
| No convocado, prueba e invitado | COMPLETE AND VERIFIED | Persistido prevalece; invitado no evaluable; called/trial evaluable=false no se convierten en true. Resolvers/SQL local. |
| Sin escrituras al abrir o tocar | COMPLETE AND VERIFIED | CallupPage solo modifica borrador; suites Batch 4 y 60 pantallas móviles sin writes al abrir. |
| Guardado explícito y atómico de roster completo | IMPLEMENTED BUT NEEDS VERIFICATION | Confirm envía p_rows + p_expected_rows. SQL exige plantilla actual y participantes históricos y rechaza cambios concurrentes ya persistidos. Falta clon real. |
| Reapertura exacta, inactivos e históricos sin inventar | COMPLETE AND VERIFIED | Incluye referencias de callups/attendance/evaluations; no elimina decisiones ni crea defaults para sesiones sin marker. Unit/browser fixtures. |
| Lecturas fallidas/incompletas, duplicados o jugadores inaccesibles | COMPLETE AND VERIFIED | workflowRows descarta parciales/null; CallupPage bloquea plantilla incompleta. batch4/Phase 4; RLS que oculte filas sin error se detecta también al confirmar contra roster de servidor. |

## 4. Asistencia

| Requisito | Estado | Código/tests y límites |
|---|---|---|
| Presente visual después de convocatoria confirmada | COMPLETE AND VERIFIED | Solo marker=1, llamada explícita y flujo abierto. Sin filas nuevas al abrir, tocar o salir. workflowDrafts/batch4.ui. |
| Guardar incluye Presente no tocados y registros no convocados existentes | COMPLETE AND VERIFIED | AttendancePage selectedRows/savePlayers; snapshot tras guardar. Históricos, notas y estados guardados prevalecen. |
| Confirmar nunca guarda borradores | COMPLETE AND VERIFIED | Comparación contra lectura persistida + RPC que no escribe attendance. Draft distinto, no guardado o lectura fallida bloquean. |
| Ausencias justificadas, retrasos, lesión y notas | COMPLETE AND VERIFIED | Nueve opciones conservadas y estados inválidos bloqueados sin reescribir historial; attendance.ts y pruebas previas/nuevas. |
| Confirmación/reapertura y protección Coach directa | IMPLEMENTED BUT NEEDS VERIFICATION | 002 con snapshot bajo lock; tests SQL/UI. Aplicación contra base real todavía bloqueada. |
| Red, navegación, lecturas truncadas y prevención de duplicados | IMPLEMENTED BUT NEEDS VERIFICATION | Pruebas de errores, save/remount, snapshot y onConflict; constraints reales y concurrencia multicliente pendientes. |

## 5. Evaluación y puntuación

| Requisito | Estado | Código/tests y límites |
|---|---|---|
| Por jugador y cualidad, cuatro cualidades actuales | COMPLETE AND VERIFIED | Susan solicita retirar la quinta. Editor, medias, rankings, resumen y exportaciones usan cuatro. Quinta conservada como dato histórico y en snapshots de concurrencia. |
| Nota inicial 3 donde corresponda | IMPLEMENTED BUT NEEDS VERIFICATION | Usuario confirma el 3 predeterminado. Las cuatro cualidades nuevas muestran 3 sin escrituras al abrir; el RPC guarda los 3 intactos al confirmar. Conserva datos/N/A existentes e históricos. Límites por cualidad: 4–5 altas, 1–2 bajas, 6/3 por defecto y valores específicos de la sesión. |
| N/A y denominador, medias ponderadas/no ponderadas existentes | COMPLETE AND VERIFIED | evaluationScores/Eligibility: media de cualidades válidas, luego igual peso por evaluación; indicador semanal conserva pesos. Sin cambios de fórmulas VEO. |
| Comentarios por jugador y sesión | COMPLETE AND VERIFIED | Borradores por ID, guardado explícito/navegación, ficha con originales; final.ui verifica separación entre jugadores. |
| Puntuaciones simultáneas, stale state y doble clic | COMPLETE AND VERIFIED | editPending, controles deshabilitados y evaluationSnapshot antes/después de guardar comentario. Tests de doble clic/snapshot obsoleto. No sustituye transacción DB. |
| Elegibilidad persistida, ausentes, trial/guest | COMPLETE AND VERIFIED | eligibilityReason y lecturas paginadas; invitados no numéricos; sin asistencia/convocatoria verificable se excluye. |
| Confirmar/reabrir/bloquear globalmente evaluación | IMPLEMENTED BUT NEEDS VERIFICATION | Adaptadores 001a integrados con 002 y frontend; límites actualizados a cuatro y N/A. Verificado PostgreSQL real con concurrencia; falta smoke Supabase. |
| Solo registros | IMPLEMENTED BUT NEEDS VERIFICATION | Admin puede acceder aun sin evaluables; carga todos los originales sin colapsar duplicados, bloquea edición durante lectura y mantiene estado confirmado local. Test específico sin participantes deportivos. Finalización atómica en clon pendiente. |
| Top/Bottom 2 por sesión | INCOMPLETE | Selección existente y duplicados detectados; reemplazo DELETE+INSERT no atómico. No afirmar integridad ante fallo de inserción. |
| Top 3 semanal y Must-Win mensual | IMPLEMENTED BUT NEEDS VERIFICATION | Intelligence muestra tres manteniendo fórmula; lecturas paginadas/meses protegidos de respuestas tardías y writes verificados. RLS real pendiente. |
| Flags privados | IMPLEMENTED BUT NEEDS VERIFICATION | App Admin, staff_flags SQL, auth/UI y exclusión de PDF/CSV. Probar RLS real y autoasignación de roles. |
| Marcos y filtro Total | IMPLEMENTED BUT NEEDS VERIFICATION | Audio: Susan indica injustificada 18/21; filas reales aún pendientes de corregir, conservando nota del 21 y comprobando presencia del 23. Admin abre asistencia desde Resumen. Sin excepciones por UUID/nombre ni reparación remota. |
| Últimas cuatro semanas y temporada completa | IMPLEMENTED BUT NEEDS VERIFICATION | Resumen abre 28 días inclusivos hasta hoy y selecciona sesiones completadas sin prueba/archivo. Temporada julio–junio confirmada, selector de temporadas, fechas personalizadas, ajuste de sesiones y actualización de datos. Falta validación con datos y cuentas del entorno Supabase aislado. |

## 6. Fichas y disciplina

| Requisito | Estado | Código/tests y límites |
|---|---|---|
| Identidad, datos, estados active/injured/trial/guest/inactive | COMPLETE AND VERIFIED | PlayersPage, formulario Admin con write verificado y protección de doble envío; plantilla paginada. |
| Anterior/siguiente con vuelta y consulta de bajas | COMPLETE AND VERIFIED | Navegación sobre plantilla visible; selector Mostrar jugadores de baja. final.ui recorre ambos límites y conserva comentarios. |
| Lesiones y recuperación | IMPLEMENTED BUT NEEDS VERIFICATION | InjuriesPage paginada con errores visibles, guardado/reapertura Admin y compare-and-set de estado. Integración real pendiente; no sincroniza automáticamente estado del jugador. |
| Cumpleaños, trayectoria, foto/avatares | IMPLEMENTED BUT NEEDS VERIFICATION | UI existente conservada; fotos externas y calendario real en dispositivos por verificar. Se eliminan errores silenciosos de lectura de historial. |
| Amarillas/rojas, acumulación y suspensiones | IMPLEMENTED BUT NEEDS VERIFICATION | 003 + SuspensionManager: cumplida, contador actual/histórico, inicialización explícita, atomicidad e idempotencia. PostgreSQL real comprueba completar mientras se guarda otra tarjeta; falta smoke Supabase. |
| Historial y comentarios al cambiar estado | COMPLETE AND VERIFIED | No borrados al dar baja; originales por ID y roster histórico. Apertura/navegación de ficha sin writes en tests. |

## 7. Informes y estadísticas

| Requisito | Estado | Código/tests y límites |
|---|---|---|
| PDF directo equipo/jugador y CSV | COMPLETE AND VERIFIED | ReportsPage usa jsPDF.save; tests descargan %PDF y CSV, sin window.print. CSV conserva acentos/quotes y neutraliza fórmulas. |
| Fechas inclusivas y totales filtrados | COMPLETE AND VERIFIED | Scope completado real, filtros invalidan informe anterior, plantillas paginadas. PDF/CSV y Summary coinciden en fixture persistido. |
| Asistencia, ausencias y retrasos históricos | COMPLETE AND VERIFIED | Fuente compartida attendance.ts; faltante no se vuelve ausencia/presencia. Cutoff deportivo no borra asistencia anterior. |
| Medias, rankings y confirmed-record semantics | COMPLETE AND VERIFIED | Solo evaluated=true elegible; no se añade nuevo requisito histórico de flag de sesión. History Top 3 usa misma elegibilidad que otras páginas; originales quedan visibles. |
| Tarjetas, lesiones, Top/Bottom y resúmenes semanales/mensuales | IMPLEMENTED BUT NEEDS VERIFICATION | Informes existentes; reglas de doble amarilla y datos reales pendientes, sin definición nueva. |
| Comparación con todos los registros reales | BLOCKED | Solo fixtures persistidos aislados; faltan clon, datos anonimizados y autenticación real. No se ha certificado exactitud de los datos de producción. |
| Trayectoria extensa en PDF | COMPLETE AND VERIFIED | AutoTable pagina notas largas; test descarga un informe individual de varias páginas sin imprimir. |
| VEO/comentarios individuales completos en PDF | INCOMPLETE | PDF actual no incorpora sección VEO ni todos los comentarios. No inventar formato/datos privados. |

## 8. VEO y POLAR

| Requisito | Estado | Código/tests y límites |
|---|---|---|
| Integración VEO, importación, duplicados/nulos e histórico | COMPLETE AND VERIFIED | Código src/veo y SQL VEO sin cambios. Tests unitarios/PGlite y ocho regresiones browser con libro local. Producción no revalidada. |
| Contadores de goles/asistencias/portería a cero desde J5 | COMPLETE AND VERIFIED | bonusStartRound y seasonAnalytics; regresiones excluyen J1–J4 de contadores manteniendo sus otras estadísticas. |
| Panel VEO de jugador e informes de equipo VEO | IMPLEMENTED BUT NEEDS VERIFICATION | Panel preservado y módulo separado; falta inclusión acordada en PDF del club y contraste real. |
| POLAR: modelo, API, hardware, permisos y UI | BLOCKED | No hay implementación/modelo en src/supabase. Faltan especificación y datos/acceso autorizado. Sin mediciones inventadas. |

## 9–11. Móvil, fiabilidad y pruebas

| Requisito | Estado | Código/tests y límites |
|---|---|---|
| Rediseño premium, escudo, azul/lima y header simplificado | COMPLETE AND VERIFIED | Commits y estilos preservados; shell/design/Phase 4 regresiones. Manifest/color de navegador alineados con azul. |
| 320/360/390 y móvil mayor en cada página | COMPLETE AND VERIFIED | final.ui: quince modos/páginas a 320/360/390/430, sin overflow de documento ni controles recortados; capturas locales. Dispositivos reales pendientes. |
| Navegación, formularios y targets táctiles | IMPLEMENTED BUT NEEDS VERIFICATION | Shell mide targets y teclado; fichas y modales mejorados. No se certifica cada control ni toda combinación de datos/dispositivo. |
| Carga/vacío/error/éxito, acciones contextuales | IMPLEMENTED BUT NEEDS VERIFICATION | Mejoras en App, workflows, Players, History, Injuries, Intelligence, Reports y login. Quedan rutas legacy no uniformes. |
| Indicadores abierto/confirmado/bloqueado | COMPLETE AND VERIFIED | Callup deja de llamar confirmado al solo-lectura; SessionHeading distingue bloqueo por estado/locked_at y archivo. RPC sigue autoritativo. |
| Accesibilidad, teclado y lectores de pantalla | IMPLEMENTED BUT NEEDS VERIFICATION | Modal nativo con nombre, foco inicial, vuelta Tab/Escape/restauración; etiquetas login/evaluación/lesión; diseño AA local. Falta auditoría manual completa de lector de pantalla. |
| Texto en español | IMPLEMENTED BUT NEEDS VERIFICATION | Login, estados/tarjetas conocidos, tipos de sesión, destacados, marca lateral y navegación VEO traducidos. Solo cambia presentación; claves/cálculos originales y marcas conservados. Revisar mensajes de servidores y valores legacy/importados con datos reales. |
| PWA manifest/iconos/instalación | INCOMPLETE | Manifest español/identidad/scope/color; logo.png es AVIF 283×330. Faltan PNG de instalación, validación Android/iOS y política offline. Escudo no alterado. |
| Paginación y lecturas fallidas | COMPLETE AND VERIFIED | App/Players/History/Reports/Intelligence y catálogo/next-session paginados; null no se confunde con final de páginas. Tests más allá de 20 sesiones/1000 filas. Otras consultas de vistas legacy requieren revisión. |
| Cero filas, dobles envíos y cuenta/estado obsoletos | COMPLETE AND VERIFIED | Guardas de cliente y respuestas verificadas en rutas editadas; auth/final/SQL suites. Concurrencia multicliente/side effects reales todavía bloqueados. |
| Rendimiento | COMPLETE AND VERIFIED | Reports lazy reduce JS inicial de 936,71 a 546,35 kB tras actualizar dependencias de seguridad. Sin nuevos paquetes directos ni cambios de fórmulas VEO. Aviso >500 kB visible; CJS desaparece en Vite 6. |
| Auditoría de dependencias | COMPLETE AND VERIFIED | npm audit inicial: cinco avisos, incluida una crítica. Versiones corregidas y lockfile fijados; npm audit final: cero avisos conocidos, sin audit fix --force. Regresiones/build repetidos. |
| TypeScript y build de producción local | COMPLETE AND VERIFIED | npm run build:check; output ignorado, dist conservado. No existe lint configurado; no se afirma un lint inexistente. |
| Unitarias, UI, roles simulados y SQL aislado | COMPLETE AND VERIFIED | 111 Node/PGlite; 40 Phase 4; 34 shell; 8 diseño; 8 VEO; Batch 4 y final UI registrados al cierre en FINAL_TEST_REPORT. |
| RLS real, locks, rating trigger y concurrencia PostgreSQL | IMPLEMENTED BUT NEEDS VERIFICATION | Docker activado; esquema exportado, current_role real y vistas reproducidos en PostgreSQL 17 local. 21 checks, cuatro concurrencias entre conexiones. auth.users/auth.uid siguen adaptaciones; falta validación Auth/PostgREST en Supabase separado. |

## 12–14. Documentación y publicación

| Requisito | Estado | Evidencia |
|---|---|---|
| Roadmap por requisito y registro de progreso | COMPLETE AND VERIFIED | Este archivo; cada fila identifica implementación, pruebas o dependencia faltante. |
| Informe de pruebas y lista exacta de archivos | COMPLETE AND VERIFIED | FINAL_TEST_REPORT con ejecuciones, límites y archivos; git diff --check con configuración original correcto. |
| Plan SQL/compatibilidad/backup/rollback/aprobaciones | COMPLETE AND VERIFIED | FINAL_RELEASE_PLAN; no propone desplegar solo frontend ni quitar guards como rollback. |
| Checklist Susan en español | COMPLETE AND VERIFIED | SUSAN_REVIEW_CHECKLIST con decisiones y flujos reales de prueba. |
| Publicación, SQL real, reparaciones y permisos | BLOCKED | Fuera de autorización; no realizados. Resolver bloqueos, probar clon y obtener aprobación separada. |

## Registro de progreso

- Fase 0 (5/11): preservación de ambos repositorios, inventario y línea base limpios;
  documentación previa revisada y bloqueos identificados sin consultar producción.
- Fase 1: roster completo/snapshot, flags e identidades protegidas en SQL local;
  cuentas verificadas antes de montar operativa; paginación y rechazos de null.
- Fase 2: puntuaciones serializadas, snapshots obsoletos rechazados, guardado de
  comentario explícito, tarjetas/sanciones con error parcial visible y writes verificados.
- Fase 3: perfiles con vuelta/bajas/comentarios, historial sin respuestas cruzadas,
  recuperación de lesiones, Top 3/meses privados, diálogos/etiquetas y CSV seguros.
- Fase 4: 60 comprobaciones de pantallas móviles, auth/descargas/fallos, regresiones
  de diseño/shell/VEO y build; diagnóstico y corrección del foco modal.
- Fase 5 (6/11): documentación de release, decisiones Susan y cierre de pruebas.
- Fase 6: auditoría npm, actualización explícita de tres dependencias vulnerables y
  lockfile; npm audit sin avisos; regresiones PDF, worker VEO y resto del navegador.

Nada de esto autoriza un commit, push, merge, despliegue, migración de producción,
reparación de históricos ni ampliación de permisos. No se ha realizado ninguno.
