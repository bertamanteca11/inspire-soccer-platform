# Error al confirmar evaluaciones: columna calculada (17/11/2026)

Berta informa de un error al confirmar como Coach el partido de liga del 15/11,
y de evaluaciones pendientes en las cuatro sesiones anteriores. La pantalla
mostraba el mensaje genérico de `workflowError`, que también ocultaba errores
de validación ajenos a los permisos. La respuesta original del RPC confirmó
SQLSTATE `428C9`: `column "total_score" can only be updated to DEFAULT`, con
`Column "total_score" is a generated column.`

La causa está en `batch4_finalize_evaluation`: escribía explícitamente el total
al publicar cada evaluación. En producción `total_score` es una columna calculada
y PostgreSQL rechaza esa escritura para Admin y Coach. La transacción revierte
la confirmación, incluidas las inserciones iniciales que se hubieran preparado.

La consulta `diagnostics/evaluation_confirmation_read_only.sql`, ejecutada por
Berta, muestra convocatoria y asistencia confirmadas, evaluación abierta, sin
bloqueo global, notas dentro de los cupos y sin duplicados de evaluación, marcas
N/A inválidas, notas de participantes no elegibles ni ciclos disciplinarios
heredados pendientes. Las cuatro definiciones de función exportadas coinciden
con las fuentes revisadas. No se han modificado registros deportivos.

La base de pruebas anterior representaba el total como una columna ordinaria:
faltaban `is_generated` y `generation_expression` en el inventario exportado.
Las consultas de diagnóstico incorporan ahora ambos metadatos. Las pruebas
incluyen una variante con columna calculada y reproducen el error `428C9` con
la función antigua; comprueban que el intento fallido conserva notas y cierres.

## Corrección

Ejecutar únicamente `supabase/batch4/FIX_EVALUATION_GENERATED_TOTAL.sql` completo
como `postgres`. El parche reemplaza la escritura final: si la columna es
calculada, actualiza solo los indicadores y metadatos de confirmación; si es
ordinaria, mantiene la escritura del total validado de cuatro cualidades.
No cambia la columna, su expresión, valores originales, permisos, RLS o triggers,
y no ejecuta ninguna confirmación. Puede repetirse sin cambiar datos. Los
instaladores de proyectos nuevos incorporan la misma compatibilidad.

Las medias de la app se calculan desde las cuatro cualidades y sus N/A mediante
`evaluationTotal`; no dependen de cambiar la fórmula histórica de la columna.
Las pruebas verifican también este comportamiento cuando el total almacenado
incluye una calidad retirada y difiere de la media actual.

Se prueba el cierre con ambos tipos de columna, Admin y Coach, 13 notas guardadas
más 3 iniciales, 17 notas sin marcador de borrador y 16 iniciales. Se verifican
idempotencia del parche, conservación de columnas, datos y metadatos de seguridad,
bloqueo después de confirmar y denegación de reapertura para Coach.

Validación completada: 195 pruebas de regresión correctas. La compilación y las
tres pruebas de navegador del diagnóstico y confirmación con ambos roles también
son correctas. La corrección de la función no requiere otro cambio de frontend.

La pantalla traduce ahora los rechazos de validación conocidos y permite
**Copiar diagnóstico del error** cuando el RPC de confirmación falla. Se copian
únicamente sesión, etapa, acción, código y mensaje; se excluyen puntuaciones,
comentarios, payload de escritura, credenciales, detalles de filas y cabeceras.
La información técnica permanece en una sección desplegable. Si falla el
portapapeles, se puede copiar desde **Ver diagnóstico**.

Después de instalar el parche, volver a pulsar Confirmar evaluación en la sesión
real. No repetir el instalador, cambiar permisos ni modificar notas para eludir
el error. La aplicación del parche y la confirmación real se comprueban por
separado; el resultado de instalación no confirma sesiones automáticamente.
