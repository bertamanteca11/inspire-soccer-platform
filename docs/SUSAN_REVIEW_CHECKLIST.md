# Revisión de Susan — antes de autorizar la publicación

6 de noviembre de 2026. Marcar en un entorno de prueba aislado. No cambiar datos
reales ni ejecutar migraciones antiguas para completar esta lista.

## Decisiones que siguen pendientes

- [ ] Confirmar que Susan y Berta son Admin y Sergi Coach en las cuentas reales.
- [x] Usuario confirma 3 inicial en nuevas evaluaciones operativas. Se muestra sin
  guardar al abrir; al confirmar se guardan los 3 intactos. No reemplaza notas/N/A
  existentes ni rellena huecos históricos. Probar el circuito en Supabase separado.
- [x] Usuario confirma límites por cualidad: altas 4–5 y bajas 1–2. Máximos según
  la sesión, por defecto 6 altas y 3 bajas; el 3 y N/A no consumen el cupo.
- [x] Susan solicita cuatro cualidades: retirar la quinta del editor y de las
  medias actuales conservando sus registros históricos. Implementado localmente.
- [x] Usuario confirma la revisión de tres sesiones: partido 18/10/2026 y entrenos
  21/10/2026 y 23/10/2026. Existe un selector explícito de esa revisión en Resumen.
- [x] Audio de Susan: Resumen abre las últimas cuatro semanas (28 días, incluido
  hoy), con selección automática de sesiones completadas. Usuario confirma que
  Toda la temporada abarca julio–junio. Selector de temporada, fechas personalizadas,
  ajuste de sesiones e historial completo permanecen disponibles.
- [ ] Aplicar y verificar la corrección de Marcos en el entorno autorizado: Susan
  indica injustificada el 18 y el 21. La evidencia guardada sigue siendo sin fila
  el 18, justificada con nota el 21 y presente el 23. Susan revisará el registro
  del equipo del 18 y su presencia el 23. Conservar la nota del 21 y las cuatro
  injustificadas anteriores. Ver `SUSAN_AUDIO_REVIEW_2026_11_06.md` para el circuito.
- [ ] Aclarar el estado antiguo «Lesionado» sin especificar. Se conserva separado.
- [ ] Confirmar quién puede editar destacados: el frontend actual permite Admin;
  un SQL antiguo propone Coach. No se han ampliado permisos para resolverlo.
- [ ] Probar sanciones cumplidas: conserva historial y reinicia acumulación de
  amarillas simples al cumplir su sanción; roja no reinicia amarillas. Se mantienen
  las reglas originales de doble amarilla y se explican en pantalla.
- [ ] En Convocatoria, comprobar «Sanciones y acumulación» antes de la lista de
  jugadores. Admin puede marcar como cumplida y ve la confirmación; se actualizan
  los avisos. En partidos, comprobar el aviso individual y el destacado para
  convocados sancionados, también como Coach. Antes de confirmar se releen sanciones;
  cancelar el diálogo no guarda ni cambia la selección.
- [ ] Concretar POLAR: datos disponibles, API/dispositivo, permisos y medidas que
  deben mostrarse. No existe una integración ni se han simulado mediciones reales.
- [ ] Sergi revisará VEO y aportará la lista exacta de requisitos, incluidas las
  métricas para PDF de equipo/jugador. No se han inventado requisitos a partir
  del audio. Ver `VEO_SERGI_REVIEW.md`; el módulo mantiene sus fórmulas actuales.

## Convocatoria y asistencia

- [ ] Crear una sesión con origen operativo explícito. Los jugadores elegibles
  aparecen convocados visualmente; abrir/tocar controles no guarda registros.
- [ ] Marcar una excepción No convocado y revisar prueba/invitado.
- [ ] Confirmar como Admin; como Coach, comprobar que no se puede editar/confirmar.
- [ ] Reabrir como Admin: se mantienen exactamente las decisiones guardadas.
- [ ] Abrir asistencia: Presente visual solo para convocados de la sesión nueva;
  los no convocados sin registro no se convierten automáticamente en presentes.
