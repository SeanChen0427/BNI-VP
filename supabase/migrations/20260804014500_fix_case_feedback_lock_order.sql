-- 正式結案必須先鎖定回饋，再把案件 stage 改為 closed。
-- 舊順序先關閉案件，導致 case_feedback 的完整性 trigger 拒絕後續鎖定，
-- PostgreSQL 因此回滾整筆結案交易。

create or replace function public.edge_save_case_state(
  p_task_id uuid,
  p_actor uuid,
  p_workflow jsonb,
  p_draft jsonb,
  p_expected_revision bigint,
  p_vote_deadline timestamptz default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_task public.tasks%rowtype;
  current_state public.task_case_states%rowtype;
  next_revision bigint;
  closing boolean;
begin
  select * into target_task
  from public.tasks
  where id = p_task_id
  for update;
  if target_task.id is null then
    raise exception '找不到指定案件';
  end if;

  select * into current_state
  from public.task_case_states
  where task_id = p_task_id
  for update;

  if current_state.task_id is null then
    if coalesce(p_expected_revision, 0) <> 0 then
      raise exception using message = 'CASE_CONFLICT';
    end if;
    insert into public.task_case_states(task_id, workflow, draft, revision, updated_by)
    values (
      p_task_id,
      coalesce(p_workflow, '{}'::jsonb),
      coalesce(p_draft, '{}'::jsonb),
      1,
      p_actor
    )
    returning revision into next_revision;
  else
    if p_expected_revision is null or p_expected_revision <> current_state.revision then
      raise exception using message = 'CASE_CONFLICT';
    end if;
    update public.task_case_states
    set workflow = coalesce(p_workflow, '{}'::jsonb),
        draft = coalesce(p_draft, '{}'::jsonb),
        revision = current_state.revision + 1,
        updated_by = p_actor
    where task_id = p_task_id
    returning revision into next_revision;
  end if;

  if target_task.case_id is not null and p_vote_deadline is not null then
    update public.vote_snapshots
    set deadline_at = p_vote_deadline
    where case_id = target_task.case_id
      and status = 'open';
  end if;

  closing := coalesce(p_workflow->>'closed', 'false') = 'true';
  if closing then
    if target_task.case_id is not null then
      -- case_feedback trigger 會禁止 closed 案件再更新，因此鎖定必須先完成。
      update public.case_feedback
      set locked_at = coalesce(locked_at, now())
      where case_id = target_task.case_id;

      update public.cases
      set stage = 'closed',
          completed_at = coalesce(completed_at, now()),
          updated_by = p_actor
      where id = target_task.case_id;

      update public.vote_snapshots
      set status = 'closed',
          closed_at = coalesce(closed_at, now())
      where case_id = target_task.case_id
        and status = 'open';
    end if;

    if target_task.status <> 'completed' then
      update public.tasks
      set status = 'completed',
          completed_at = now(),
          completed_by = p_actor,
          revision = revision + 1
      where id = p_task_id;
    end if;
  end if;

  return next_revision;
end;
$$;

comment on function public.edge_save_case_state(uuid, uuid, jsonb, jsonb, bigint, timestamptz) is
  '交易式保存案件狀態；結案時先鎖定回饋，再關閉案件、投票快照與任務。';
