# Corrección focalizada v4

- N/A es reversible hasta confirmar evaluación. Seleccionar un número también desmarca N/A automáticamente.
- Navegar al siguiente jugador ya no marca la evaluación como finalizada.
- Botones Anterior y Siguiente juntos al final de la evaluación por jugador.
- No se modifica el código de tarjetas, comentarios, asistencias ni la estructura SQL.
- No ejecutar migraciones nuevas: se reutiliza `not_applicable` ya creada.

Pruebas antes de publicar: N/A -> puntuación -> N/A; anterior/siguiente; recargar y revisar; confirmar y comprobar bloqueo. No usar datos reales para pruebas.
