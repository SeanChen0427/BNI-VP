-- 修正首筆正式任務寫入時，RETURNS TABLE 的 task_id 輸出欄位與
-- task_private_details.task_id 在 ON CONFLICT 中產生名稱歧義。

create or replace function public.edge_save_task(
  p_task jsonb,
  p_actor uuid,
  p_lead uuid,
  p_companions uuid[],
  p_member uuid,
  p_expected_revision bigint default null,
  p_import boolean default false
)
returns table(task_id uuid, revision bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.tasks%rowtype;
  saved_id uuid;
  saved_revision bigint;
  task_status public.task_status;
  completed_at timestamptz;
  due_at timestamptz;
  companion_id uuid;
begin
  select * into existing
  from public.tasks
  where source = 'vice-chair-work-plan'
    and source_reference = p_task->>'id'
  for update;

  task_status := case when coalesce((p_task->>'completed')::boolean, false)
    then 'completed'::public.task_status else 'pending'::public.task_status end;
  completed_at := case when task_status = 'completed'
    then coalesce(nullif(p_task->>'completedAt', '')::timestamptz, now()) else null end;
  due_at := nullif(p_task->>'dueAt', '')::timestamptz;

  if existing.id is not null then
    if not p_import and (p_expected_revision is null or p_expected_revision <> existing.revision) then
      raise exception using message = 'TASK_CONFLICT';
    end if;
    if p_import then
      return query select existing.id, existing.revision;
      return;
    end if;
    update public.tasks set
      member_id = p_member,
      title = p_task->>'member',
      category = p_task->>'type',
      status = task_status,
      lead_person_id = p_lead,
      due_at = due_at,
      completed_at = completed_at,
      result_summary = p_task->>'meta',
      completed_by = case when task_status = 'completed' then p_actor else null end,
      revision = existing.revision + 1
    where id = existing.id
    returning id, public.tasks.revision into saved_id, saved_revision;
  else
    insert into public.tasks (
      member_id, title, category, status, lead_person_id, due_at, completed_at,
      result_summary, source, source_reference, created_by, completed_by, revision
    ) values (
      p_member, p_task->>'member', p_task->>'type', task_status, p_lead, due_at,
      completed_at, p_task->>'meta', 'vice-chair-work-plan', p_task->>'id',
      p_actor, case when task_status = 'completed' then p_actor else null end, 1
    ) returning id, public.tasks.revision into saved_id, saved_revision;
  end if;

  delete from public.task_assignments where public.task_assignments.task_id = saved_id;
  insert into public.task_assignments(task_id, person_id, role)
  values (saved_id, p_lead, 'lead');
  foreach companion_id in array coalesce(p_companions, array[]::uuid[]) loop
    insert into public.task_assignments(task_id, person_id, role)
    values (saved_id, companion_id, 'companion');
  end loop;

  insert into public.task_private_details(task_id, details, updated_by)
  values (saved_id, jsonb_build_object('notes', coalesce(p_task->>'notes', ''))::text, p_actor)
  on conflict on constraint task_private_details_pkey do update set
    details = excluded.details,
    updated_by = excluded.updated_by;

  return query select saved_id, saved_revision;
end;
$$;

revoke all on function public.edge_save_task(jsonb, uuid, uuid, uuid[], uuid, bigint, boolean)
  from public, anon, authenticated;
grant execute on function public.edge_save_task(jsonb, uuid, uuid, uuid[], uuid, bigint, boolean)
  to service_role;
