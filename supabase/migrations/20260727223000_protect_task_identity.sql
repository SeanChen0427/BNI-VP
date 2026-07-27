-- 防止既有工作沿用同一 source_reference 改成另一位會員或另一種案件。
-- 本 migration 只新增未來寫入防護，不更新任何既有任務、案件、草稿或附件。

create or replace function public.guard_work_plan_task_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.source = 'vice-chair-work-plan'
    and (
      new.source is distinct from old.source
      or new.source_reference is distinct from old.source_reference
      or btrim(new.title) is distinct from btrim(old.title)
      or new.category is distinct from old.category
    )
  then
    raise exception using message = 'TASK_IDENTITY_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_work_plan_task_identity on public.tasks;
create trigger protect_work_plan_task_identity
before update of source, source_reference, title, category on public.tasks
for each row
execute function public.guard_work_plan_task_identity();

revoke all on function public.guard_work_plan_task_identity() from public, anon, authenticated;
grant execute on function public.guard_work_plan_task_identity() to service_role;
