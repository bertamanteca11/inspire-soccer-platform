# Staff privado y acceso a la plataforma

Solicitud de Susan y aclaración de Berta: los perfiles Admin (Susan, Sergi y
Berta) disponen de un apartado de staff privado, con convocatoria, asistencia
y tarjetas, sin evaluaciones. La cuenta Coach que utiliza Juli conserva el
trabajo con jugadores y no puede leer ni modificar staff. No se han recibido
todavía los nuevos requisitos de VEO de Sergi.

Estado: Berta ha instalado el SQL y compartido `all_ok: true` el 7 de noviembre
de 2026. Comprobados los permisos y la instalación; frontend preparado para
publicación junto con los ajustes de evaluación inicial y búsqueda de jugadores.

## Corrección del guardado: UPDATE requires a WHERE clause (7/11/2026)

Si Staff ya está instalado y aparece este error al añadir un miembro, ejecutar
**solo `supabase/staff/FIX_STAFF_SAVE_WHERE.sql` completo en SQL Editor como
`postgres`**. No volver a ejecutar el instalador. El resultado debe mostrar
`staff_save_patch.all_ok: true`. Después pulsar «Actualizar staff» y volver a
añadir el miembro.

La causa es el incremento de `private_staff_control.revision` sin predicado al
final de `private_staff_action`. [pg-safeupdate](https://github.com/eradman/pg-safeupdate)
rechaza un UPDATE sin WHERE, aunque la tabla solo permita una fila. La
transacción del RPC revierte también el alta que lo precede. El filtro
`WHERE singleton = true` selecciona explícitamente esa fila; no se desactiva
la protección ni se modifican permisos.

El parche sustituye exclusivamente esa sentencia en la definición instalada,
conserva el resto del código, propietario, grants y configuración de seguridad,
y puede ejecutarse de nuevo sin cambiar datos. No ejecuta acciones de staff,
no incrementa contadores, no modifica nombres ni registros deportivos. El
instalador para nuevas instalaciones y el diagnóstico incorporan la corrección.

Las pruebas de regresión verifican los predicados de los UPDATE, la actualización
de una definición antigua, idempotencia, conservación de datos y permisos,
guardado de miembros e incremento de revisión, y denegación para Coach. La
base aislada PGlite no carga la extensión pg-safeupdate; la regla de sintaxis
se comprueba explícitamente para evitar que esa diferencia vuelva a ocultar
un UPDATE sin filtro. Docker no está disponible para repetirlo con la extensión
nativa en esta máquina. No es necesario modificar ni desplegar el frontend.

## Configuración de cuentas

La instalación autoriza los identificadores de los perfiles Admin actuales y
una sola cuenta Coach. Si hay un único perfil Coach, se detecta automáticamente;
no hacen falta correos ni contraseñas. Si hay varios, la instalación se detiene
hasta indicar el UUID de la cuenta que utiliza Juli. Los roles actuales se
conservan. No se crean ni eliminan cuentas.

Si se prepara un instalador para un proyecto concreto, se guarda como
`supabase/staff/INSTALL_PRIVATE_STAFF.local.sql`. Esa copia lleva el UUID Coach
comprobado, está excluida de Git y sustituye al instalador genérico en el paso 1.
El instalador genérico y las pruebas no incluyen identificadores reales.

La privacidad del staff se verifica en Supabase: hace falta estar en la lista
autorizada y tener un perfil Admin. Coach no puede cambiar su rol ni editar la
lista de acceso desde la app. Un perfil nuevo no obtiene acceso automáticamente
por declararse Admin.

Los demás usuarios quedan sin acceso a datos, aunque conserven una sesión de
Auth válida. La restricción se aplica a las tablas existentes y a los RPC de
Batch 4 y VEO, además de a la entrada de la aplicación. Una función privilegiada
o vista adicional no revisada detiene la instalación entera.

La RPC heredada `advance_suspensions_for_match(uuid)`, detectada en producción,
no se utiliza desde el frontend actual. La instalación conserva su definición
y sus permisos internos, y retira la ejecución directa de PUBLIC, anon y
authenticated. No la ejecuta ni recalcula sanciones históricas. Las sanciones
de la aplicación se gestionan mediante los RPC revisados de Batch 4.

Las vistas heredadas `session_evaluation_summary`, `player_overview` y
`active_player_injuries` conservan sus consultas y pasan a `security_invoker=true`
para aplicar los permisos y RLS de quien consulta. Se retira su acceso anónimo
y se concede a authenticated únicamente SELECT.

## Orden de publicación

1. Abrir `supabase/staff/INSTALL_PRIVATE_STAFF.sql` y ejecutarlo completo en
   SQL Editor del proyecto que utiliza la app. Con una sola cuenta Coach no
   hay que cambiar ningún valor. Si hay varias, consultar primero
   `diagnostics/staff_access_accounts_read_only.sql` e indicar el UUID correcto
   en `staff_access_setup`. No compartir contraseñas. El archivo es una sola
   transacción: un error no deja una instalación parcial. No volver a ejecutar
   `batch4/REVIEW_INSTALL.sql`; ya está instalado.
2. Ejecutar `diagnostics/private_staff_post_install_check.sql` y comprobar
   `all_ok: true`. Ante un error, compartir el mensaje exacto; no eliminar
   funciones, vistas o políticas para saltarse la comprobación.
3. Publicar el frontend por `main` después de validar la instalación. La
   versión nueva necesita `app_access()`; publicarla antes impediría el acceso.
   La versión anterior sigue funcionando para las cuentas autorizadas tras instalar
   el SQL, durante este intervalo.
4. Con las cuentas reales, comprobar: los Admin ven Staff en Más; Coach
   conserva las pantallas de jugadores y evaluaciones pero no ve Staff; una
   cuenta no aprobada no entra. Crear primero solo registros de staff que
   correspondan a la realidad.

No se conecta Codex a Supabase. El SQL se instala manualmente por Berta.

Si varios entrenadores conocen la contraseña de una misma cuenta Coach, la
aplicación no puede distinguir quién la utiliza. Para que solo entre Juli,
cambiar esa contraseña en Supabase y revocar las otras sesiones compartidas.
No se presume que esta acción ya se haya realizado. Las cuentas individuales
permitirían distinguir quién realizó cada cambio en el futuro.

## Uso del staff

- En Más → Staff, seleccionar una sesión y añadir los miembros del equipo
  técnico en Miembros. Añadir un miembro no le crea una cuenta ni le da acceso.
- Elegir explícitamente la convocatoria y confirmarla. En partidos aparece un
  aviso si un convocado tiene sanción activa y se exige revisar el aviso.
- En Asistencia, los convocados sin registro guardado comienzan en Presente
  mientras la asistencia está abierta. Revisar las excepciones; retrasos y
  ausencias requieren motivo. Los borradores solo se guardan al guardar o
  confirmar; los estados existentes se conservan al reabrir.
- Los cierres del staff son independientes de los de jugadores. Para cambiar
  una asistencia, reabrirla; para cambiar una convocatoria con asistencia
  cerrada, reabrir primero la asistencia. Los registros se conservan.
- En Tarjetas, guardar cada tarjeta con su motivo. Cinco amarillas simples
  desde el último ciclo generan una sanción de un partido; doble amarilla y
  roja directa tienen su propia sanción. Se pueden registrar varias tarjetas
  legítimas en una sesión.
- Marcar cumplida requiere confirmación. Una sanción por acumulación reinicia
  el ciclo; el total histórico de tarjetas y las sanciones cumplidas se
  conservan. Cumplir una roja no reinicia las amarillas.
- Las sesiones archivadas permiten consulta y no admiten cambios. Ningún dato
  del staff participa en rankings, medias, informes o evaluaciones de jugadores.
- Susan registra la convocatoria y la asistencia de jugadores y Juli realiza
  las evaluaciones, según el procedimiento descrito. No se ha añadido una
  restricción nueva que deje a Juli únicamente la pantalla de evaluación.

## Validación

Las pruebas usan identidades y datos sintéticos sobre el esquema exportado,
con Batch 4 y VEO instalados en una base aislada. Incluyen exclusión de cuentas
no autorizadas, privacidad frente a Coach, revocación con
JWT existente, permisos RLS/RPC, revisiones concurrentes, cierres, estados
pendientes, ciclos disciplinarios e histórico. Las pruebas del navegador usan
los componentes reales con respuestas aisladas; no escriben en Supabase.

Validación del 6 de noviembre de 2026: compilación correcta, 154 pruebas de
regresión, 93 pruebas de navegador y 15 comprobaciones con PostgreSQL 17 local,
incluida concurrencia real entre dos conexiones. Todos los resultados correctos.

Actualización del 7 de noviembre: 158 pruebas de regresión correctas, 97 casos
de interfaz verificados y dos comprobaciones adicionales de evaluación sin
marcador. La repetición opcional con PostgreSQL nativo no pudo arrancar porque
Docker no estaba iniciado; las pruebas de base de datos de esta revisión se
ejecutaron con PGlite y el SQL instalado tiene el `all_ok: true` compartido por Berta.

En evaluaciones abiertas sin marcador, las cuatro notas iniciales son 3. Al
confirmar, el cliente inserta únicamente los registros que faltan y verifica de
nuevo la lectura antes de llamar al RPC existente. Los registros guardados y N/A
prevalecen. No requiere otra migración ni altera los límites de notas altas/bajas.

Cambios futuros de integrantes de la lista de acceso se realizan en SQL Editor,
con identificadores comprobados. La app no ofrece un editor de permisos y Coach
no puede concederse acceso privado ni elevar su rol.
