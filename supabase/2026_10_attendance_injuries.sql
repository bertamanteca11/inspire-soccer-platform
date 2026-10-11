-- Migración segura: status es un ENUM PostgreSQL, NO un CHECK.
-- No elimina ni actualiza ninguna fila existente. Ejecutar tras copia de seguridad.
ALTER TYPE public.attendance_status ADD VALUE IF NOT EXISTS 'injured_present';
ALTER TYPE public.attendance_status ADD VALUE IF NOT EXISTS 'injured_justified_absence';
ALTER TYPE public.attendance_status ADD VALUE IF NOT EXISTS 'injured_unjustified_absence';
