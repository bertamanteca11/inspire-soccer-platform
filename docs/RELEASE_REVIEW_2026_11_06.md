# Cambios de Susan y preparación de publicación

Estado: implementación local preparada; producción pendiente de validación con
autenticación real, copia recuperable y aprobación de publicación. No se ha
ejecutado SQL remoto ni desplegado la aplicación. Este documento actualiza las
decisiones anteriores sobre cinco cualidades y adaptadores inexistentes.

## Comportamiento preparado

- Convocatoria explica en español cuándo falta actualizar la base. Sigue
  desactivando cambios si no puede verificar permisos. El error de la captura
  requiere instalar el backend compatible, además del nuevo mensaje.
- Asistencia y evaluación comparten orden numérico por dorsal, desempate por
  nombre y jugadores sin dorsal al final. No hay que modificar apodos.
- Solo se editan cuatro cualidades en entrenos y partidos. Medias, rankings,
  resumen, PDF y CSV usan las cuatro primeras, excluyendo N/A del denominador.
  La quinta permanece almacenada y consultable en los originales históricos.
  No hay UPDATE masivo de puntuaciones ni totales antiguos.
- Usuario confirma 3 inicial en las cuatro cualidades de nuevas evaluaciones
  operativas. Se muestra como borrador sin guardar al abrir. Al confirmar, el RPC
  guarda los 3 intactos en la misma transacción. No modifica notas/N/A existentes
  ni huecos históricos. Altas 4–5 y bajas 1–2, con cupos independientes por cualidad:
  6 altas y 3 bajas por defecto; respeta, por ejemplo, un máximo configurado de 5.
  Al llegar al cupo se desactivan nuevas elecciones de esa banda y el backend
  también las rechaza. Cambiar 4 por 5 en un mismo jugador sigue ocupando una plaza.
- Convocatoria incluye gestión de sanciones para Admin: «Marcar como cumplida»
  actualiza partidos cumplidos y fecha, conservando la sanción. Repetir el mismo
  clic no vuelve a reiniciar el contador.
- La gestión de sanciones aparece antes de la lista de jugadores, con acceso
  desde el aviso general. Al completar una sanción muestra confirmación y recarga
  los avisos. En liga/amistosos, cada jugador sancionado tiene un aviso individual;
  si está convocado, aparece también un aviso destacado con su nombre. Se consultan
  de nuevo las sanciones antes de confirmar y el diálogo advierte de los convocados
  afectados. Es un aviso para revisar su aplicación a ese partido, sin cambiar
  automáticamente la selección ni ampliar permisos de Coach.
- A petición del usuario, Inicio/Top global, Resumen, ficha de jugador, evaluación,
  informes y seguimiento dejan de mostrar contadores informativos de evaluaciones
  excluidas. Se conservan los filtros, las fórmulas, los errores que impiden verificar
  resultados y los registros originales; quitar el aviso no incorpora puntuaciones.
- Al cumplir una sanción de acumulación, las amarillas simples existentes pasan
  a la cuenta anterior; la cuenta actual empieza en cero desde ese momento.
  Las amarillas posteriores empiezan una nueva cuenta. El histórico nunca se borra.
  Una roja directa cumplida no reinicia amarillas. La doble amarilla conserva su
  sanción propia y vale dos en el total histórico; la acumulación de cinco sigue
  usando amarillas simples, como la función original.
- Para sanciones antiguas de acumulación ya cumplidas sin contador conocido,
  Admin revisa el historial y puede pulsar «Iniciar cuenta nueva desde hoy».
  No se infiere un reinicio histórico ni se crea otra sanción por las mismas
  tarjetas sin esa revisión. La acción es explícita e idempotente.
- Tarjeta, sanción asociada y acumulación se guardan en una sola transacción.
  Snapshots obsoletos y tarjetas históricas múltiples requieren revisión. Un fallo
  al crear la sanción revierte también la tarjeta.
- Destacados se reemplazan atómicamente con snapshot y permiso Admin. Un fallo
  al insertar conserva los anteriores; las políticas antiguas de Coach no
  proporcionan escritura directa por fuera del RPC.
- Resumen tiene «Revisión de Susan: 18, 21 y 23 de octubre», según confirmación
  del usuario: partido 18/10/2026 y entrenos 21/10/2026 y 23/10/2026. Exige una
  sesión completada inequívoca por fecha/tipo; si falta o hay varias, avisa.
  También permite seleccionar último partido y entrenos hasta una fecha. Las
  tres fechas no limitan las revisiones futuras.
- El audio posterior de Susan cambia la selección inicial: Resumen abre los
  últimos 28 días, incluido hoy, e incluye automáticamente las sesiones completadas
  del periodo que no estén marcadas de prueba. No incluye planificadas ni archivadas.
  Asistencia, tarjetas y medias comparten exactamente esas sesiones. Las medias
  conservan los filtros previos de elegibilidad y Solo registros.
