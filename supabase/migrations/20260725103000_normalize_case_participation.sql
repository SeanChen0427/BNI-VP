-- 多人同時回饋／投票安全化：
-- 1. 既有工作台 task 在需要時建立正式 cases 對照。
-- 2. 回饋與票分別使用 case_feedback／votes 的每人唯一資料列。
-- 3. 正式案件參與資料只允許 Edge Function 以已驗證姓名操作。

create or replace function public.edge_ensure_task_case(
  p_task_id uuid,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_task public.tasks%rowtype;
  saved_case_id uuid;
begin
  select * into target_task
  from public.tasks
  where id = p_task_id
  for update;

  if target_task.id is null then
    raise exception '找不到指定案件';
  end if;
  if target_task.category not in ('renewal', 'new', 'industry') then
    raise exception '此案件類型不適用委員回饋與投票';
  end if;
  if target_task.case_id is not null then
    return target_task.case_id;
  end if;

  insert into public.cases (
    case_number,
    type,
    title,
    member_id,
    applicant_name_snapshot,
    profession_snapshot,
    stage,
    lead_person_id,
    scheduled_at,
    due_at,
    completed_at,
    created_by,
    updated_by
  ) values (
    'TASK-' || target_task.id::text,
    target_task.category::public.case_type,
    target_task.title,
    target_task.member_id,
    target_task.title,
    '',
    case when target_task.status = 'completed'
      then 'closed'::public.case_stage
      else 'feedback'::public.case_stage
    end,
    target_task.lead_person_id,
    target_task.due_at,
    target_task.due_at,
    case when target_task.status = 'completed'
      then coalesce(target_task.completed_at, now())
      else null
    end,
    coalesce(target_task.created_by, p_actor),
    p_actor
  )
  on conflict (case_number) do update
    set updated_by = excluded.updated_by
  returning id into saved_case_id;

  update public.tasks
  set case_id = saved_case_id
  where id = target_task.id;

  return saved_case_id;
end;
$$;

revoke all on function public.edge_ensure_task_case(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.edge_ensure_task_case(uuid, uuid)
  to service_role;

create or replace function private.validate_vote_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot public.vote_snapshots%rowtype;
  recused boolean;
begin
  select * into snapshot from public.vote_snapshots where id = new.snapshot_id;
  if snapshot.id is null or snapshot.status <> 'open' then
    raise exception '投票尚未開放或已關閉';
  end if;
  if snapshot.deadline_at is not null and now() > snapshot.deadline_at then
    raise exception '投票已截止';
  end if;
  select v.is_recused into recused
  from public.vote_snapshot_voters v
  where v.snapshot_id = new.snapshot_id and v.person_id = new.voter_person_id;
  if recused is null or recused then
    raise exception '此人不具本案投票資格';
  end if;
  -- 瀏覽器直寫時以 auth.uid() 為準；Edge service_role 已在 request context
  -- 驗證共用帳號並明確帶入 actor_auth_user_id，不可覆寫成 null。
  if auth.uid() is not null then
    new.actor_auth_user_id := auth.uid();
  end if;
  return new;
end;
$$;

create or replace function private.prevent_open_voter_snapshot_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_snapshot_id uuid;
  target_status public.vote_status;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  target_snapshot_id := case when tg_op = 'DELETE' then old.snapshot_id else new.snapshot_id end;
  select s.status into target_status from public.vote_snapshots s where s.id = target_snapshot_id;
  if target_status <> 'draft' then
    raise exception '投票開啟後不得改寫資格快照';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- 共用 Auth 帳號無法僅靠 auth.uid() 區分所選姓名，因此禁止瀏覽器
-- 直接寫正式案件參與表，一律經 Edge Function 驗證 context.personId。
revoke all on public.cases, public.case_feedback, public.vote_snapshots,
  public.vote_snapshot_voters, public.votes, public.case_events
  from anon, authenticated;
grant select, insert, update, delete on public.cases, public.case_feedback,
  public.vote_snapshots, public.vote_snapshot_voters, public.votes,
  public.case_events
  to service_role;

comment on function public.edge_ensure_task_case(uuid, uuid) is
  '將既有工作台 task 以交易鎖安全對應到正式 cases；只供 app-api service role 呼叫。';
