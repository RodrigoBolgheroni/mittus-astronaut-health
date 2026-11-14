-- Run with psql -v ON_ERROR_STOP=1 -f test/database/check-ins.sql.
-- All test records are rolled back, including when a test fails.
BEGIN;

DO $$
DECLARE
    test_session uuid := gen_random_uuid();
    record_id uuid;
    field_name text;
    invalid_value integer;
BEGIN
    INSERT INTO public.check_ins (
        session_id, check_in_date, sleep_hours,
        stress_level, mood_level, team_conflict_level, fatigue
    ) VALUES (test_session, DATE '2099-01-01', 7.5, 1, 1, 1, 3)
    RETURNING id INTO record_id;

    IF record_id IS NULL THEN
        RAISE EXCEPTION 'Missing generated check-in ID';
    END IF;

    BEGIN
        INSERT INTO public.check_ins (
            session_id, check_in_date, sleep_hours,
            stress_level, mood_level, team_conflict_level, fatigue
        ) VALUES (test_session, DATE '2099-01-01', 8, 2, 2, 2, 4);
        RAISE EXCEPTION 'Duplicate session/date was accepted';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    -- Another session may use the same date.
    INSERT INTO public.check_ins (
        session_id, check_in_date, sleep_hours,
        stress_level, mood_level, team_conflict_level, fatigue
    ) VALUES (gen_random_uuid(), DATE '2099-01-01', 8, 2, 2, 2, 4);

    FOREACH field_name IN ARRAY ARRAY[
        'stress_level', 'mood_level', 'team_conflict_level'
    ] LOOP
        BEGIN
            EXECUTE format('UPDATE public.check_ins SET %I = NULL WHERE id = $1', field_name)
                USING record_id;
            RAISE EXCEPTION 'NULL accepted for %', field_name;
        EXCEPTION WHEN not_null_violation THEN
            NULL;
        END;
    END LOOP;

    FOREACH field_name IN ARRAY ARRAY[
        'sleep_hours', 'stress_level', 'mood_level', 'team_conflict_level', 'fatigue'
    ] LOOP
        FOREACH invalid_value IN ARRAY ARRAY[-1, 25] LOOP
            BEGIN
                EXECUTE format('UPDATE public.check_ins SET %I = $1 WHERE id = $2', field_name)
                    USING invalid_value, record_id;
                RAISE EXCEPTION 'Out-of-range value accepted for %', field_name;
            EXCEPTION WHEN check_violation THEN
                NULL;
            END;
        END LOOP;
    END LOOP;

    IF EXISTS (
        SELECT 1 FROM pg_class
        WHERE relnamespace = 'public'::regnamespace
          AND relname IN (
              'check_ins', 'check_in_actions', 'fatigue_options',
              'stress_level_options', 'mood_level_options', 'team_conflict_level_options'
          ) AND NOT relrowsecurity
    ) THEN
        RAISE EXCEPTION 'Row level security is disabled';
    END IF;
END;
$$;

ROLLBACK;
