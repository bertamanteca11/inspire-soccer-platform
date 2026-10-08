# Descarga PDF directa — Inspire Soccer 2026/27

Esta version reemplaza la ventana de impresion por una descarga directa de PDF desde Informes.

## Instalacion
1. Descomprime en una carpeta nueva.
2. Copia tu `.env` de la version anterior (no compartas claves).
3. Ejecuta `npm install` (requiere conexion a Internet para descargar jspdf y jspdf-autotable).
4. Ejecuta `npm run dev`.
5. Abre Informes, elige jugador o equipo, selecciona fechas, pulsa Generar informe y despues Descargar PDF.
6. Comprueba `npm run build` antes de publicar.

No hay nuevas migraciones SQL. Ya has ejecutado FINAL_2026_27.sql.

El PDF incluye resumen y tabla de estadisticas; no incorpora automaticamente el detalle narrativo de todas las sesiones.
