# Inspire Soccer Platform

Plataforma gratuita para recogida de datos de entrenos/partidos.

## Stack
- React + Vite
- Supabase Free Plan
- Vercel Free/Hobby Plan

## Qué incluye
- Login por email con Supabase Auth
- Roles básicos: admin, coach, viewer
- Jugadores, sesiones, convocatoria, asistencia, evaluaciones, lesiones y tarjetas
- Evaluación jugador por jugador con botón Next
- Límite de puntuaciones altas: máximo 6 jugadores con 4/5 por categoría y sesión
- Resumen por sesión

## Instalación local
```bash
npm install
cp .env.example .env
npm run dev
```

## Supabase
1. Crea un proyecto en Supabase.
2. Ve a SQL Editor.
3. Copia y ejecuta `supabase/schema.sql`.
4. Copia Project URL y anon public key en `.env`.

## Roles
Registra usuarios desde la app. Luego en Supabase Table Editor cambia su rol en `profiles`:
- `admin`
- `coach`
- `viewer`

## Deploy gratis en Vercel
1. Sube este proyecto a GitHub.
2. Crea proyecto en Vercel.
3. Añade variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. Deploy.
