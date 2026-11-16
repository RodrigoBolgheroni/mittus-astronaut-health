-- The observed insights table is empty. Never invent missing AI-generated content.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.check_in_insights) THEN
    RAISE EXCEPTION 'Cannot add required check_in_insights.next_step: existing insights need an explicit content migration';
  END IF;
END $$;

alter table public.check_in_insights
  add column next_step text not null,
  add constraint check_in_insights_next_step_check check (btrim(next_step) <> '');
