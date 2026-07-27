-- 修正 edge_save_task 更新既有任務時，PL/pgSQL 區域變數與 tasks 欄位同名。
-- 所有區域變數改用 v_ 前綴，並完整限定 RETURNING 欄位，避免後續再出現同類歧義。

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
  v_existing public.tasks%rowtype;
  v_saved_id uuid;
  v_saved_revision bigint;
  v_task_status public.task_status;
  v_completed_at timestamptz;
  v_due_at timestamptz;
  v_companion_id uuid;
begin
  select * into v_existing
  from public.tasks
  where source = 'vice-chair-work-plan'
    and source_reference = p_task->>'id'
  for update;

  v_task_status := case when coalesce((p_task->>'completed')::boolean, false)
    then 'completed'::public.task_status else 'pending'::public.task_status end;
  v_completed_at := case when v_task_status = 'completed'
    then coalesce(nullif(p_task->>'completedAt', '')::timestamptz, now()) else null end;
  v_due_at := nullif(p_task->>'dueAt', '')::timestamptz;

  if v_existing.id is not null then
    if not p_import and (p_expected_revision is null or p_expected_revision <> v_existing.revision) then
      raise exception using message = 'TASK_CONFLICT';
    end if;
    if p_import then
      return query select v_existing.id, v_existing.revision;
      return;
    end if;
    update public.tasks set
      member_id = p_member,
      title = p_task->>'member',
      category = p_task->>'type',
      status = v_task_status,
      lead_person_id = p_lead,
      due_at = v_due_at,
      completed_at = v_completed_at,
      result_summary = p_task->>'meta',
      completed_by = case when v_task_status = 'completed' then p_actor else null end,
      revision = v_existing.revision + 1
    where public.tasks.id = v_existing.id
    returning public.tasks.id, public.tasks.revision into v_saved_id, v_saved_revision;
  else
    insert into public.tasks (
      member_id, title, category, status, lead_person_id, due_at, completed_at,
      result_summary, source, source_reference, created_by, completed_by, revision
    ) values (
      p_member, p_task->>'member', p_task->>'type', v_task_status, p_lead, v_due_at,
      v_completed_at, p_task->>'meta', 'vice-chair-work-plan', p_task->>'id',
      p_actor, case when v_task_status = 'completed' then p_actor else null end, 1
    ) returning public.tasks.id, public.tasks.revision into v_saved_id, v_saved_revision;
  end if;

  delete from public.task_assignments where public.task_assignments.task_id = v_saved_id;
  insert into public.task_assignments(task_id, person_id, role)
  values (v_saved_id, p_lead, 'lead');
  foreach v_companion_id in array coalesce(p_companions, array[]::uuid[]) loop
    insert into public.task_assignments(task_id, person_id, role)
    values (v_saved_id, v_companion_id, 'companion');
  end loop;

  insert into public.task_private_details(task_id, details, updated_by)
  values (v_saved_id, jsonb_build_object('notes', coalesce(p_task->>'notes', ''))::text, p_actor)
  on conflict on constraint task_private_details_pkey do update set
    details = excluded.details,
    updated_by = excluded.updated_by;

  return query select v_saved_id, v_saved_revision;
end;
$$;

revoke all on function public.edge_save_task(jsonb, uuid, uuid, uuid[], uuid, bigint, boolean)
  from public, anon, authenticated;
grant execute on function public.edge_save_task(jsonb, uuid, uuid, uuid[], uuid, bigint, boolean)
  to service_role;
