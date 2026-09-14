-- Keep assignment history immutable while allowing PostgreSQL to detach its
-- optional task link when an unfinished task is deleted (ON DELETE SET NULL).
create or replace function private.protect_task_assignment_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if pg_catalog.pg_trigger_depth() > 1
      and old.task_id is not null
      and new.task_id is null
      and (pg_catalog.to_jsonb(new) - 'task_id') = (pg_catalog.to_jsonb(old) - 'task_id')
      and not exists (select 1 from public.tasks where id = old.task_id)
    then
      return new;
    end if;
  end if;
  raise exception using message = 'AUDIT_HISTORY_IMMUTABLE';
end;
$$;

revoke all on function private.protect_task_assignment_history()
  from public, anon, authenticated;

drop trigger if exists task_assignment_history_immutable on public.task_assignment_history;
create trigger task_assignment_history_immutable
before update or delete on public.task_assignment_history
for each row execute function private.protect_task_assignment_history();

comment on function private.protect_task_assignment_history() is
  'Allows only FK-triggered task_id detachment after task deletion; all assignment history content remains immutable.';
