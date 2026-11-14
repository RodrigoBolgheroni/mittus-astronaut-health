-- Applies to the existing Supabase database inspected on 2026-11-14.
-- Existing option tables, actions, CHECK constraints and RLS remain in place.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Abort rather than invent values for incomplete historical check-ins.
ALTER TABLE public.check_ins
    ALTER COLUMN stress_level SET NOT NULL,
    ALTER COLUMN mood_level SET NOT NULL,
    ALTER COLUMN team_conflict_level SET NOT NULL;

ALTER TABLE public.check_ins
    RENAME CONSTRAINT check_ins_session_id_check_in_date_key
    TO check_ins_session_date_unique;

COMMIT;
