# Comprobación para publicar

Fecha: 6 de noviembre de 2026. El usuario pide publicar si está listo.
Resultado: publicación bloqueada por incompatibilidad de la base configurada.
No se ha ejecutado ninguna migración remota ni publicado la interfaz nueva en
producción. El usuario autoriza ahora guardar y subir los cambios de código en
la rama `feature/premium-ui-redesign`. Esa entrega no actualiza `main` ni Supabase;
el bloqueo de compatibilidad para producción permanece vigente.

## Evidencia actual

Se han realizado dos GET a la API del proyecto indicado en el `.env` local,
usando exclusivamente su configuración pública, sin extraer filas ni credenciales:

| Comprobación | Resultado |
|---|---|
| Selección de `sessions.draft_defaults_version`, `limit=0` | HTTP 400, `42703`: la columna no existe |
| GET del RPC `batch4_workflow_access` con UUID ficticio | HTTP 404, `PGRST202`: función no encontrada en la API consultada |

La consulta de RPC fue anónima y no establece qué funciones ve un usuario
autenticado. La ausencia de la columna sí demuestra que el esquema aún no es
compatible con el frontend preparado: crear sesiones nuevas con el marcador falla.
Por tanto, las pruebas locales correctas no permiten publicar este frontend solo.

El remoto de GitHub sigue en `main`, commit
`8af9ded197e0421403043e4e697a9cde57a8f843`. La configuración del repositorio menciona
Vercel. El usuario ha confirmado el proyecto `bertamanteca11s-projects/inspire-soccer-platform`,
dominio `https://inspire-soccer-platform.vercel.app/`, rama `main` y despliegue del
2 de noviembre con ese commit. El dominio devuelve HTTP 200; su bundle usa la misma
URL y clave pública de Supabase que el proyecto local. Las claves no se han impreso.

Se han encontrado los plugins oficiales disponibles de Supabase, GitHub y Vercel,
todavía sin instalar/conectar, y se ha mostrado la sugerencia de conexión al usuario.
Falta confirmar sus conexiones para acceder a administración de Supabase y Vercel.
La entrega Git puede intentarse con el gestor de credenciales local ya configurado;
no requiere instalar un plugin si ese acceso funciona.
La clave pública de la aplicación no permite instalar migraciones.

## Paquete preparado

SQL candidato: `supabase/batch4/REVIEW_INSTALL.sql`, una transacción con las cinco
fuentes ya probadas localmente. No ejecutar migraciones históricas ni reinstalar VEO.
Una instalación parcial previa de Batch 4 requiere revisar un upgrade específico.

El frontend de publicación se ha construido en una carpeta limpia bajo
`.phase4-test-artifacts/production-candidate-2026-11-06/frontend`. La copia privada
del paquete y sus hashes están en esa misma carpeta de artefactos. Compilación
correcta y `npm audit` actual sin vulnerabilidades conocidas. No contiene
archivos `.env`, hojas de cálculo, usuarios ni filas de producción. La configuración
pública de Supabase queda incluida en el JavaScript, como corresponde a Vite.

## Pasos que faltan

1. Completar las conexiones administrativas sugeridas. Dominio, repositorio y
   rama `main` ya están identificados; verificar también la configuración del
   proyecto y sus variables desde Vercel antes de la publicación.
2. Obtener una copia recuperable del esquema y datos y probar su restauración en
   un entorno aislado. El diagnóstico recibido no es una copia de seguridad.
3. Validar allí el paquete con Auth/PostgREST y cuentas Admin/Coach/consulta;
   comprobar confirmaciones, reaperturas, sanciones y permisos reales. Los 21
   tests nativos PostgreSQL previos usaban ayudas de autenticación sintéticas.
4. Instalar el backend revisado en la ventana sin escrituras y publicar la interfaz
   compatible mediante el destino confirmado. Las sesiones de clientes antiguos
   deben recargarse porque sus escrituras directas son incompatibles con los guards.
5. Verificar el sitio HTTPS publicado, inicio de sesión y operaciones reales de
   los roles antes de darlo por disponible a Susan y Sergi.

La corrección de las asistencias históricas de Marcos y la lista adicional de
requisitos VEO de Sergi conservan su seguimiento separado. No se cambian esos
registros ni se inventan funcionalidades durante este despliegue.
