CREATE TABLE check_ins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL,
    check_in_date date NOT NULL,
    sleep_hours numeric(4, 2) NOT NULL,
    stress_level smallint NOT NULL,
    mood_level smallint NOT NULL,
    team_conflict_level smallint NOT NULL,
    fatigue smallint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT check_ins_session_date_unique
        UNIQUE (session_id, check_in_date),
    CONSTRAINT check_ins_sleep_hours_range
        CHECK (sleep_hours >= 0 AND sleep_hours <= 24),
    CONSTRAINT check_ins_stress_level_range
        CHECK (stress_level BETWEEN 1 AND 5),
    CONSTRAINT check_ins_mood_level_range
        CHECK (mood_level BETWEEN 1 AND 5),
    CONSTRAINT check_ins_team_conflict_level_range
        CHECK (team_conflict_level BETWEEN 1 AND 5),
    CONSTRAINT check_ins_fatigue_range
        CHECK (fatigue BETWEEN 1 AND 7)
);
