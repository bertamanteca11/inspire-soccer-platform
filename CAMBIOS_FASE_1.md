# Inspire Soccer — Fase 1

## Cambios incluidos

- Rediseño mobile-first inspirado en la referencia: gris suave, negro y lima eléctrico.
- Navegación inferior reducida a 5 acciones y menú «Más» para evitar scroll horizontal.
- Preparación para instalación como web app: manifest, standalone mode, safe areas de iPhone y metadata móvil.
- Evaluación: eliminado «E. Calidad del desempeño» de los entrenamientos.
- Evaluación: «Anterior» ahora hace loop del primer jugador al último, igual que «Siguiente».
- Convocatoria: al cambiar convocado/no convocado ya no se recarga toda la página; se actualiza localmente y avanza visualmente al siguiente jugador.

## No requiere migración de Supabase

Esta fase no modifica tablas ni datos.

## Publicación

1. Copiar estos cambios al repositorio o sustituir el proyecto por esta versión.
2. Mantener las variables de entorno de Vercel/Supabase existentes.
3. `npm install`
4. `npm run build`
5. Push a GitHub; Vercel volverá a desplegar automáticamente si el repositorio está conectado.

## PWA

El proyecto ya incluye `public/manifest.webmanifest` y metadata de standalone. En una siguiente fase conviene añadir iconos propios de Inspire (192x192 y 512x512) al manifest para que el acceso de pantalla de inicio tenga branding perfecto.

## Siguiente fase propuesta

Player Profile 2.0: fecha de nacimiento, notas de trayectoria, resumen de lesiones, foto, cumpleaños próximos y base de datos necesaria para reports.
