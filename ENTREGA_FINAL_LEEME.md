# Inspire Soccer — entrega integrada 2026/27

Esta carpeta parte del ZIP de Fase 4 proporcionado por la usuaria y conserva su estructura.

## Instalación

1. Copiar el `.env` de la instalación local actual (NO está incluido en este ZIP).
2. Ejecutar `npm install` y después `npm run dev`.
3. En Supabase SQL Editor ejecutar `supabase/FINAL_2026_27.sql` **una vez**, tras hacer copia de seguridad. No elimina datos.
4. Comprobar los roles de `profiles` y las políticas RLS del proyecto antes de publicar.

## Cambios incluidos

- Navegación para coach: equipo, sesiones, convocatorias, asistencia, evaluación, lesiones, standouts e informes.
- Ficha de jugador de consulta para coach; edición reservada a admin.
- Informes por fechas de jugador/equipo con evaluaciones, asistencia, tarjetas, lesiones y standouts; CSV y **Guardar como PDF** mediante el diálogo de impresión del navegador (activar ventanas emergentes). No es un generador de PDF silencioso.
- Revisiones Must-Win mensuales con almacenamiento en Supabase y acceso exclusivo a admin.
- Weekly Intelligence y notas privadas de admin existentes.
- Funcionalidades preexistentes de perfiles, navegación circular de evaluación, selección de convocatoria y Top 2/Bottom 2 conservadas.

## Limitaciones y verificación pendiente

- No se ha conectado al Supabase real ni verificado el comportamiento extremo a extremo de RLS, porque no se dispone de credenciales ni acceso al proyecto remoto.
- Los avisos de cumpleaños funcionan dentro de la pantalla de jugadores, **no** son notificaciones push automáticas el día anterior.
- El resumen semanal se calcula al entrar a Weekly Intelligence para la semana elegida; **no** se envía automáticamente cada lunes.
- La descarga PDF usa la impresión del navegador, no un PDF generado en servidor.
- Para permitir a Sergi editar sesiones, jugadores o convocatorias, las políticas RLS existentes deben permitir esas operaciones; esta entrega no desactiva la seguridad. Las políticas de `players`, `sessions`, `callups` y demás deben auditarse contra el esquema original antes de ampliar permisos.
- El entorno de instalación de dependencias de esta sesión quedó incompleto, por lo que **no se ha confirmado que `npm run build` pase**. Verificar localmente antes de desplegar.