- [ ] Cambiar ausencia, justificación, retraso y notas. Salir sin guardar y volver:
  no se ha guardado el borrador.
- [ ] Pulsar Guardar asistencia: se conservan también los Presente no tocados.
- [ ] Modificar algo sin guardar e intentar confirmar: debe pedir guardar primero.
- [ ] Confirmar, comprobar bloqueo Coach y reabrir únicamente asistencia como Admin.
- [ ] Revisar sesión histórica y jugador dado de baja: se conserva la participación;
  los huecos históricos no reciben datos inventados.

## Evaluaciones y disciplina

- [ ] Revisar por cualidad y por jugador. Probar número → N/A → número y comprobar
  la media con el denominador correcto.
- [ ] Guardar comentario A, pasar a B y volver a A; no deben intercambiarse.
- [ ] Comprobar límites altos/bajos, incluidos límites cero, y lecturas fallidas.
- [ ] Cambiar una evaluación desde otro cliente: confirmar debe pedir recargar.
- [ ] Probar Solo registros sin participantes evaluables y sin puntuaciones previas.
- [ ] Probar tarjeta/sanción en el clon: ante fallo parcial debe verse el problema,
  sin repetir la tarjeta ni declarar la evaluación confirmada.
- [ ] Verificar el bloqueo global tanto por estado como por fecha de bloqueo y
  la regla Admin exacta. Los adaptadores ya están preparados y probados localmente;
  falta validarlos con Auth/PostgREST y los usuarios del entorno Supabase separado.

## Uso móvil, perfiles e informes

- [ ] Abrir Resumen: últimos 28 días hasta hoy sin seleccionar sesiones a mano.
  Comparar las fechas, sesiones, asistencia, tarjetas y medias. Cambiar a temporada
  julio–junio, seleccionar una anterior y volver al periodo reciente. En marzo,
  octubre solo contribuye al seleccionar la temporada o un periodo que lo incluya.
- [ ] Como Admin, abrir «Revisar asistencia» desde la tabla del Resumen. Abrir no
  modifica nada. Reabrir, corregir clasificación, guardar y confirmar conserva
  las notas. Coach/consulta no ven el acceso de corrección de Admin.
- [ ] Probar en los teléfonos reales habituales, también teclado abierto y giro.
- [ ] Recorrer jugador anterior/siguiente hasta volver al inicio; consultar bajas,
  lesión, trayectoria, avatar y comentarios históricos sin perder registros.
- [ ] Abrir/cerrar formularios con teclado y comprobar que el foco vuelve al botón.
- [ ] Revisar Top/Bottom de sesión, Top 3 semanal y confianza mensual; las notas
  privadas no aparecen a Coach/consulta ni en PDF/CSV.
- [x] A petición del usuario, las pantallas habituales no muestran contadores de
  evaluaciones excluidas. Se mantienen los filtros de elegibilidad, los errores
  de lectura y el acceso a registros históricos.
- [ ] Generar PDF de equipo y jugador y CSV con fechas inclusivas; comparar con
  filas persistidas. «Descargar PDF» descarga un archivo, sin imprimir el navegador.
- [ ] Verificar VEO con el libro aprobado: duplicados/nulos visibles y primas desde
  jornada 5. Las jornadas 1–4 no avanzan los contadores de primas.
- [ ] Probar instalación PWA después de preparar los iconos correctos; no se ha
  certificado instalación en iOS/Android ni uso sin conexión.

## Datos y autorización final

- [ ] Revisar manualmente las decisiones antiguas sobre Ian Ben, Pol Pariente,
  Danzel y los registros del 7/9 de octubre, con identificadores verificados.
  No se han aplicado cambios automáticos.
- [ ] Aprobar backup probado, esquema real, SQL definitivo y pruebas Admin/Coach
  en el clon, incluidas las operaciones concurrentes y los permisos directos.
- [ ] Autorizar por separado migración de producción, publicación y cualquier
  reparación de datos. Este trabajo no ha hecho commit, push, merge ni despliegue.
