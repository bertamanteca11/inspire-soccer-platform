# Cumplir sanciones desde el panel de tarjetas

Admin puede pulsar **Sanción** en Inicio → Tarjetas y sanciones. Se abre una
ventana filtrada por el jugador con sus sanciones activas, partidos pendientes,
acumulación actual e histórico de tarjetas. **Marcar como cumplida** pide
confirmación y reutiliza `batch4_complete_suspension`; no elimina tarjetas.
Si hay varias sanciones, cada una se completa por separado.

La ventana reutiliza `SuspensionManager`, que sigue disponible en Convocatoria.
Después de guardar vuelve a leer sanciones y contadores, y actualiza también
los avisos de Inicio. Las tarjetas históricas conservan su total. No se escribe
al abrir la ventana ni al cancelar. Un error no muestra un guardado correcto.
Coach y Consulta conservan la visualización sin la acción de completar; el RPC
existente mantiene la comprobación de Admin en la base de datos.

No requiere cambios de esquema ni ejecutar SQL. Las pruebas usan datos
sintéticos y bloquean las conexiones externas: móvil y escritorio, cancelación,
doble pulsación, error de guardado/lectura, filtro por jugador, varias sanciones,
contadores, permisos y conservación de los demás registros. Se comprueba
también el flujo anterior de Convocatoria y el RPC en PostgreSQL aislado.