- «Toda la temporada» usa julio–junio, confirmado por el usuario, y permite
  seleccionar temporadas anteriores. Las fechas, la lista de sesiones, el periodo
  personalizado y el historial completo hacen visible el alcance de cada total.
  «Actualizar datos del resumen» vuelve a leer los registros manteniendo el filtro;
  al volver a abrir la pantalla se recuperan las últimas cuatro semanas actuales.
- Admin puede abrir la asistencia de una sesión desde la tabla del Resumen.
  «Ausencia injustificada» reemplaza la etiqueta ambigua «Ausencia»; las notas
  existentes permanecen al cambiar el estado. Se conservan los permisos y las
  reglas de reapertura, guardado y confirmación.

## Marcos Zamora

El usuario aportó después las filas actuales. Las cuatro injustificadas pertenecen
al 4/7/11/14 de octubre, fuera de la revisión. Las sesiones 18/21/23 están
completadas y confirmadas, pero Marcos no tiene fila de asistencia el 18, tiene
ausencia justificada con nota el 21 y figura presente el 23. No hay convocatorias
guardadas para él en esas tres sesiones. Su dorsal actual es 18, leído de players.

El total verificable de esa selección con los datos exportados es cero
injustificadas, una justificada, una presencia y una sesión sin registro.
El nuevo audio confirma la intención de Susan de registrar injustificada el 18
y el 21; ella revisará por qué falta asistencia el 18 y comprobará el 23.
Es una corrección de datos pendiente de aplicación, no un cambio en la fórmula.
Se ha preparado el circuito de revisión y la guía `SUSAN_AUDIO_REVIEW_2026_11_06.md`.
No se han modificado filas remotas ni añadido excepciones por jugador a los totales.

Sergi revisará el módulo VEO y enviará requisitos concretos. `VEO_SERGI_REVIEW.md`
recoge un recorrido de revisión y el formato para esas necesidades; no se han
cambiado fórmulas, primas ni integraciones basándose en una lista aún no recibida.

## SQL preparado para revisión

`supabase/batch4/REVIEW_INSTALL.sql` agrupa en una transacción:

1. `001_draft_defaults_version.sql`: marcador nullable, sin backfill.
2. `001a_live_adapters.sql`: bloqueo global basado en el trigger real, finalización
   de evaluaciones, medias de cuatro cualidades y límites altos/bajos con N/A.
3. `002_workflow_security.sql`: permisos, confirmaciones y guards; al reabrir
   evaluación despublica evaluated sin borrar puntuaciones ni comentarios.
4. `003_discipline_and_standouts.sql`: RPC atómicos y contadores; cierra escrituras
   directas. Deshabilita la antigua función SECURITY DEFINER de acumulación que
   admitía invocaciones anónimas.
5. `004_view_security.sql`: las tres vistas deportivas respetan RLS del invocador;
   anon pierde acceso y authenticated conserva solo SELECT sobre las vistas.

Se genera con `npm run release:sql`; generar el archivo no ejecuta SQL.
Un fallo revierte el paquete completo. Instalaciones Batch 4 anteriores necesitan
un upgrade específico; el paquete rechaza solapar firmas. current_role ya se ha
recibido: SECURITY DEFINER, search_path vacío, consulta el perfil de auth.uid();
se conserva su definición real.

## Validación y publicación

Consultar `RELEASE_VALIDATION_2026_11_06.md` para resultados. Se usa el esquema
exportado sin datos de producción. auth.users/auth.uid son adaptaciones locales:
pasar PostgreSQL real no certifica Auth ni la caché PostgREST de Supabase.
Antes de producción, probar el paquete en Supabase separado con cuentas reales
de prueba Admin/Coach/consulta/anónimo, frontend compatible y backup restaurable.

La instalación cambia permisos y reemplaza un trigger. Mantener una ventana sin
escrituras: instalar el paquete aprobado y publicar la interfaz compatible,
cerrar/recargar pestañas antiguas y comprobar el circuito completo antes de
reabrir escritura. No ejecutar el SQL histórico completo ni quitar guards para
hacer funcionar un frontend antiguo.

## Demo visual sin conexión real

Ejecutar `npm run demo` desde esta carpeta. Se abre Edge con componentes actuales
y datos ficticios. «Vista» y «Rol simulado» permiten revisar pantallas. Los
guardados se simulan y se pierden al cerrar. El servidor fuerza un dominio y una
clave ficticios; el navegador intercepta o bloquea todas las peticiones externas.
No requiere un proyecto Supabase para la revisión visual. No certifica permisos.
`npm run demo:check` verifica el aislamiento y las cuatro cualidades.

El selector visual ofrece una sola entrada VEO Analytics; la importación se abre
desde el propio módulo. La duplicación anterior pertenecía solo a la demo. Su
evaluación actual empieza sin notas guardadas para mostrar el 3 predeterminado.

Se termina cerrando la ventana o con Ctrl+C. Su URL solo funciona dentro del
navegador controlado que abre el comando; no copiarla a otro navegador.
