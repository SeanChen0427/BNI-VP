-- LINE 委員投票改為「副主席貼上完整呼喚 → Webhook 精準比對 → Reply 圖卡」。
-- 原始投票 Token 不進資料庫，只保存 SHA-256；公開投票仍沿用正式資格快照的一人一票。

drop index if exists public.line_group_targets_one_active_route;
create unique index line_group_targets_one_active_route_environment
  on public.line_group_targets (route_key, purpose)
  where status = 'active';

create table public.case_vote_calls (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  snapshot_id uuid references public.vote_snapshots(id) on delete cascade,
  group_target_id uuid not null references public.line_group_targets(id) on delete restrict,
  environment text not null check (environment in ('test', 'production')),
  is_test boolean not null default false,
  case_type public.case_type not null check (case_type in ('renewal', 'new', 'industry')),
  applicant_snapshot text not null check (length(btrim(applicant_snapshot)) between 1 and 200),
  profession_snapshot text not null check (length(btrim(profession_snapshot)) between 1 and 300),
  deadline_at timestamptz not null,
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  message_sha256 text not null check (message_sha256 ~ '^[0-9a-f]{64}$'),
  message_format text not null default 'case-vote-reply-card-v1',
  status text not null default 'awaiting_reply'
    check (status in ('preparing', 'awaiting_reply', 'replying', 'replied', 'reply_failed', 'revoked', 'expired')),
  created_by uuid not null references public.people(id) on delete restrict,
  created_by_auth_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  copied_at timestamptz,
  replied_at timestamptz,
  failed_at timestamptz,
  webhook_event_id text unique,
  line_message_id text,
  line_request_id text,
  error_message text,
  updated_at timestamptz not null default now(),
  check (deadline_at > created_at),
  check (
    (is_test and environment = 'test' and task_id is null and case_id is null and snapshot_id is null)
    or
    (not is_test and environment = 'production' and task_id is not null and case_id is not null and snapshot_id is not null)
  )
);

create index case_vote_calls_target_status_idx
  on public.case_vote_calls (group_target_id, status, created_at desc);
create index case_vote_calls_case_idx
  on public.case_vote_calls (case_id, created_at desc)
  where not is_test;
create unique index case_vote_calls_one_live_formal_snapshot
  on public.case_vote_calls (snapshot_id)
  where not is_test and status in ('preparing', 'awaiting_reply', 'replying', 'replied', 'reply_failed');

