-- 讓副主席可選擇「正式 LINE OA 送達」或「複製後人工貼送」開放系統投票。
-- 人工複製只保存操作人、時間與投票截止版本，不冒充 LINE 平台送達。

create or replace function public.edge_mark_task_vote_notice_copied(
  p_task_id uuid,
  p_actor uuid,
  p_actor_auth_user_id uuid,
  p_expected_revision bigint,
  p_deadline timestamptz,
  p_copied_at timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role;
  actor_name text;
  taipei_today date := (now() at time zone 'Asia/Taipei')::date;
  target_task public.tasks%rowtype;
  target_state public.task_case_states%rowtype;
  target_snapshot public.vote_snapshots%rowtype;
  next_workflow jsonb;
  next_log jsonb;
  event_item jsonb;
begin
  select aa.role into actor_role
  from public.app_accounts aa
  where aa.auth_user_id = p_actor_auth_user_id
    and aa.enabled;
  if actor_role is null or actor_role not in ('admin', 'vp') then
    raise exception '只有副主席或 Admin 可複製投票通知並開放系統投票';
  end if;

  if actor_role = 'vp' and not exists (
    select 1
    from public.committee_terms ct
    join public.people p on p.id = ct.person_id
    where ct.person_id = p_actor
      and ct.role = 'vp'
      and ct.status = 'active'
      and ct.starts_on <= taipei_today
      and (ct.ends_on is null or ct.ends_on >= taipei_today)
      and p.status = 'active'
  ) then
    raise exception '登入人員不具當期副主席角色';
  end if;

  if actor_role = 'admin' and not exists (
    select 1 from public.people p
    where p.id = p_actor
      and p.display_name = '系統開發人員 Admin'
      and p.status = 'active'
  ) then
    raise exception 'Admin 操作人員不正確';
  end if;

  select p.display_name into actor_name
  from public.people p
  where p.id = p_actor
    and p.status = 'active';
  if nullif(btrim(actor_name), '') is null then
    raise exception '找不到有效的操作人員';
  end if;

  select * into target_task
  from public.tasks
  where id = p_task_id
  for update;
  if target_task.id is null or target_task.category not in ('renewal', 'new', 'industry') then
    raise exception '此案件不適用投票通知';
  end if;
  if target_task.case_id is null then
    raise exception '本案尚未建立正式投票案件';
  end if;

  select * into target_snapshot
  from public.vote_snapshots
  where case_id = target_task.case_id
  for update;
  if target_snapshot.id is null
     or target_snapshot.status <> 'open'
     or target_snapshot.deadline_at is null
     or target_snapshot.deadline_at <> p_deadline then
    raise exception '投票截止時間已在其他裝置更新，請重新整理後確認';
  end if;
  if now() >= target_snapshot.deadline_at then
    raise exception '投票期限已截止，請先更新截止時間';
  end if;

  select * into target_state
  from public.task_case_states
  where task_id = p_task_id
  for update;
  if target_state.task_id is null
     or coalesce(target_state.workflow->>'votingOpen', 'false') <> 'true'
     or coalesce(target_state.workflow->>'closed', 'false') = 'true' then
    raise exception '投票尚未開啟或案件已結案';
  end if;
  if p_expected_revision is null or p_expected_revision <> target_state.revision then
    raise exception using message = 'CASE_CONFLICT';
  end if;

  if coalesce(target_state.workflow->>'voteNoticeSent', 'false') = 'true'
     or nullif(btrim(coalesce(target_state.workflow->>'voteNoticeCopiedAt', '')), '') is not null then
    return target_state.revision;
  end if;

  event_item := jsonb_build_object(
    'text', format('%s 已複製投票通知，系統投票已開放（需人工貼至委員群）', left(btrim(actor_name), 200)),
    'time', to_char(p_copied_at at time zone 'Asia/Taipei', 'YYYY/MM/DD HH24:MI'),
    'done', true
  );
  select coalesce(jsonb_agg(item order by ord), '[]'::jsonb)
  into next_log
  from (
    select item, ord
    from jsonb_array_elements(
      jsonb_build_array(event_item) || coalesce(target_state.workflow->'log', '[]'::jsonb)
    ) with ordinality as entries(item, ord)
    where ord <= 20
  ) limited;

  next_workflow := jsonb_set(target_state.workflow, '{voteNoticeCopiedAt}', to_jsonb(p_copied_at::text), true);
  next_workflow := jsonb_set(next_workflow, '{voteNoticeCopiedBy}', to_jsonb(left(btrim(actor_name), 200)), true);
  next_workflow := jsonb_set(next_workflow, '{voteNoticeCopiedDeadline}', to_jsonb(p_deadline::text), true);
  next_workflow := jsonb_set(next_workflow, '{log}', next_log, true);

  update public.task_case_states
  set workflow = next_workflow,
      revision = target_state.revision + 1,
      updated_by = p_actor
  where task_id = p_task_id;

  insert into public.case_events(case_id, event_type, actor_person_id, details)
  values (
    target_task.case_id,
    'vote_notice_copied',
    p_actor,
    jsonb_build_object(
      'deadlineAt', p_deadline,
      'copiedAt', p_copied_at,
      'actorAuthUserId', p_actor_auth_user_id,
      'requiresManualLinePaste', true
    )
  );

  return target_state.revision + 1;
end;
$$;

revoke all on function public.edge_mark_task_vote_notice_copied(uuid, uuid, uuid, bigint, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.edge_mark_task_vote_notice_copied(uuid, uuid, uuid, bigint, timestamptz, timestamptz)
  to service_role;

comment on function public.edge_mark_task_vote_notice_copied(uuid, uuid, uuid, bigint, timestamptz, timestamptz) is
  '記錄副主席已複製投票通知並將人工貼送；不冒充 LINE OA 送達。';

create or replace function public.edge_cast_case_vote(
  p_task_id uuid,
  p_actor uuid,
  p_actor_auth_user_id uuid,
  p_choice public.vote_choice
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_task public.tasks%rowtype;
  target_state public.task_case_states%rowtype;
  snapshot public.vote_snapshots%rowtype;
  prior_choice public.vote_choice;
  legacy_choice text;
  vote_id uuid;
begin
  select * into target_task from public.tasks where id = p_task_id for update;
  if target_task.id is null then raise exception '找不到指定案件'; end if;
  select * into target_state from public.task_case_states where task_id = p_task_id;
  if coalesce(target_state.workflow->>'closed', 'false') = 'true' then
    raise exception '案件已結案，無法投票';
  end if;
  if coalesce(target_state.workflow->>'votingOpen', 'false') <> 'true'
     or (
       coalesce(target_state.workflow->>'voteNoticeSent', 'false') <> 'true'
       and nullif(btrim(coalesce(target_state.workflow->>'voteNoticeCopiedAt', '')), '') is null
     ) then
    raise exception '投票尚未開放或尚未通知';
  end if;
  if target_task.case_id is null then
    raise exception '本案尚未建立投票資格快照';
  end if;

  select * into snapshot
  from public.vote_snapshots
  where case_id = target_task.case_id
  for update;
  if snapshot.id is null or snapshot.status <> 'open' then
    raise exception '投票尚未開放或已關閉';
  end if;
  if snapshot.deadline_at is not null and now() > snapshot.deadline_at then
    raise exception '投票已截止';
  end if;
  if coalesce(target_state.workflow->>'voteNoticeSent', 'false') <> 'true'
     and (
       nullif(btrim(coalesce(target_state.workflow->>'voteNoticeCopiedDeadline', '')), '') is null
       or nullif(btrim(coalesce(target_state.workflow->>'voteNoticeCopiedDeadline', '')), '')::timestamptz <> snapshot.deadline_at
     ) then
    raise exception '投票截止時間已變更，請重新複製或發送通知';
  end if;
  if not exists (
    select 1 from public.vote_snapshot_voters
    where snapshot_id = snapshot.id
      and person_id = p_actor
      and not is_recused
  ) then
    raise exception '你不在本案投票資格快照中';
  end if;

  select choice into prior_choice
  from public.votes
  where snapshot_id = snapshot.id
    and voter_person_id = p_actor;
  legacy_choice := target_state.workflow->'votes'->>(
    select display_name from public.people where id = p_actor
  );
  if prior_choice is not null and prior_choice <> p_choice then
    raise exception '你已完成投票；既有票不得修改，如需更正請由 Admin 留存原因處理';
  end if;
  if prior_choice is not null then
    select id into vote_id
    from public.votes
    where snapshot_id = snapshot.id and voter_person_id = p_actor;
    return vote_id;
  end if;
  if legacy_choice is not null and legacy_choice not in ('approve', 'reject') then
    legacy_choice := null;
  end if;
  if legacy_choice is not null and legacy_choice <> p_choice::text then
    raise exception '你已完成投票；既有票不得修改，如需更正請由 Admin 留存原因處理';
  end if;

  insert into public.votes(
    snapshot_id, voter_person_id, choice, actor_auth_user_id, correction_reason
  ) values (
    snapshot.id,
    p_actor,
    p_choice,
    p_actor_auth_user_id,
    case when legacy_choice is not null
      then 'LEGACY_MIGRATION: voter reaffirmed existing choice'
      else null
    end
  )
  returning id into vote_id;

  insert into public.case_events(case_id, event_type, actor_person_id, details)
  values (target_task.case_id, 'vote.cast', p_actor, '{"source":"app-api"}'::jsonb);
  return vote_id;
end;
$$;

revoke all on function public.edge_cast_case_vote(uuid, uuid, uuid, public.vote_choice)
  from public, anon, authenticated;
grant execute on function public.edge_cast_case_vote(uuid, uuid, uuid, public.vote_choice)
  to service_role;

comment on function public.edge_cast_case_vote(uuid, uuid, uuid, public.vote_choice) is
  '只有正式 LINE OA 已送達，或副主席已複製通知並將人工貼送時，才允許快照內人員投票。';
