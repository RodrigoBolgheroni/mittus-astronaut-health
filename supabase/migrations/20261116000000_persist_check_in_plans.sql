-- Recover the observed persisted-plan schema for fresh migration-history replay.
-- Reconcile the remote migration history before release; do not replay this baseline remotely.
alter table public.check_in_actions
  add column if not exists task_key text,
  add column if not exists title text,
  add column if not exists source text,
  add column if not exists kind text;

-- Only fill absent legacy metadata. Never change persisted user state or supplied content.
-- The former action-code uniqueness guarantees these legacy task keys are distinct.
update public.check_in_actions
set task_key = coalesce(task_key, action_code),
    title = coalesce(title, case action_code
      when 'monitor' then 'Keep tracking your check-ins'
      when 'recheck' then 'Record a new check-in'
      when 'contact_crew' then 'Contact your crew'
      when 'contact_medical' then 'Contact your medical team'
    end),
    source = coalesce(source, 'forecast'),
    kind = coalesce(kind, 'task')
where task_key is null or title is null or source is null or kind is null;

alter table public.check_in_actions
  alter column task_key set not null,
  alter column task_key drop default,
  alter column title set not null,
  alter column title drop default,
  alter column source set not null,
  alter column source drop default,
  alter column kind set not null,
  alter column kind set default 'task',
  alter column forecast_snapshot drop not null,
  drop constraint check_in_actions_evaluation_action_key,
  add constraint check_in_actions_evaluation_task_key
    unique (check_in_id, evaluation_key, task_key),
  add constraint check_in_actions_task_key_check check (task_key ~ '^[a-z0-9_]+$'),
  add constraint check_in_actions_title_check check (btrim(title) <> ''),
  add constraint check_in_actions_source_check check (source in ('forecast', 'check_in', 'system')),
  add constraint check_in_actions_kind_check check (kind in ('task', 'review_insight')),
  add constraint check_in_actions_forecast_snapshot_source_check check (
    source <> 'forecast' or forecast_snapshot is not null
  );

-- Keep the original object-shape validation when a snapshot is supplied, while
-- permitting SQL NULL for tasks that do not depend on a forecast.
alter table public.check_in_actions
  drop constraint check_in_actions_forecast_snapshot_check,
  add constraint check_in_actions_forecast_snapshot_check check (
    forecast_snapshot is null or (
      jsonb_typeof(forecast_snapshot) = 'object'
      and jsonb_typeof(forecast_snapshot -> 'model_version') is not distinct from 'string'
      and btrim(forecast_snapshot ->> 'model_version') <> ''
      and jsonb_typeof(forecast_snapshot -> 'predicted_at') is not distinct from 'string'
      and btrim(forecast_snapshot ->> 'predicted_at') <> ''
      and case when jsonb_typeof(forecast_snapshot -> 'probability_high_fatigue') = 'number'
        then (forecast_snapshot ->> 'probability_high_fatigue')::numeric between 0 and 1
        else false
      end
    )
  );

create table public.check_in_insights (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.check_ins(id) on delete cascade,
  evaluation_key text not null check (btrim(evaluation_key) <> ''),
  title text not null check (btrim(title) <> ''),
  summary text not null check (btrim(summary) <> ''),
  facts jsonb not null check (jsonb_typeof(facts) = 'object'),
  source text not null check (source in ('ai', 'fallback')),
  generator text,
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  constraint check_in_insights_generator_check check (generator is null or btrim(generator) <> ''),
  constraint check_in_insights_source_generator_check check (
    (source = 'ai' and generator is not null) or (source = 'fallback' and generator is null)
  ),
  constraint check_in_insights_superseded_check check (superseded_at is null or superseded_at >= created_at),
  constraint check_in_insights_evaluation_key unique (check_in_id, evaluation_key)
);

create unique index check_in_insights_current_idx
  on public.check_in_insights (check_in_id) where superseded_at is null;
create index check_in_insights_check_in_created_idx
  on public.check_in_insights (check_in_id, created_at desc);

alter table public.check_in_actions enable row level security;
alter table public.check_in_insights enable row level security;
revoke all on table public.check_in_actions, public.check_in_insights from public, anon, authenticated;
