# Cambios pedidos en el audio de Susan

Revisión local del 6 de noviembre de 2026. No se ha modificado producción.

## Resumen reciente y temporada

Al abrir Resumen se muestran las últimas cuatro semanas: hoy y los 27 días
anteriores, usando el calendario de Europe/Copenhagen. El intervalo es inclusivo.
En marzo no entran las evaluaciones de octubre por estar en la misma temporada.
Solo cuentan sesiones completadas de actividad deportiva sin marca de prueba.
Las fechas, la selección y el número de sesiones son visibles. La ausencia de
un registro de asistencia nunca se convierte en ausencia ni en presencia.

«Toda la temporada» usa del 1 de julio al 30 de junio, confirmado por Berta.
El selector permite temporadas anteriores. «Periodo personalizado» permite
cambiar fechas o desmarcar sesiones; cambiar fechas selecciona las sesiones
completadas del nuevo intervalo. El historial completo sigue separado para
consultar archivadas, pruebas y originales, sin incorporarlos al total operativo.

«Actualizar datos del resumen» vuelve a leer los datos y conserva el filtro.
Salir y abrir de nuevo Resumen recupera las últimas cuatro semanas actuales.
No se guardan filtros ni se modifican registros al cambiar estas opciones.

## Marcos: intención confirmada y datos pendientes de corregir

| Fecha de 2026 | Exportación recibida | Intención expresada por Susan |
|---|---|---|
| 18 de octubre | Sin asistencia ni convocatoria para Marcos | Ausencia injustificada; Susan revisará por qué falta asistencia del equipo |
| 21 de octubre | Ausencia justificada con nota | Cambiar a injustificada conservando la nota |
| 23 de octubre | Presente | Susan cree que estuvo; comprobar antes de modificar |

Las cuatro injustificadas del 4, 7, 11 y 14 de octubre son registros anteriores;
no se borran para ajustar el resultado de otra revisión. Las últimas cuatro
semanas y la revisión concreta del 18/21/23 tienen distintos intervalos.

Circuito preparado para Admin, primero en pruebas y después en el entorno
autorizado para corregir datos reales:

1. En Resumen, pulsar «Revisión de Susan: 18, 21 y 23 de octubre» y elegir Marcos.
   Comprobar las tres sesiones exactas y los registros actuales.
2. Abrir «Revisar asistencia» en la sesión correspondiente. El acceso selecciona
   la sesión y abre el editor; no reabre ni modifica datos por sí solo.
3. Si está cerrada, pulsar «Reabrir asistencia». En el 21, cambiar de justificada
   a «Ausencia injustificada», conservando la explicación existente. En el 18,
   revisar la plantilla y las asistencias que faltan; registrar solo estados
   verificados, sin marcar al resto del equipo como presente o ausente por defecto.
4. Guardar, verificar la lectura de lo guardado y volver a confirmar asistencia.
   No hace falta reabrir ni recalcular las evaluaciones para cambiar la etiqueta.
5. Volver a la revisión de esas tres sesiones y actualizar. Si se han guardado
   exactamente las dos injustificadas y la presencia del 23, el resultado será
   dos injustificadas y una presencia, sin sesiones sin registro para Marcos.

La interfaz conserva las restricciones existentes. Si falta el backend compatible,
se debe instalar y validar el paquete de publicación en el entorno aislado según
`FINAL_RELEASE_PLAN.md`; no se eluden permisos ni se ejecuta SQL de reparación.
El archivo `diagnostics/susan_review_attendance_read_only.sql` permite contrastar
los registros guardados sin cambiarlos.

## VEO

Sergi revisará el módulo y aportará requisitos exactos. El audio no especifica
nuevas métricas, fórmulas o integraciones. El recorrido y las preguntas para
su lista están en `VEO_SERGI_REVIEW.md`. No se ha enviado ningún mensaje a Sergi.
