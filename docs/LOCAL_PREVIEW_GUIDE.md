# Revisar los cambios antes de producción

La copia que contiene los cambios es `inspire-soccer-platform`. No usar
`inspire-soccer-main-release` para esta revisión.

## Demo visual inmediata

En la terminal, desde esta carpeta, ejecutar `npm run demo`. Abre Edge con las
pantallas actuales y datos ficticios. La selección «Vista» permite navegar y
«Rol simulado» revisar la presentación para cada rol. Los guardados se simulan;
se pierden al cerrar. No conecta con producción ni necesita un nuevo Supabase.
La URL funciona dentro de la ventana controlada que abre el comando.
Cerrar la ventana o Ctrl+C termina la demo. `npm run demo:check` comprueba su
aislamiento. Para verificar guardados y permisos reales, seguir los pasos de
Supabase de pruebas siguientes y `RELEASE_REVIEW_2026_11_06.md`.

En «Vista → Resumen», el periodo inicial son las últimas cuatro semanas hasta
hoy. «Periodo del resumen» permite toda la temporada julio–junio y fechas
personalizadas. La guía del audio está en `SUSAN_AUDIO_REVIEW_2026_11_06.md`;
el recorrido preparado para Sergi está en `VEO_SERGI_REVIEW.md`.

Para sanciones, elegir «Vista → Convocatoria» y rol Admin. «Sanciones y acumulación»
aparece antes de la lista; «Marcar como cumplida» conserva el historial y actualiza
los avisos. Cambiar «Tipo de sesión de la demo» a Partido permite revisar el aviso
de sancionado junto al jugador y el aviso destacado cuando está convocado.

## Obtener el diagnóstico completo

El resultado `draft_defaults_version: null, count: 15` corresponde únicamente a
la última consulta. Indica 15 sesiones sin marcador, pero no distingue entre una
columna inexistente y una columna con valores NULL. El inventario de columnas
permite distinguirlo. No hace falta añadir el marcador a los históricos.

En Supabase SQL Editor, ejecutar el contenido completo de
`diagnostics/final_schema_export_read_only.sql`. Devuelve una fila con una celda
`diagnostic` que reúne las 19 secciones. Copiar o exportar la celda completa y
compartirla de forma privada para revisar funciones, políticas y triggers.
La consulta no modifica datos ni permisos y no incluye claves ni auth.users.

## Identificar un entorno separado

En el panel de Supabase, revisar la lista de proyectos. Un proyecto llamado
"test" o "staging" solo es una pista: verificar que su URL y referencia son
distintas de las del proyecto usado por la aplicación pública. Una rama de
pruebas también debe tener su propia URL y credenciales. Si no hay un entorno
separado confirmado, tratar la conexión actual como producción.

El archivo `.env` de esta carpeta ya tiene una conexión configurada. Ejecutar
la interfaz en localhost no cambia automáticamente su base de datos. No hacer
pruebas de escritura con esa conexión sin identificarla.

Para revisar la interfaz de inmediato, hay capturas de las páginas actuales en
`.phase4-test-artifacts/final-mobile-review/`. Son capturas con datos sintéticos;
no constituyen una prueba de los guardados contra Supabase real.

## Abrir la aplicación conectada a una base de pruebas

Primero hay que preparar un entorno Supabase separado con el esquema real,
funciones, políticas y triggers revisados, datos ficticios o anonimizados y
usuarios de prueba Admin y Coach. Un proyecto vacío no basta. Las integraciones
Batch 4 ya tienen un paquete compatible preparado localmente, pero falta su
validación con Auth/PostgREST en Supabase aislado. Seguir el paquete y orden de
`FINAL_RELEASE_PLAN.md`; no ejecutar migration 002 de forma independiente.

Una vez confirmado ese entorno, crear `.env.development.local` en la raíz de
`inspire-soccer-platform` con sus valores de pruebas:

```dotenv
VITE_SUPABASE_URL=https://REFERENCIA_DE_PRUEBAS.supabase.co
VITE_SUPABASE_ANON_KEY=CLAVE_PUBLICA_ANON_DEL_PROYECTO_DE_PRUEBAS
```

Usar la clave pública anon, nunca service_role ni una clave secreta. No subir
este archivo a Git. El modo development carga este archivo con prioridad sobre
`.env`; variables VITE_* ya definidas en la terminal tienen prioridad superior,
por lo que también deben apuntar a pruebas. Reiniciar Vite tras cambiar valores.

Desde PowerShell:

```powershell
cd C:\Users\berta\Desktop\INS\inspire-soccer-platform
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Abrir http://127.0.0.1:5173 e iniciar sesión con un usuario del entorno de
pruebas. No requiere publicar la web. Para detenerla, pulsar Ctrl+C.

Antes de guardar, comprobar en las herramientas de red del navegador que las
peticiones van a la referencia del proyecto de pruebas. Este servidor solo se
abre en este ordenador; la vista móvil del navegador permite revisar tamaños.
Probar en un teléfono físico requiere configurar además acceso desde la red.

Seguir `SUSAN_REVIEW_CHECKLIST.md`: perfiles, convocatorias, asistencia,
evaluaciones/N/A/comentarios, tarjetas y sanciones, históricos, informes y VEO.
Comprobar permisos con usuarios distintos, recarga tras guardar, confirmación y
reapertura, y conservación de datos. Registrar fallos antes de publicar.

Referencias oficiales: [entornos separados de Supabase](https://supabase.com/docs/guides/deployment/managing-environments)
y [ramas de pruebas](https://supabase.com/docs/guides/deployment/branching).
