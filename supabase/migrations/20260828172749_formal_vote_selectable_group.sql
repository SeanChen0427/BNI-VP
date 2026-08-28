-- 正式案件可選擇委員會測試群或正式群作為圖卡發布位置。
-- 群組環境只決定 Bot 在哪個群回覆；呼喚仍是正式案件且只寫入正式 votes。

do $$
declare
  constraint_item record;
begin
  for constraint_item in
    select conname
    from pg_constraint
    where conrelid = 'public.case_vote_calls'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%is_test%'
      and pg_get_constraintdef(oid) like '%environment%'
      and pg_get_constraintdef(oid) like '%task_id%'
  loop
    execute format(
      'alter table public.case_vote_calls drop constraint %I',
      constraint_item.conname
    );
  end loop;
end;
$$;

alter table public.case_vote_calls
  drop constraint if exists case_vote_calls_formal_destination_check;

alter table public.case_vote_calls
  add constraint case_vote_calls_formal_destination_check
  check (
    not is_test
    and environment in ('test', 'production')
    and task_id is not null
    and case_id is not null
    and snapshot_id is not null
  );

comment on constraint case_vote_calls_formal_destination_check
  on public.case_vote_calls is
  '正式案件呼喚可發布至委員會測試群或正式群；兩者都只寫入正式投票快照。';

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
  target_environment_label text;
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
    and purpose in ('test', 'production') and oa_channel = 'committee';
  if target_group.id is null then raise exception '會員委員會群設定已變更'; end if;
  target_environment_label := case when target_group.purpose = 'test' then '測試群' else '正式群' end;

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
    target_group.id, target_group.purpose, false, target_task.category::public.case_type,
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
    'text', format('%s 已建立正式投票呼喚，等待貼到委員會%s', left(btrim(actor_name), 200), target_environment_label),
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
    'voteCallEnvironment', target_group.purpose,
    'voteCallDeadline', p_deadline::text,
    'log', jsonb_build_array(event_item) || coalesce(target_state.workflow->'log', '[]'::jsonb)
  );

  update public.task_case_states
  set workflow = next_workflow, revision = target_state.revision + 1, updated_by = p_actor
  where task_id = p_task_id;

  insert into public.case_events(case_id, event_type, actor_person_id, details)
  values (target_task.case_id, 'vote_call.created', p_actor,
    jsonb_build_object(
      'callId', p_call_id,
      'deadlineAt', p_deadline,
      'groupTargetId', target_group.id,
      'environment', target_group.purpose
    ));
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
