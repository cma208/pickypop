-- A maintenance plan carries a checklist, but there was nowhere to record
-- which items were actually ticked when the work was done, so it ended up
-- squeezed into the free-text note. Now it has its own column.

alter table public.maintenance_logs
  add column checklist_done jsonb not null default '[]'::jsonb;

comment on column public.maintenance_logs.checklist_done is
  'Items from the plan checklist that were ticked, as they were worded that day.';