create table public.case_vote_call_voters (
  call_id uuid not null references public.case_vote_calls(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete restrict,
  display_name_snapshot text not null check (length(btrim(display_name_snapshot)) between 1 and 200),
  role public.committee_role not null,
  is_recused boolean not null default false,
  primary key (call_id, person_id)
);

create table public.case_vote_test_votes (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.case_vote_calls(id) on delete cascade,
  voter_person_id uuid not null references public.people(id) on delete restrict,
  choice public.vote_choice not null,
  cast_at timestamptz not null default now(),
  unique (call_id, voter_person_id),
  foreign key (call_id, voter_person_id)
    references public.case_vote_call_voters(call_id, person_id) on delete cascade
);

alter table public.votes
  alter column actor_auth_user_id drop not null,
  add column cast_source text not null default 'authenticated'
    check (cast_source in ('authenticated', 'line_public')),
  add column public_vote_call_id uuid references public.case_vote_calls(id) on delete restrict;

alter table public.votes
  add constraint votes_actor_source_check check (
    (cast_source = 'authenticated' and actor_auth_user_id is not null and public_vote_call_id is null)
    or
    (cast_source = 'line_public' and actor_auth_user_id is null and public_vote_call_id is not null)
  );

create table public.storage_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  source_reference text,
  deleted_task_id uuid,
  bucket_id text not null,
  object_path text not null,
  status text not null default 'pending' check (status in ('pending', 'deleted', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  attempted_at timestamptz,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (bucket_id, object_path)
);

alter table public.case_vote_calls enable row level security;
alter table public.case_vote_call_voters enable row level security;
alter table public.case_vote_test_votes enable row level security;
alter table public.storage_deletion_jobs enable row level security;

revoke all on table public.case_vote_calls, public.case_vote_call_voters,
  public.case_vote_test_votes, public.storage_deletion_jobs
  from public, anon, authenticated;
grant select, insert, update, delete on table public.case_vote_calls,
  public.case_vote_call_voters, public.case_vote_test_votes,
  public.storage_deletion_jobs to service_role;

drop trigger if exists case_vote_calls_set_updated_at on public.case_vote_calls;
create trigger case_vote_calls_set_updated_at
before update on public.case_vote_calls
for each row execute function private.set_updated_at();

drop trigger if exists storage_deletion_jobs_set_updated_at on public.storage_deletion_jobs;
create trigger storage_deletion_jobs_set_updated_at
before update on public.storage_deletion_jobs
for each row execute function private.set_updated_at();

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
  if new.cast_source = 'line_public' then
    if current_user not in ('postgres', 'service_role', 'supabase_admin')
       or new.public_vote_call_id is null then
      raise exception '公開投票來源不正確';
    end if;
    new.actor_auth_user_id := null;
  elsif auth.uid() is not null then
    new.actor_auth_user_id := auth.uid();
  end if;
  return new;
end;
$$;

create or replace function public.edge_prepare_case_vote_call(
  p_call_id uuid,
  p_task_id uuid,
  p_actor uuid,
  p_actor_auth_user_id uuid,
  p_expected_revision bigint,
  p_snapshot_id uuid,
  p_group_target_id uuid,
  p_token_sha256 text,
  p_message_sha256 text,
  p_deadline timestamptz,
  p_applicant text,
  p_profession text,
  p_copied_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role;
  actor_name text;
  target_task public.tasks%rowtype;
  target_state public.task_case_states%rowtype;
  target_snapshot public.vote_snapshots%rowtype;
  target_group public.line_group_targets%rowtype;
  next_workflow jsonb;
  event_item jsonb;
begin
  select aa.role into actor_role
  from public.app_accounts aa
  where aa.auth_user_id = p_actor_auth_user_id and aa.enabled;
  if actor_role is null or actor_role not in ('admin', 'vp') then
    raise exception '只有副主席或 Admin 可啟動投票流程';
  end if;
  select display_name into actor_name from public.people where id = p_actor and status = 'active';
  if nullif(btrim(actor_name), '') is null then raise exception '找不到有效的操作人員'; end if;

  select * into target_task from public.tasks where id = p_task_id for update;
  if target_task.id is null or target_task.category not in ('renewal', 'new', 'industry') then
    raise exception '此案件不適用投票呼喚';
  end if;
  if target_task.case_id is null then raise exception '本案尚未建立正式投票案件'; end if;

  select * into target_state from public.task_case_states where task_id = p_task_id for update;
  if target_state.task_id is null
     or coalesce(target_state.workflow->>'votingOpen', 'false') <> 'true'
     or coalesce(target_state.workflow->>'closed', 'false') = 'true' then
    raise exception '投票尚未開啟或案件已結案';
  end if;
  if p_expected_revision is null or p_expected_revision <> target_state.revision then
    raise exception using message = 'CASE_CONFLICT';
  end if;

  select * into target_snapshot
  from public.vote_snapshots where id = p_snapshot_id and case_id = target_task.case_id for update;
  if target_snapshot.id is null or target_snapshot.status <> 'open'
     or target_snapshot.deadline_at is null or target_snapshot.deadline_at <> p_deadline then
    raise exception '投票截止時間已在其他裝置更新，請重新整理後確認';
  end if;
  if now() >= target_snapshot.deadline_at then raise exception '投票期限已截止'; end if;
  if exists (select 1 from public.votes where snapshot_id = target_snapshot.id) then
    raise exception '本案已有投票紀錄，不能重新產生投票連結';
  end if;

  select * into target_group
  from public.line_group_targets
  where id = p_group_target_id and status = 'active' and route_key = 'committee'
    and purpose = 'production' and oa_channel = 'committee';
  if target_group.id is null then raise exception '會員委員會正式群設定已變更'; end if;

  update public.case_vote_calls
  set status = 'revoked', error_message = '由副主席重新產生投票呼喚'
  where snapshot_id = target_snapshot.id
    and status in ('preparing', 'awaiting_reply', 'replying', 'replied', 'reply_failed');

  insert into public.case_vote_calls(
    id, task_id, case_id, snapshot_id, group_target_id, environment, is_test,
    case_type, applicant_snapshot, profession_snapshot, deadline_at,
    token_sha256, message_sha256, status, created_by,
    created_by_auth_user_id, copied_at
  ) values (
    p_call_id, target_task.id, target_task.case_id, target_snapshot.id,
    target_group.id, 'production', false, target_task.category::public.case_type,
    left(btrim(p_applicant), 200), left(btrim(p_profession), 300), p_deadline,
    p_token_sha256, p_message_sha256, 'awaiting_reply', p_actor,
    p_actor_auth_user_id, p_copied_at
  );

  insert into public.case_vote_call_voters(
    call_id, person_id, display_name_snapshot, role, is_recused
  )
  select p_call_id, voters.person_id, people.display_name, voters.role, voters.is_recused
  from public.vote_snapshot_voters voters
  join public.people people on people.id = voters.person_id
  where voters.snapshot_id = target_snapshot.id;

  event_item := jsonb_build_object(
    'text', format('%s 已建立投票呼喚，等待貼到委員會正式群', left(btrim(actor_name), 200)),
    'time', to_char(p_copied_at at time zone 'Asia/Taipei', 'YYYY/MM/DD HH24:MI'),
    'done', true
  );
  next_workflow := target_state.workflow
    - 'voteNoticeSent' - 'voteNoticeSentAt' - 'voteNoticeTargetName'
    - 'voteNoticeDeliveryId' - 'voteNoticeCopiedAt' - 'voteNoticeCopiedBy'
    - 'voteNoticeCopiedDeadline';
  next_workflow := next_workflow || jsonb_build_object(
    'voteCallId', p_call_id::text,
    'voteCallStatus', 'awaiting_reply',
    'voteCallCreatedAt', p_copied_at::text,
    'voteCallTargetName', target_group.display_name,
    'voteCallDeadline', p_deadline::text,
    'log', jsonb_build_array(event_item) || coalesce(target_state.workflow->'log', '[]'::jsonb)
  );

  update public.task_case_states
  set workflow = next_workflow, revision = target_state.revision + 1, updated_by = p_actor
  where task_id = p_task_id;

  insert into public.case_events(case_id, event_type, actor_person_id, details)
  values (target_task.case_id, 'vote_call.created', p_actor,
    jsonb_build_object('callId', p_call_id, 'deadlineAt', p_deadline, 'groupTargetId', target_group.id));
  return p_call_id;
end;
$$;

revoke all on function public.edge_prepare_case_vote_call(
  uuid, uuid, uuid, uuid, bigint, uuid, uuid, text, text,
  timestamptz, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.edge_prepare_case_vote_call(
  uuid, uuid, uuid, uuid, bigint, uuid, uuid, text, text,
  timestamptz, text, text, timestamptz
) to service_role;

create or replace function public.edge_cast_public_case_vote(
  p_call_id uuid,
  p_voter_person_id uuid,
  p_choice public.vote_choice
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_call public.case_vote_calls%rowtype;
  target_snapshot public.vote_snapshots%rowtype;
  existing_vote public.votes%rowtype;
  vote_id uuid;
begin
  select * into target_call from public.case_vote_calls where id = p_call_id for update;
  if target_call.id is null or target_call.is_test then raise exception '找不到這份正式投票'; end if;
  if target_call.status <> 'replied' then raise exception '投票圖卡尚未由 Bot 開放'; end if;
  if now() >= target_call.deadline_at then
    update public.case_vote_calls set status = 'expired' where id = target_call.id;
    raise exception '投票已截止';
  end if;
  select * into target_snapshot from public.vote_snapshots where id = target_call.snapshot_id for update;
  if target_snapshot.id is null or target_snapshot.status <> 'open'
     or target_snapshot.deadline_at <> target_call.deadline_at then
    raise exception '本案投票狀態已更新，請聯絡副主席';
  end if;
  if not exists (
    select 1 from public.case_vote_call_voters
    where call_id = target_call.id and person_id = p_voter_person_id and not is_recused
  ) then raise exception '你不在本案投票資格名單中'; end if;

  select * into existing_vote from public.votes
  where snapshot_id = target_snapshot.id and voter_person_id = p_voter_person_id;
  if existing_vote.id is not null then
    if existing_vote.choice <> p_choice then
      raise exception '這個姓名已完成投票；如需更正請聯絡 Admin';
    end if;
    return existing_vote.id;
  end if;

  insert into public.votes(
    snapshot_id, voter_person_id, choice, actor_auth_user_id,
    cast_source, public_vote_call_id
  ) values (
    target_snapshot.id, p_voter_person_id, p_choice, null,
    'line_public', target_call.id
  ) returning id into vote_id;

  insert into public.case_events(case_id, event_type, actor_person_id, details)
  values (target_call.case_id, 'vote.cast', p_voter_person_id,
    jsonb_build_object('source', 'line_public', 'callId', target_call.id));
  return vote_id;
end;
$$;

revoke all on function public.edge_cast_public_case_vote(uuid, uuid, public.vote_choice)
  from public, anon, authenticated;
grant execute on function public.edge_cast_public_case_vote(uuid, uuid, public.vote_choice)
  to service_role;

-- 登入版投票與免登入圖卡共用同一份正式 votes；新版呼喚必須等 Bot Reply 成功。
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
  reply_call_ready boolean := false;
begin
  select * into target_task from public.tasks where id = p_task_id for update;
  if target_task.id is null then raise exception '找不到指定案件'; end if;
  select * into target_state from public.task_case_states where task_id = p_task_id;
  if coalesce(target_state.workflow->>'closed', 'false') = 'true' then
    raise exception '案件已結案，無法投票';
  end if;
  if target_task.case_id is null then raise exception '本案尚未建立投票資格快照'; end if;
  select * into snapshot
  from public.vote_snapshots where case_id = target_task.case_id for update;
  if snapshot.id is null or snapshot.status <> 'open' then raise exception '投票尚未開放或已關閉'; end if;
  if snapshot.deadline_at is not null and now() > snapshot.deadline_at then raise exception '投票已截止'; end if;

  select exists (
    select 1 from public.case_vote_calls calls
    where calls.snapshot_id = snapshot.id
      and not calls.is_test
      and calls.status = 'replied'
      and calls.deadline_at = snapshot.deadline_at
  ) into reply_call_ready;
  if coalesce(target_state.workflow->>'votingOpen', 'false') <> 'true'
     or (
       coalesce(target_state.workflow->>'voteNoticeSent', 'false') <> 'true'
       and nullif(btrim(coalesce(target_state.workflow->>'voteNoticeCopiedAt', '')), '') is null
       and not reply_call_ready
     ) then
    raise exception '投票尚未開放或尚未由 Bot 回覆圖卡';
  end if;
  if not reply_call_ready
     and coalesce(target_state.workflow->>'voteNoticeSent', 'false') <> 'true'
     and (
       nullif(btrim(coalesce(target_state.workflow->>'voteNoticeCopiedDeadline', '')), '') is null
       or nullif(btrim(coalesce(target_state.workflow->>'voteNoticeCopiedDeadline', '')), '')::timestamptz <> snapshot.deadline_at
     ) then
    raise exception '投票截止時間已變更，請重新啟動投票流程';
  end if;
  if not exists (
    select 1 from public.vote_snapshot_voters
    where snapshot_id = snapshot.id and person_id = p_actor and not is_recused
  ) then raise exception '你不在本案投票資格快照中'; end if;

  select choice into prior_choice from public.votes
  where snapshot_id = snapshot.id and voter_person_id = p_actor;
  legacy_choice := target_state.workflow->'votes'->>(
    select display_name from public.people where id = p_actor
  );
  if prior_choice is not null and prior_choice <> p_choice then
    raise exception '你已完成投票；既有票不得修改，如需更正請由 Admin 留存原因處理';
  end if;
  if prior_choice is not null then
    select id into vote_id from public.votes
    where snapshot_id = snapshot.id and voter_person_id = p_actor;
    return vote_id;
  end if;
  if legacy_choice is not null and legacy_choice not in ('approve', 'reject') then legacy_choice := null; end if;
  if legacy_choice is not null and legacy_choice <> p_choice::text then
    raise exception '你已完成投票；既有票不得修改，如需更正請由 Admin 留存原因處理';
  end if;

  insert into public.votes(
    snapshot_id, voter_person_id, choice, actor_auth_user_id, correction_reason,
    cast_source, public_vote_call_id
  ) values (
    snapshot.id, p_actor, p_choice, p_actor_auth_user_id,
    case when legacy_choice is not null then 'LEGACY_MIGRATION: voter reaffirmed existing choice' else null end,
    'authenticated', null
  ) returning id into vote_id;
  insert into public.case_events(case_id, event_type, actor_person_id, details)
  values (target_task.case_id, 'vote.cast', p_actor, '{"source":"app-api"}'::jsonb);
  return vote_id;
end;
$$;

revoke all on function public.edge_cast_case_vote(uuid, uuid, uuid, public.vote_choice)
  from public, anon, authenticated;
grant execute on function public.edge_cast_case_vote(uuid, uuid, uuid, public.vote_choice)
  to service_role;

create or replace function public.edge_cast_test_case_vote(
  p_call_id uuid,
  p_voter_person_id uuid,
  p_choice public.vote_choice
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_call public.case_vote_calls%rowtype;
  existing_vote public.case_vote_test_votes%rowtype;
  vote_id uuid;
begin
  select * into target_call from public.case_vote_calls where id = p_call_id for update;
  if target_call.id is null or not target_call.is_test then raise exception '找不到這份測試投票'; end if;
  if target_call.status <> 'replied' then raise exception '測試圖卡尚未由 Bot 開放'; end if;
  if now() >= target_call.deadline_at then
    update public.case_vote_calls set status = 'expired' where id = target_call.id;
    raise exception '測試投票已截止';
  end if;
  if not exists (
    select 1 from public.case_vote_call_voters
    where call_id = target_call.id and person_id = p_voter_person_id and not is_recused
  ) then raise exception '這個姓名不在測試投票名單中'; end if;

  select * into existing_vote from public.case_vote_test_votes
  where call_id = target_call.id and voter_person_id = p_voter_person_id;
  if existing_vote.id is not null then
    if existing_vote.choice <> p_choice then raise exception '這個姓名已完成測試投票'; end if;
    return existing_vote.id;
  end if;
  insert into public.case_vote_test_votes(call_id, voter_person_id, choice)
  values (target_call.id, p_voter_person_id, p_choice)
  returning id into vote_id;
  return vote_id;
end;
$$;

revoke all on function public.edge_cast_test_case_vote(uuid, uuid, public.vote_choice)
  from public, anon, authenticated;
grant execute on function public.edge_cast_test_case_vote(uuid, uuid, public.vote_choice)
  to service_role;

create or replace function private.revoke_stale_case_vote_calls()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'open' or new.deadline_at is distinct from old.deadline_at then
    update public.case_vote_calls
    set status = 'revoked', error_message = '正式投票快照狀態或截止時間已變更'
    where snapshot_id = new.id
      and status in ('preparing', 'awaiting_reply', 'replying', 'replied', 'reply_failed');
  end if;
  return new;
end;
$$;

drop trigger if exists vote_snapshots_revoke_stale_calls on public.vote_snapshots;
create trigger vote_snapshots_revoke_stale_calls
after update of status, deadline_at on public.vote_snapshots
for each row execute function private.revoke_stale_case_vote_calls();

comment on table public.case_vote_calls is
  'LINE 投票呼喚的一次性精準比對資料；只保存 Token 與完整文案雜湊，不保存群組聊天內容。';
comment on table public.case_vote_test_votes is
  '設定頁獨立測試器票數；不關聯正式案件、正式快照或正式 votes。';
comment on table public.storage_deletion_jobs is
  '案件刪除後的 Storage 物件清理結果；失敗會保留待重試，不再靜默忽略。';
