-- 測試群圖卡驗收後，允許同一正式案件單向改發正式群一次。
-- 舊測試連結會撤銷；既有 case_feedback／votes 不刪除、不改寫。

create or replace function public.edge_prepare_case_feedback_call(
  p_call_id uuid,
  p_task_id uuid,
  p_actor uuid,
  p_actor_auth_user_id uuid,
  p_expected_revision bigint,
  p_group_target_id uuid,
  p_token_sha256 text,
  p_message_sha256 text,
  p_applicant text,
  p_profession text,
  p_interview_date date,
  p_lead_interviewer text,
  p_companion_interviewer text,
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
  target_group public.line_group_targets%rowtype;
  replied_call public.case_feedback_calls%rowtype;
  next_workflow jsonb;
  event_item jsonb;
  responder_count integer;
  target_environment_label text;
  promoting_to_production boolean := false;
begin
  select aa.role into actor_role
  from public.app_accounts aa
  where aa.auth_user_id = p_actor_auth_user_id and aa.enabled;
  if actor_role is null or actor_role not in ('admin', 'vp') then
    raise exception '只有副主席或 Admin 可啟動回饋流程';
  end if;
  select display_name into actor_name
  from public.people where id = p_actor and status = 'active';
  if nullif(btrim(actor_name), '') is null then raise exception '找不到有效的操作人員'; end if;

  select * into target_task from public.tasks where id = p_task_id for update;
  if target_task.id is null or target_task.category not in ('renewal', 'new', 'industry') then
    raise exception '此案件不適用委員回饋呼喚';
  end if;
  if target_task.case_id is null then raise exception '本案尚未建立正式案件'; end if;

  select * into target_state
  from public.task_case_states where task_id = p_task_id for update;
  if target_state.task_id is null
     or coalesce(target_state.workflow->>'wordSaved', 'false') <> 'true'
     or coalesce(target_state.workflow->>'closed', 'false') = 'true' then
    raise exception '請先保存訪談 Word，且案件必須尚未結案';
  end if;
  if p_expected_revision is null or p_expected_revision <> target_state.revision then
    raise exception using message = 'CASE_CONFLICT';
  end if;

  if exists (
    select 1 from public.case_feedback_calls
    where task_id = p_task_id and status = 'replying'
  ) then raise exception 'Bot 正在回覆回饋圖卡，請稍候重新整理'; end if;

  select * into target_group
  from public.line_group_targets
  where id = p_group_target_id and status = 'active' and route_key = 'committee'
    and purpose in ('test', 'production') and oa_channel = 'committee';
  if target_group.id is null then raise exception '會員委員會群設定已變更'; end if;
  target_environment_label := case when target_group.purpose = 'test' then '測試群' else '正式群' end;

  select * into replied_call
  from public.case_feedback_calls
  where task_id = p_task_id and status = 'replied'
  order by created_at desc
  limit 1
  for update;
  if replied_call.id is not null then
    promoting_to_production := replied_call.environment = 'test'
      and target_group.purpose = 'production';
    if not promoting_to_production then
      raise exception '本案回饋圖卡已正式開放，不可重建連結';
    end if;
  end if;

  update public.case_feedback_calls
  set status = 'revoked',
      error_message = case
        when promoting_to_production then '測試群驗收完成，已改發正式群'
        else '由副主席重新產生回饋呼喚'
      end
  where task_id = p_task_id
    and status in ('awaiting_reply', 'reply_failed', 'replied');

  insert into public.case_feedback_calls(
    id, task_id, case_id, group_target_id, environment, case_type,
    applicant_snapshot, profession_snapshot, interview_date,
    lead_interviewer_snapshot, companion_interviewer_snapshot,
    token_sha256, message_sha256, status, created_by,
    created_by_auth_user_id, copied_at
  ) values (
    p_call_id, target_task.id, target_task.case_id, target_group.id,
    target_group.purpose, target_task.category::public.case_type,
    left(btrim(p_applicant), 200), left(btrim(p_profession), 300), p_interview_date,
    left(btrim(p_lead_interviewer), 200), left(btrim(p_companion_interviewer), 200),
    p_token_sha256, p_message_sha256, 'awaiting_reply', p_actor,
    p_actor_auth_user_id, p_copied_at
  );

  insert into public.case_feedback_call_responders(
    call_id, person_id, display_name_snapshot, role
  )
  select p_call_id, terms.person_id, people.display_name, terms.role
  from public.committee_terms terms
  join public.people people on people.id = terms.person_id
  where terms.status = 'active'
    and terms.has_voting_right
    and terms.starts_on <= (now() at time zone 'Asia/Taipei')::date
    and (terms.ends_on is null or terms.ends_on >= (now() at time zone 'Asia/Taipei')::date)
    and people.status = 'active'
    and not exists (
      select 1
      from public.members applicant
      where applicant.id = target_task.member_id
        and applicant.person_id = terms.person_id
    )
    and btrim(people.display_name) <> btrim(target_task.title);
  get diagnostics responder_count = row_count;
  if responder_count = 0 then raise exception '目前沒有可回饋的在任委員'; end if;

  event_item := jsonb_build_object(
    'text', case
      when promoting_to_production then format('%s 已將測試群回饋圖卡改發正式群，既有回饋保留', left(btrim(actor_name), 200))
      else format('%s 已建立免登入回饋呼喚，等待貼到委員會%s', left(btrim(actor_name), 200), target_environment_label)
    end,
    'time', to_char(p_copied_at at time zone 'Asia/Taipei', 'YYYY/MM/DD HH24:MI'),
    'done', true
  );
  next_workflow := target_state.workflow || jsonb_build_object(
    'feedbackCallId', p_call_id::text,
    'feedbackCallStatus', 'awaiting_reply',
    'feedbackCallCreatedAt', p_copied_at::text,
    'feedbackCallTargetName', target_group.display_name,
    'feedbackCallEnvironment', target_group.purpose,
    'log', jsonb_build_array(event_item) || coalesce(target_state.workflow->'log', '[]'::jsonb)
  );

  update public.task_case_states
  set workflow = next_workflow, revision = target_state.revision + 1, updated_by = p_actor
  where task_id = p_task_id;

  insert into public.case_events(case_id, event_type, actor_person_id, details)
  values (
    target_task.case_id,
    case when promoting_to_production then 'feedback_call.promoted' else 'feedback_call.created' end,
    p_actor,
    jsonb_build_object(
      'callId', p_call_id,
      'replacedCallId', case when promoting_to_production then replied_call.id else null end,
      'groupTargetId', target_group.id,
      'environment', target_group.purpose
    )
  );
  return p_call_id;
end;
$$;

revoke all on function public.edge_prepare_case_feedback_call(
  uuid, uuid, uuid, uuid, bigint, uuid, text, text, text, text,
  date, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.edge_prepare_case_feedback_call(
  uuid, uuid, uuid, uuid, bigint, uuid, text, text, text, text,
  date, text, text, timestamptz
) to service_role;

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
  replied_call public.case_vote_calls%rowtype;
  next_workflow jsonb;
  event_item jsonb;
  target_environment_label text;
  promoting_to_production boolean := false;
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

  select * into target_group
  from public.line_group_targets
  where id = p_group_target_id and status = 'active' and route_key = 'committee'
    and purpose in ('test', 'production') and oa_channel = 'committee';
  if target_group.id is null then raise exception '會員委員會群設定已變更'; end if;
  target_environment_label := case when target_group.purpose = 'test' then '測試群' else '正式群' end;

  select * into replied_call
  from public.case_vote_calls
  where snapshot_id = target_snapshot.id and not is_test and status = 'replied'
  order by created_at desc
  limit 1
  for update;
  if replied_call.id is not null then
    promoting_to_production := replied_call.environment = 'test'
      and target_group.purpose = 'production';
    if not promoting_to_production then
      raise exception '本案投票圖卡已正式開放，不可重建連結';
    end if;
  end if;
  if not promoting_to_production
     and exists (select 1 from public.votes where snapshot_id = target_snapshot.id) then
    raise exception '本案已有投票紀錄，不能重新產生投票連結';
  end if;

  update public.case_vote_calls
  set status = 'revoked',
      error_message = case
        when promoting_to_production then '測試群驗收完成，已改發正式群'
        else '由副主席重新產生投票呼喚'
      end
  where snapshot_id = target_snapshot.id
    and not is_test
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
    'text', case
      when promoting_to_production then format('%s 已將測試群投票圖卡改發正式群，既有正式票保留', left(btrim(actor_name), 200))
      else format('%s 已建立正式投票呼喚，等待貼到委員會%s', left(btrim(actor_name), 200), target_environment_label)
    end,
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
  values (
    target_task.case_id,
    case when promoting_to_production then 'vote_call.promoted' else 'vote_call.created' end,
    p_actor,
    jsonb_build_object(
      'callId', p_call_id,
      'replacedCallId', case when promoting_to_production then replied_call.id else null end,
      'deadlineAt', p_deadline,
      'groupTargetId', target_group.id,
      'environment', target_group.purpose
    )
  );
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

comment on function public.edge_prepare_case_feedback_call(
  uuid, uuid, uuid, uuid, bigint, uuid, text, text, text, text,
  date, text, text, timestamptz
) is '建立正式回饋呼喚；測試群已回覆時只允許單向改發正式群，並保留既有回饋。';

comment on function public.edge_prepare_case_vote_call(
  uuid, uuid, uuid, uuid, bigint, uuid, uuid, text, text,
  timestamptz, text, text, timestamptz
) is '建立正式投票呼喚；測試群已回覆時只允許單向改發正式群，並保留既有正式票。';
