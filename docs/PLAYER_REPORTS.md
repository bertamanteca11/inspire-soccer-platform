# Informes de seguimiento por jugador

El PDF individual es un informe A4 vertical de dos páginas. En Informes se elige
el jugador, las fechas y «Generar informe». La vista previa muestra el balance
y los puntos para conversar antes de descargar. El periodo inicial son las
últimas cuatro semanas y las fechas siguen siendo editables.

La primera página presenta identidad, periodo, cuatro indicadores y una lectura
escrita del balance. Muestra las cuatro cualidades, con valoraciones de
entrenamientos separadas de partidos y otras actividades deportivas. La segunda
recoge asistencia, incidencias fechadas, lesiones, disciplina, comentarios del
entrenador y puntos de seguimiento. El PDF de equipo conserva la comparación
entre jugadores, acompañada por un balance del periodo. El CSV sigue disponible.

## Interpretación de los datos

- Se incluyen sesiones deportivas completadas dentro de las fechas elegidas;
  no se modifican las reglas del resumen operativo ni los registros originales.
- Las puntuaciones reutilizan el cálculo de cuatro cualidades, elegibilidad y
  corte oficial del 14/10/2026. N/A no se transforma en cero. Las actividades con
  menos de cuatro evaluaciones no reciben una comparación de evolución. Cuando
  hay suficientes, se comparan dos grupos del mismo tamaño por orden de sesión;
  con un número impar se deja fuera la sesión central de esa comparación.
- La asistencia presencial incluye presente, retrasos y asistencia al fisio.
  El porcentaje usa únicamente registros con presencia o ausencia clasificable.
  Una convocatoria sin asistencia no se convierte en falta. Los casos sin
  datos o con registros duplicados se señalan para revisión.
- Las ausencias injustificadas incluyen las registradas como lesionado ausente
  injustificado. Retrasos justificados e injustificados se distinguen.
- Las lesiones se incluyen por solapamiento de fechas, aunque empezaran antes
  del periodo. Un alta posterior no se presenta como alta dentro del periodo.
  Las lesiones sin fecha inicial no se atribuyen al periodo y se advierte de ello.
- Una doble amarilla cuenta como dos amarillas y una expulsión. Se distingue
  el número de sanciones originadas/registradas en el periodo de las sanciones
  activas y partidos pendientes consultados al generar el informe, incluidos
  los que tienen un origen anterior.
- Los motivos de asistencia y comentarios de evaluación proceden de los datos
  de ese periodo. No se consultan flags privados de administración, notas del
  staff privado ni anotaciones de trayectoria ajenas al periodo.

El resumen es determinista y describe hechos registrados; no diagnostica
lesiones ni inventa una valoración del carácter del jugador. Para mantener las
dos páginas se muestran hasta tres incidencias (priorizando injustificadas),
dos lesiones y dos comentarios recientes. Se indican los recuentos totales,
los extractos abreviados y dónde consultar los originales completos.

## Validación y publicación

`tests/player-report.test.cjs` verifica periodos, elegibilidad, cuatro cualidades,
N/A, lesiones solapadas y altas posteriores, ausencias, datos ausentes, tarjetas,
sanciones anteriores, comentarios y el límite de dos páginas con textos largos.
Las pruebas de navegador comprueban descarga individual/equipo y CSV, bloqueo
de exportaciones incompletas y presentación móvil. Las pruebas existentes
comparan las medias con Resumen e Inicio. Se revisa también un PDF renderizado
con datos ficticios. No hay migración SQL ni escritura de datos de producción.
