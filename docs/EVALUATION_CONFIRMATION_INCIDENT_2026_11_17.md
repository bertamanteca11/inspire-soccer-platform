# Confirmación de evaluaciones: investigación del 17/11/2026

Berta informa de un error al confirmar como Coach el partido de liga del 15/11,
y de evaluaciones pendientes en las cuatro sesiones anteriores. La pantalla
mostraba el mensaje genérico de `workflowError`, que también ocultaba errores
de validación ajenos a los permisos. El rechazo original del RPC todavía no se
ha recibido: no se da por resuelto el fallo de confirmación.

La consulta `diagnostics/evaluation_confirmation_read_only.sql`, ejecutada por
Berta, muestra convocatoria y asistencia confirmadas, evaluación abierta, sin
bloqueo global, notas dentro de los cupos y sin duplicados de evaluación, marcas
N/A inválidas, notas de participantes no elegibles ni ciclos disciplinarios
heredados pendientes. Las cuatro definiciones de función exportadas coinciden
con las fuentes revisadas. No se han modificado registros deportivos.

Una reproducción aislada con el esquema exportado y las funciones instaladas
confirma correctamente tres casos: 13 evaluaciones guardadas más 3 iniciales,
17 evaluaciones guardadas sin marcador de borrador y 16 iniciales sin guardar.
Estos resultados no sustituyen la respuesta de la petición que falla en el
dispositivo real.

La pantalla traduce ahora los rechazos de validación conocidos y permite
**Copiar diagnóstico del error** cuando el RPC de confirmación falla. Se copian
únicamente sesión, etapa, acción, código y mensaje; se excluyen puntuaciones,
comentarios, payload de escritura, credenciales, detalles de filas y cabeceras.
La información técnica permanece en una sección desplegable. Si falla el
portapapeles, se puede copiar desde **Ver diagnóstico**.

Siguiente paso: recoger el JSON del botón o la respuesta de
`batch4_workflow_action` en Network y reproducir el rechazo específico. No
reinstalar Batch 4, reabrir sesiones ni modificar notas para intentar eludirlo.
