-- Incremental metadata only. Do not replay historical migrations or source guards.
begin;
alter table public.task_case_files
  add column if not exists documents jsonb not null default '{}'::jsonb;
comment on column public.task_case_files.documents is
  'Server-owned V1.1 renewal document metadata, keyed by renewal-interview / renewal-assessment. Legacy primary attachment remains unchanged.';
commit;
