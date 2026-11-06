# Revisión VEO de Sergi

Pendiente de la lista concreta anunciada por Susan en su audio. Esta guía
prepara la revisión; no añade requisitos que Sergi aún no ha pedido.

En la demo abierta por `npm run demo`, elegir «Vista → VEO Analytics». Los datos
y guardados de esa ventana son ficticios. Para una revisión de estadísticas
reales, usar el libro aprobado y el entorno aislado indicado en el plan de publicación.

## Qué puede revisar ahora

- Resumen VEO: temporada, serie, resultados y tendencias.
- Partidos: selección de jornada, Inspire frente a rival, ranking y métricas individuales.
- Jugadores: evolución y estadísticas deportivas por jugador y partido.
- Clasificación y comparación: métricas, rankings y comparaciones entre jugadores.
- Primas: importes calculados, jornada de inicio y advertencias sobre datos pendientes.
- Importación, disponible para Admin: lectura del Excel local, validación y
  correspondencias de jugadores/sesiones. Publicar requiere el backend validado.

El módulo distingue datos publicados de Excel local sin publicar. No hay conexión
directa a una API de VEO ni incorporación de sus métricas al PDF del club ya acordada.
Las notas del entrenador y el índice VEO siguen siendo cálculos independientes.
Los permisos actuales de Coach no incluyen importar/publicar.

## Lista que necesitamos de Sergi

Para cada necesidad, anotar la pantalla, el dato que falta, de dónde procede y
qué decisión quiere tomar con él. Un ejemplo concreto de jugador/partido y del
resultado esperado permite comprobar que el cálculo responde a su necesidad.

| Necesidad | Detalle que concretar |
|---|---|
| Métricas prioritarias | Nombre exacto, unidad, total/media/por 90 minutos y fuente disponible |
| Periodo de análisis | Partido, últimas cuatro semanas, temporada o comparación de periodos |
| Comparaciones | Jugadores, posición, rival o evolución del mismo jugador |
| Informes | Qué campos deben ir al PDF de equipo y al individual |
| Datos incompletos | Cómo deben mostrarse valores faltantes, duplicados y discrepancias con FCF |
| Acceso y trabajo diario | Qué necesita consultar Sergi y qué tareas debe preparar Admin |

Las fórmulas deportivas y de primas existentes se conservan hasta recibir y
aprobar cambios concretos. Los campos sin fuente no se completan con ceros ficticios.
