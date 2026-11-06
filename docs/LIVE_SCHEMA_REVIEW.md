# Revisión del diagnóstico aportado por el usuario

Actualización posterior: el usuario también ha aportado current_role (definición
real con search_path vacío) y las opciones de vistas. active_suspensions y
player_card_totals no tenían security_invoker y admitían anon; official_evaluations
ya tenía security_invoker. El paquete local 004 corrige los accesos de las tres.
Los adaptadores y operaciones atómicas ya están implementados y probados en
PostgreSQL local; ver `RELEASE_REVIEW_2026_11_06.md`. Los hallazgos siguientes
describen el snapshot original, que no se ha modificado en producción.

Fecha: 6 de noviembre de 2026. Revisión local de la exportación JSON entregada
en la conversación. No se ha accedido a Supabase ni ejecutado SQL remoto.
El usuario confirma que actualmente no usa un entorno de pruebas.

## Hechos observados

- La exportación contiene las 19 secciones esperadas: 110 columnas, 39 políticas,
  cuatro triggers, tres definiciones de funciones y tres vistas. Las once tablas
  operativas inventariadas tienen RLS activado; esto no certifica cada permiso.
- Hay 15 sesiones sin marcador. El inventario confirma que la columna
  `sessions.draft_defaults_version` todavía no existe. No hay que rellenar
  históricos para resolverlo.
- No aparecen funciones Batch 4. La rama local requiere sus RPC y no puede
  considerarse compatible para los flujos de confirmación con esta base actual.
- No aparecen duplicados de pares sesión/jugador en callups, attendance o
  evaluations, ni múltiples tarjetas para esos pares en el snapshot recibido.
  Esto no acredita restricciones ni concurrencia futuras.
- `prevent_locked_session_edits()` usa `status = 'locked' OR locked_at IS NOT NULL`
  y permite la excepción Admin mediante `public.current_role()`. Está conectado
  a INSERT/UPDATE/DELETE de attendance, cards y evaluations. No aparecen esos
  triggers en callups, suspensions o session_standouts. En UPDATE comprueba la
  sesión NEW; los nuevos guards deberán impedir mover registros entre sesiones.
- `enforce_high_rating_limit()` comprueba valores >=4 por cada una de las cinco
  cualidades. No tiene lock explícito de sesión y no consulta na_fields ni
  not_applicable. Hay que contrastar sus efectos con los nuevos límites y N/A.
- `create_yellow_accumulation_suspensions()` es SECURITY DEFINER, propiedad de
  postgres, sin search_path fijado, con EXECUTE para PUBLIC/anon/authenticated
  y sin comprobación de usuario/rol en su cuerpo. Inserta sanciones y debe
  endurecerse mediante un cambio revisado. No se ha invocado para demostrarlo.
  Cuenta solo tarjetas yellow, frente a la vista player_card_totals que cuenta
  double_yellow como dos amarillas. Solo evita otra sanción actualmente activa;
  no establece ciclos de cinco amarillas ni idempotencia concurrente. El único
  índice exportado de suspensions es su clave primaria.
- session_standouts conserva políticas Admin y otras permisivas que también
  permiten escribir a Coach. Las políticas Admin no cancelan esas políticas
  adicionales; el alcance real es más amplio que el botón Admin de la interfaz.
- official_evaluations mantiene el corte 2026-10-14 y excluye records_only_confirmed.
  Su definición no exige evaluation_confirmed ni evaluated. Conservar el hecho y
  confirmar la regla esperada antes de cambiar estadísticas.

## Información que falta y trabajo siguiente

La exportación inicial no incluía la definición de `public.current_role()`,
utilizada por numerosas políticas, ni reloptions (por ejemplo security_invoker)
de las vistas. Se prepara `diagnostics/final_schema_followup_read_only.sql` para
obtener ambas cosas en una celda JSON, sin consultar datos de usuarios.
Que una vista tenga relrowsecurity=false no demuestra por sí solo una exposición:
hay que revisar sus opciones, propietarios, grants y tablas subyacentes.

Las definiciones reales ahora recibidas permiten continuar el diseño local de
los dos adaptadores. No convierten los borradores en migraciones aprobadas ni
certifican funcionamiento bajo usuarios autenticados y transacciones concurrentes.

Preparar un segundo proyecto Supabase, con URL propia, esquema revisado, datos
ficticios o anonimizados y cuentas de prueba. Después conectar únicamente la
versión local a ese entorno siguiendo `LOCAL_PREVIEW_GUIDE.md`. Un proyecto nuevo
vacío no permite todavía probar todos los flujos. No ejecutar el SQL histórico
entero ni migration 002 sin sus adaptadores revisados.
