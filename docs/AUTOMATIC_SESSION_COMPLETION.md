# Finalización automática de sesiones

Al confirmar correctamente convocatoria, asistencia y evaluación mediante
`batch4_workflow_action`, una sesión `planned` sin bloqueo global pasa a
`completed`. Se realiza dentro de la misma transacción y antes de devolver
la sesión actualizada. Funciona con Admin y Coach, incluida la cuenta Coach
que accede por su rol sin figurar en la lista antigua de cuentas aprobadas.

No basta con guardar registros: deben estar confirmadas las tres partes. Un
rechazo de validación revierte toda la operación y no completa la sesión.
El cierre sigue bloqueando los registros de cada apartado. Solo Admin puede
reabrirlos; hacerlo conserva `completed` porque no revierte que la actividad
se haya realizado. Los indicadores de cada apartado siguen mostrando su cierre.
Las sesiones archivadas, canceladas o bloqueadas globalmente no se convierten
en completadas mediante esta automatización.

La lista de Sesiones y los informes usan el estado persistido en Supabase.
El frontend ya recarga la sesión después de confirmar; no debe hacer una
segunda escritura directa a `sessions`, que además fallaría para Coach.

## Instalación en un proyecto existente

Ejecutar completo `supabase/batch4/ENABLE_AUTOMATIC_SESSION_COMPLETION.sql`
como `postgres` y comprobar `automatic_session_completion_check.all_ok=true`.
No repetir el instalador completo. El parche es idempotente y conserva dueño,
permisos, SECURITY DEFINER, search_path, volatilidad y lenguaje del RPC.
No cambia datos durante la instalación ni toca la función de puntuación,
la fórmula calculada de `total_score`, las políticas RLS o los triggers.

Se aplica a las próximas confirmaciones. Las sesiones cerradas antes de la
instalación mantienen su estado existente; no se reabren ni se confirman de
nuevo para cambiar su etiqueta. Un Admin puede marcar una de esas sesiones
como Completada desde Sesiones → Editar si corresponde a una actividad realizada.

Los instaladores de proyectos nuevos incorporan la misma automatización.
Las pruebas usan identidades y datos sintéticos en PostgreSQL aislado, con
`total_score` generado: dos Admin y dos Coach, cierre y reapertura, devolución
del estado, validaciones fallidas, última confirmación de cualquiera de las
tres partes, bloqueos globales, instalación repetida y conservación de registros.
La prueba de navegador comprueba que Sesiones muestra Completada al regresar
de Evaluación y que el cliente no escribe el estado directamente.

Validación del 17/11/2026: 203 pruebas de regresión, cinco pruebas de navegador
y compilación de producción correctas. La instalación en Supabase se verifica
por separado mediante el resultado del parche; publicar el repositorio no
ejecuta SQL en el proyecto de producción.
