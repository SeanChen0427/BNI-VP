-- 案件正式操作交易化與舊投票補遷移：
-- 1. 開票、案件狀態、結案、重設與任務完成改為單一資料庫交易。
-- 2. 回饋／投票與 case_events 同步成功或同步失敗。
-- 3. 舊 task_case_states.workflow.votes 補入正式 votes，避免畫面與正式票數不一致。

create or replace function private.validate_vote_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot public.vote_snapshots%rowtype;
  recused boolean;
  legacy_migration boolean;
begin
  select * into snapshot from public.vote_snapshots where id = new.snapshot_id;
  legacy_migration :=
    current_user in ('postgres', 'service_role', 'supabase_admin')
    and coalesce(new.correction_reason, '') like 'LEGACY_MIGRATION:%';
  if snapshot.id is null or (snapshot.status <> 'open' and not legacy_migration) then
    raise exception '投票尚未開放或已關閉';
  end if;
  if snapshot.deadline_at is not null and now() > snapshot.deadline_at and not legacy_migration then
    raise exception '投票已截止';
  end if;
  select v.is_recused into recused
  from public.vote_snapshot_voters v
  where v.snapshot_id = new.snapshot_id and v.person_id = new.voter_person_id;
  if recused is null or recused then
    raise exception '此人不具本案投票資格';
  end if;
  if auth.uid() is not null then
    new.actor_auth_user_id := auth.uid();
  end if;
  return new;
end;
$$;

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
      update public.cases
      set stage = 'closed',
          completed_at = coalesce(completed_at, now()),
          updated_by = p_actor
      where id = target_task.case_id;

      update public.case_feedback
      set locked_at = coalesce(locked_at, now())
      where case_id = target_task.case_id;

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

