# Publicación con Supabase manual

El usuario prefiere ejecutar él mismo los pasos de Supabase y no conectar Codex.
Ese flujo está autorizado. GitHub y Vercel funcionan mediante Git; no hace falta
instalar ni conectar plugins para esta publicación.

Código subido: rama `feature/premium-ui-redesign`, commit de aplicación `e56e0f7`.
Destino: `https://inspire-soccer-platform.vercel.app/`, rama de producción `main`.
El commit actual de producción sigue siendo `8af9ded` hasta completar el backend.

## Orden de trabajo

1. Disponer de una copia recuperable de Supabase antes de aplicar cambios. Los
   SELECT de diagnóstico no son una copia de datos. En planes con backups, revisar
   Database → Backups; en Free se necesita una exportación de esquema y datos.
   Una copia se considera verificada al comprobar su restauración en un entorno
   separado. No pulsar Restore sobre la base activa como prueba.
2. Coordinar una pausa de escritura: Susan y el resto cierran la app hasta terminar
   la publicación. El backend nuevo no admite los guardados del frontend antiguo.
3. Abrir `supabase/batch4/CHECK_INSTALL_ROLLBACK.sql`, copiar su contenido completo
   y ejecutarlo en SQL Editor del mismo proyecto. Esta comprobación crea los objetos
   temporalmente y revierte la transacción. Debe devolver
   `COMPATIBILITY_OK_ROLLED_BACK`. No sustituye la copia de seguridad ni prueba login.
   Si da error, enviar el error y no continuar. No seleccionar solo una parte del SQL.
4. Con copia verificada y comprobación correcta, ejecutar una sola vez el contenido
   completo de `supabase/batch4/REVIEW_INSTALL.sql` en SQL Editor. Es la instalación
   de las cinco fuentes en una transacción; no ejecutar además cada fuente ni
   migraciones antiguas de VEO. Si falla, no reintentar por partes: compartir el error.
5. Ejecutar `diagnostics/release_post_install_check.sql`. Debe devolver `all_ok: true`.
   Solo lee metadatos y solicita recargar la caché API; no modifica asistencias,
   evaluaciones, tarjetas ni sanciones.
6. Compartir la confirmación del backup, el resultado de instalación y el JSON
   de comprobación. Desde este equipo se contrasta la API y se completa el paso Git
   a `main` con la autorización de publicación ya recibida. Sin force push.
7. Confirmar despliegue Ready en Vercel y abrir la URL HTTPS. Probar inicio de sesión
   y flujos con Admin/Coach antes de volver al uso normal: convocatoria, asistencia,
   cuatro cualidades, límites, sanción cumplida y lectura de VEO. La comprobación de
   catálogos no certifica Auth/PostgREST ni reemplaza esos recorridos autenticados.

Si existe alguna instalación previa de Batch 4, el ensayo o el instalador la
rechazan. Es necesario revisar un upgrade específico; no borrar columnas, funciones
ni filas para forzar la instalación. La prueba con rollback conserva también el
trigger y los permisos antiguos al terminar.

La publicación no aplica la corrección histórica de Marcos ni añade requisitos
VEO que Sergi aún no haya concretado. Esos cambios siguen separados.

Fuentes: https://supabase.com/docs/guides/platform/backups
