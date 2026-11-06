-- READ ONLY. Optional: identify existing profile login emails privately.
-- Contains personal account details; do not publish this result.
-- No passwords, tokens, changes or reads of auth.users.
SELECT id,full_name,email,role FROM public.profiles ORDER BY full_name,email;
