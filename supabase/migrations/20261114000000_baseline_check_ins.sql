-- Recovered baseline of the existing, previously untracked check-in schema.
-- Reconstructed from the live database on 2026-11-14 for fresh databases only;
-- this is not an original historical migration or a pending production change.
-- Do not replay it against production or mark it applied without reconciliation.

CREATE TABLE public.stress_level_options (
    value smallint PRIMARY KEY,
    label text NOT NULL,
    CONSTRAINT stress_level_options_value_check CHECK (value >= 1 AND value <= 5),
    CONSTRAINT stress_level_options_label_key UNIQUE (label)
);

CREATE TABLE public.mood_level_options (
    value smallint PRIMARY KEY,
    label text NOT NULL,
    CONSTRAINT mood_level_options_value_check CHECK (value >= 1 AND value <= 5),
    CONSTRAINT mood_level_options_label_key UNIQUE (label)
);

CREATE TABLE public.team_conflict_level_options (
    value smallint PRIMARY KEY,
    label text NOT NULL,
    CONSTRAINT team_conflict_level_options_value_check CHECK (value >= 1 AND value <= 5),
    CONSTRAINT team_conflict_level_options_label_key UNIQUE (label)
);

CREATE TABLE public.fatigue_options (
    value smallint PRIMARY KEY,
    label text NOT NULL,
    CONSTRAINT fatigue_options_value_check CHECK (value >= 1 AND value <= 7),
    CONSTRAINT fatigue_options_label_key UNIQUE (label)
);

CREATE TABLE public.check_ins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL,
    check_in_date date NOT NULL,
    sleep_hours numeric(4, 2) NOT NULL,
    fatigue smallint NOT NULL,
    description text,
    stress_level smallint NOT NULL,
    mood_level smallint NOT NULL,
    team_conflict_level smallint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT check_ins_session_date_unique UNIQUE (session_id, check_in_date),
    CONSTRAINT check_ins_sleep_hours_check CHECK (sleep_hours >= 0 AND sleep_hours <= 24),
    CONSTRAINT check_ins_fatigue_check CHECK (fatigue >= 1 AND fatigue <= 7),
    CONSTRAINT check_ins_stress_level_check CHECK (stress_level >= 1 AND stress_level <= 5),
    CONSTRAINT check_ins_mood_level_check CHECK (mood_level >= 1 AND mood_level <= 5),
    CONSTRAINT check_ins_team_conflict_level_check CHECK (team_conflict_level >= 1 AND team_conflict_level <= 5),
    CONSTRAINT check_ins_stress_level_fk FOREIGN KEY (stress_level)
        REFERENCES public.stress_level_options (value) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT check_ins_mood_level_fk FOREIGN KEY (mood_level)
        REFERENCES public.mood_level_options (value) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT check_ins_team_conflict_level_fk FOREIGN KEY (team_conflict_level)
        REFERENCES public.team_conflict_level_options (value) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT check_ins_fatigue_fk FOREIGN KEY (fatigue)
        REFERENCES public.fatigue_options (value) ON DELETE NO ACTION ON UPDATE NO ACTION
);

INSERT INTO public.stress_level_options (value, label) VALUES
    (1, 'Very calm'),
    (2, 'Calm'),
    (3, 'Moderate'),
    (4, 'Stressed'),
    (5, 'Very stressed');

INSERT INTO public.mood_level_options (value, label) VALUES
    (1, 'Very happy / positive'),
    (2, 'Positive'),
    (3, 'Neutral'),
    (4, 'Negative'),
    (5, 'Very sad / negative');

INSERT INTO public.team_conflict_level_options (value, label) VALUES
    (1, 'No team conflict'),
    (2, 'Low team conflict'),
    (3, 'Moderate team conflict'),
    (4, 'High team conflict'),
    (5, 'Very high team conflict');

INSERT INTO public.fatigue_options (value, label) VALUES
    (1, 'Fully alert and wide awake'),
    (2, 'Very active and responsive, but not at peak alertness'),
    (3, 'Feeling well and ready'),
    (4, 'A little tired and less energetic'),
    (5, 'Moderately tired and fatigued'),
    (6, 'Extremely tired, with great difficulty concentrating'),
    (7, 'Completely exhausted and unable to function effectively');

ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stress_level_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mood_level_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_conflict_level_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fatigue_options ENABLE ROW LEVEL SECURITY;

-- Preserve the inspected grants. RLS has no public policies, so the API still
-- reads options through its authorized server connection.
REVOKE ALL ON TABLE public.check_ins FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.stress_level_options, public.mood_level_options,
    public.team_conflict_level_options, public.fatigue_options FROM PUBLIC;
GRANT ALL ON TABLE public.stress_level_options, public.mood_level_options,
    public.team_conflict_level_options, public.fatigue_options TO anon, authenticated;