create or replace function public.edge_open_task_vote(
  p_task_id uuid,
  p_actor uuid,
  p_actor_auth_user_id uuid,
  p_workflow jsonb,
  p_expected_revision bigint,
  p_deadline timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_task public.tasks%rowtype;
  current_state public.task_case_states%rowtype;
  current_workflow jsonb;
  next_workflow jsonb;
  case_id_value uuid;
  snapshot public.vote_snapshots%rowtype;
  original_count integer;
  eligible_count integer;
  feedback_count integer;
  threshold integer;
  next_revision bigint;
  taipei_today date;
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

  select * into current_state
  from public.task_case_states
  where task_id = p_task_id
  for update;
  if current_state.task_id is null then
    if coalesce(p_expected_revision, 0) <> 0 then
      raise exception using message = 'CASE_CONFLICT';
    end if;
    current_workflow := '{}'::jsonb;
  else
    if p_expected_revision is null or p_expected_revision <> current_state.revision then
      raise exception using message = 'CASE_CONFLICT';
    end if;
    current_workflow := coalesce(current_state.workflow, '{}'::jsonb);
  end if;

  case_id_value := public.edge_ensure_task_case(p_task_id, p_actor);
  taipei_today := (now() at time zone 'Asia/Taipei')::date;

  select * into snapshot
  from public.vote_snapshots
  where case_id = case_id_value
  for update;

  if snapshot.id is not null and snapshot.status in ('closed', 'decided', 'cancelled') then
    raise exception '本案投票已關閉，無法重新開票';
  end if;
  if snapshot.id is not null and snapshot.status = 'draft' then
    delete from public.vote_snapshot_voters where snapshot_id = snapshot.id;
    delete from public.vote_snapshots where id = snapshot.id;
    snapshot := null;
  end if;

  if snapshot.id is null then
    select
      count(*),
      count(*) filter (where btrim(p.display_name) <> btrim(target_task.title))
    into original_count, eligible_count
    from public.committee_terms ct
    join public.people p on p.id = ct.person_id
    where ct.status = 'active'
      and ct.has_voting_right
      and ct.starts_on <= taipei_today
      and (ct.ends_on is null or ct.ends_on >= taipei_today)
      and p.status = 'active';

    select count(*)
    into feedback_count
    from public.committee_terms ct
    join public.people p on p.id = ct.person_id
    where ct.status = 'active'
      and ct.has_voting_right
      and ct.starts_on <= taipei_today
      and (ct.ends_on is null or ct.ends_on >= taipei_today)
      and p.status = 'active'
      and btrim(p.display_name) <> btrim(target_task.title)
      and (
        exists (
          select 1 from public.case_feedback cf
          where cf.case_id = case_id_value
            and cf.author_person_id = p.id
            and btrim(cf.body) <> ''
        )
        or btrim(coalesce(current_workflow->'feedback'->>p.display_name, '')) <> ''
      );

    threshold := (eligible_count / 2) + 1;
    if feedback_count < threshold then
      raise exception '回饋尚未達門檻，目前 % 份、至少需要 % 份', feedback_count, threshold;
    end if;

    insert into public.vote_snapshots(
      case_id, status, deadline_at, original_base, eligible_base
    ) values (
      case_id_value, 'draft', p_deadline, original_count, eligible_count
    )
    returning * into snapshot;

    insert into public.vote_snapshot_voters(
      snapshot_id, person_id, role, term_id, is_recused, recusal_reason
    )
    select
      snapshot.id,
      ct.person_id,
      ct.role,
      ct.id,
      btrim(p.display_name) = btrim(target_task.title),
      case when btrim(p.display_name) = btrim(target_task.title)
        then '申請者本人強制迴避'
        else null
      end
    from public.committee_terms ct
    join public.people p on p.id = ct.person_id
    where ct.status = 'active'
      and ct.has_voting_right
      and ct.starts_on <= taipei_today
      and (ct.ends_on is null or ct.ends_on >= taipei_today)
      and p.status = 'active'
    order by ct.created_at;

    update public.vote_snapshots
    set status = 'open',
        opened_at = now()
    where id = snapshot.id;

    update public.cases
    set stage = 'vote',
        updated_by = p_actor
    where id = case_id_value;

    insert into public.case_events(case_id, event_type, actor_person_id, details)
    values (
      case_id_value,
      'vote.opened',
      p_actor,
      jsonb_build_object('eligibleBase', eligible_count, 'deadlineAt', p_deadline)
    );
  else
    update public.vote_snapshots
    set deadline_at = p_deadline
    where id = snapshot.id;
  end if;

  insert into public.votes(
    snapshot_id, voter_person_id, choice, actor_auth_user_id, correction_reason
  )
  select
    snapshot.id,
    v.person_id,
    (current_workflow->'votes'->>p.display_name)::public.vote_choice,
    p_actor_auth_user_id,
    'LEGACY_MIGRATION: task_case_states.workflow'
  from public.vote_snapshot_voters v
  join public.people p on p.id = v.person_id
  where v.snapshot_id = snapshot.id
    and not v.is_recused
    and current_workflow->'votes'->>p.display_name in ('approve', 'reject')
  on conflict (snapshot_id, voter_person_id) do nothing;

  next_workflow := coalesce(p_workflow, '{}'::jsonb)
    || jsonb_build_object(
      'votingOpen', true,
      'feedback', coalesce(current_workflow->'feedback', '{}'::jsonb),
      'votes', coalesce(current_workflow->'votes', '{}'::jsonb),
      'voterSnapshot', coalesce(current_workflow->'voterSnapshot', '[]'::jsonb)
    );

  if current_state.task_id is null then
    insert into public.task_case_states(task_id, workflow, draft, revision, updated_by)
    values (p_task_id, next_workflow, '{}'::jsonb, 1, p_actor)
    returning revision into next_revision;
  else
    update public.task_case_states
    set workflow = next_workflow,
        revision = current_state.revision + 1,
        updated_by = p_actor
    where task_id = p_task_id
    returning revision into next_revision;
  end if;

  return next_revision;
end;
$$;

create or replace function public.edge_reset_task_case(
  p_task_id uuid,
  p_actor uuid,
  p_expected_revision bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_task public.tasks%rowtype;
  current_state public.task_case_states%rowtype;
  snapshot_id_value uuid;
  next_revision bigint;
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
  if current_state.task_id is not null
     and (p_expected_revision is null or p_expected_revision <> current_state.revision) then
    raise exception using message = 'CASE_CONFLICT';
  end if;
  if current_state.task_id is null and coalesce(p_expected_revision, 0) <> 0 then
    raise exception using message = 'CASE_CONFLICT';
  end if;

  if target_task.case_id is not null then
    for snapshot_id_value in
      select id from public.vote_snapshots where case_id = target_task.case_id
    loop
      delete from public.votes where snapshot_id = snapshot_id_value;
      delete from public.vote_snapshot_voters where snapshot_id = snapshot_id_value;
      delete from public.vote_snapshots where id = snapshot_id_value;
    end loop;
    delete from public.case_feedback where case_id = target_task.case_id;
    delete from public.case_events where case_id = target_task.case_id;
    delete from public.advisor_confirmations where case_id = target_task.case_id;
    update public.cases
    set stage = 'feedback',
        completed_at = null,
        reopened_at = now(),
        updated_by = p_actor
    where id = target_task.case_id;
  end if;

  if target_task.status = 'completed' then
    update public.tasks
    set status = 'pending',
        completed_at = null,
        completed_by = null,
        revision = revision + 1
    where id = p_task_id;
  end if;

  if current_state.task_id is null then
    insert into public.task_case_states(task_id, workflow, draft, revision, updated_by)
    values (p_task_id, '{}'::jsonb, '{}'::jsonb, 1, p_actor)
    returning revision into next_revision;
  else
    update public.task_case_states
    set workflow = '{}'::jsonb,
        revision = current_state.revision + 1,
        updated_by = p_actor
    where task_id = p_task_id
    returning revision into next_revision;
  end if;
  return next_revision;
end;
$$;

create or replace function public.edge_save_case_feedback(
  p_task_id uuid,
  p_actor uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_task public.tasks%rowtype;
  target_state public.task_case_states%rowtype;
  case_id_value uuid;
  feedback_id uuid;
begin
  select * into target_task from public.tasks where id = p_task_id for update;
  if target_task.id is null then raise exception '找不到指定案件'; end if;
  select * into target_state from public.task_case_states where task_id = p_task_id;
  if coalesce(target_state.workflow->>'closed', 'false') = 'true' then
    raise exception '案件已結案，無法修改回饋';
  end if;
  case_id_value := public.edge_ensure_task_case(p_task_id, p_actor);
  if exists (select 1 from public.cases where id = case_id_value and stage = 'closed') then
    raise exception '案件已結案，無法修改回饋';
  end if;

  insert into public.case_feedback(case_id, author_person_id, body, updated_at)
  values (case_id_value, p_actor, p_body, now())
  on conflict (case_id, author_person_id) do update
    set body = excluded.body,
        updated_at = excluded.updated_at
    where public.case_feedback.locked_at is null
  returning id into feedback_id;
  if feedback_id is null then
    raise exception '案件回饋已鎖定，無法修改';
  end if;

  insert into public.case_events(case_id, event_type, actor_person_id, details)
  values (case_id_value, 'feedback.saved', p_actor, '{"source":"app-api"}'::jsonb);
  return feedback_id;
end;
$$;

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
     or coalesce(target_state.workflow->>'voteNoticeSent', 'false') <> 'true' then
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

create or replace function public.edge_delete_task(
  p_source_reference text,
  p_expected_revision bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.tasks%rowtype;
  snapshot_id_value uuid;
begin
  select * into existing
  from public.tasks
  where source = 'vice-chair-work-plan'
    and source_reference = p_source_reference
  for update;
  if existing.id is null then return null; end if;
  if p_expected_revision is null or p_expected_revision <> existing.revision then
    raise exception using message = 'TASK_CONFLICT';
  end if;

  if existing.case_id is not null then
    for snapshot_id_value in
      select id from public.vote_snapshots where case_id = existing.case_id
    loop
      delete from public.votes where snapshot_id = snapshot_id_value;
      delete from public.vote_snapshot_voters where snapshot_id = snapshot_id_value;
      delete from public.vote_snapshots where id = snapshot_id_value;
    end loop;
    delete from public.advisor_confirmations where case_id = existing.case_id;
    delete from public.cases where id = existing.case_id;
  else
    delete from public.tasks where id = existing.id;
  end if;
  return existing.id;
end;
$$;

-- 已有正式快照的舊 JSON 票，依當時資格快照與共用角色帳號補入正式 votes。
insert into public.votes(
  snapshot_id, voter_person_id, choice, actor_auth_user_id, correction_reason
)
select
  vs.id,
  vsv.person_id,
  (tcs.workflow->'votes'->>p.display_name)::public.vote_choice,
  account.auth_user_id,
  'LEGACY_MIGRATION: 20260725150000'
from public.task_case_states tcs
join public.tasks t on t.id = tcs.task_id
join public.vote_snapshots vs on vs.case_id = t.case_id
join public.vote_snapshot_voters vsv on vsv.snapshot_id = vs.id and not vsv.is_recused
join public.people p on p.id = vsv.person_id
join lateral (
  select aa.auth_user_id
  from public.app_accounts aa
  where aa.role::text = vsv.role::text
    and aa.enabled
  order by aa.created_at
  limit 1
) account on true
where tcs.workflow->'votes'->>p.display_name in ('approve', 'reject')
on conflict (snapshot_id, voter_person_id) do nothing;

revoke all on function public.edge_save_case_state(uuid, uuid, jsonb, jsonb, bigint, timestamptz)
  from public, anon, authenticated;
revoke all on function public.edge_open_task_vote(uuid, uuid, uuid, jsonb, bigint, timestamptz)
  from public, anon, authenticated;
revoke all on function public.edge_reset_task_case(uuid, uuid, bigint)
  from public, anon, authenticated;
revoke all on function public.edge_save_case_feedback(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.edge_cast_case_vote(uuid, uuid, uuid, public.vote_choice)
  from public, anon, authenticated;
revoke all on function public.edge_delete_task(text, bigint)
  from public, anon, authenticated;

grant execute on function public.edge_save_case_state(uuid, uuid, jsonb, jsonb, bigint, timestamptz)
  to service_role;
grant execute on function public.edge_open_task_vote(uuid, uuid, uuid, jsonb, bigint, timestamptz)
  to service_role;
grant execute on function public.edge_reset_task_case(uuid, uuid, bigint)
  to service_role;
grant execute on function public.edge_save_case_feedback(uuid, uuid, text)
  to service_role;
grant execute on function public.edge_cast_case_vote(uuid, uuid, uuid, public.vote_choice)
  to service_role;
grant execute on function public.edge_delete_task(text, bigint)
  to service_role;

comment on function public.edge_open_task_vote(uuid, uuid, uuid, jsonb, bigint, timestamptz) is
  '交易式建立投票資格快照、補遷移舊票並保存案件流程。';
comment on function public.edge_save_case_state(uuid, uuid, jsonb, jsonb, bigint, timestamptz) is
  '交易式保存案件狀態、截止時間、正式結案與任務完成。';
