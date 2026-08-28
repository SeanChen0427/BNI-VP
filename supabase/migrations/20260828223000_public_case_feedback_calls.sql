-- 委員回饋改為「副主席貼完整呼喚 → LINE Bot Reply 圖卡 → 免登入填寫」。
-- 呼喚只保存 Token／完整文案雜湊；回饋仍寫入既有正式 case_feedback。

create table public.case_feedback_calls (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  group_target_id uuid not null references public.line_group_targets(id) on delete restrict,
  environment text not null check (environment in ('test', 'production')),
  case_type public.case_type not null check (case_type in ('renewal', 'new', 'industry')),
  applicant_snapshot text not null check (length(btrim(applicant_snapshot)) between 1 and 200),
  profession_snapshot text not null check (length(btrim(profession_snapshot)) between 1 and 300),
  interview_date date not null,
  lead_interviewer_snapshot text not null check (length(btrim(lead_interviewer_snapshot)) between 1 and 200),
  companion_interviewer_snapshot text not null check (length(btrim(companion_interviewer_snapshot)) between 1 and 200),
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  message_sha256 text not null check (message_sha256 ~ '^[0-9a-f]{64}$'),
  message_format text not null default 'case-feedback-reply-card-v1',
  status text not null default 'awaiting_reply'
    check (status in ('awaiting_reply', 'replying', 'replied', 'reply_failed', 'revoked')),
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
  updated_at timestamptz not null default now()
);

create index case_feedback_calls_target_status_idx
  on public.case_feedback_calls (group_target_id, status, created_at desc);
create index case_feedback_calls_case_idx
  on public.case_feedback_calls (case_id, created_at desc);
create unique index case_feedback_calls_one_live_task
  on public.case_feedback_calls (task_id)
  where status in ('awaiting_reply', 'replying', 'replied', 'reply_failed');

create table public.case_feedback_call_responders (
  call_id uuid not null references public.case_feedback_calls(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete restrict,
  display_name_snapshot text not null check (length(btrim(display_name_snapshot)) between 1 and 200),
  role public.committee_role not null,
  primary key (call_id, person_id)
);

alter table public.case_feedback_calls enable row level security;
alter table public.case_feedback_call_responders enable row level security;
revoke all on table public.case_feedback_calls, public.case_feedback_call_responders
  from public, anon, authenticated;
grant select, insert, update, delete on table public.case_feedback_calls,
  public.case_feedback_call_responders to service_role;

create trigger case_feedback_calls_set_updated_at
before update on public.case_feedback_calls
for each row execute function private.set_updated_at();

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
  next_workflow jsonb;
  event_item jsonb;
  responder_count integer;
  target_environment_label text;
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
  if exists (
    select 1 from public.case_feedback_calls
    where task_id = p_task_id and status = 'replied'
  ) then raise exception '本案回饋圖卡已開放，不可重建連結'; end if;

  select * into target_group
  from public.line_group_targets
  where id = p_group_target_id and status = 'active' and route_key = 'committee'
    and purpose in ('test', 'production') and oa_channel = 'committee';
  if target_group.id is null then raise exception '會員委員會群設定已變更'; end if;
  target_environment_label := case when target_group.purpose = 'test' then '測試群' else '正式群' end;

  update public.case_feedback_calls
  set status = 'revoked', error_message = '由副主席重新產生回饋呼喚'
  where task_id = p_task_id and status in ('awaiting_reply', 'reply_failed');

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
    -- 新申請尚未建立 person 關聯時，以案件鎖定姓名作第二層迴避保護。
    and btrim(people.display_name) <> btrim(target_task.title);
  get diagnostics responder_count = row_count;
  if responder_count = 0 then raise exception '目前沒有可回饋的在任委員'; end if;

  event_item := jsonb_build_object(
    'text', format('%s 已建立免登入回饋呼喚，等待貼到委員會%s', left(btrim(actor_name), 200), target_environment_label),
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
  values (target_task.case_id, 'feedback_call.created', p_actor,
    jsonb_build_object(
      'callId', p_call_id,
      'groupTargetId', target_group.id,
      'environment', target_group.purpose
    ));
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

create or replace function public.edge_save_public_case_feedback(
  p_call_id uuid,
  p_author_person_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_call public.case_feedback_calls%rowtype;
  target_state public.task_case_states%rowtype;
  existing_feedback public.case_feedback%rowtype;
  feedback_id uuid;
  normalized_body text := btrim(coalesce(p_body, ''));
begin
  if length(normalized_body) < 1 or length(normalized_body) > 5000 then
    raise exception '回饋內容須為 1 至 5,000 字';
  end if;
  select * into target_call
  from public.case_feedback_calls where id = p_call_id for update;
  if target_call.id is null then raise exception '找不到這份回饋表'; end if;
  if target_call.status <> 'replied' then raise exception '回饋圖卡尚未由 Bot 開放'; end if;
  if not exists (
    select 1 from public.case_feedback_call_responders
    where call_id = target_call.id and person_id = p_author_person_id
  ) then raise exception '這個姓名不在本案回饋名單中'; end if;

  select * into target_state
  from public.task_case_states where task_id = target_call.task_id;
  if coalesce(target_state.workflow->>'closed', 'false') = 'true' then
    raise exception '案件已結案，無法再提交回饋';
  end if;

  select * into existing_feedback
  from public.case_feedback
  where case_id = target_call.case_id and author_person_id = p_author_person_id
  for update;
  if existing_feedback.id is not null
     and existing_feedback.submitted_by_person_id = p_author_person_id then
    if existing_feedback.body = normalized_body then return existing_feedback.id; end if;
    raise exception '這個姓名已完成回饋；如需更正請聯絡副主席';
  end if;

  insert into public.case_feedback(
    case_id, author_person_id, submitted_by_person_id, body, updated_at
  ) values (
    target_call.case_id, p_author_person_id, p_author_person_id, normalized_body, now()
  )
  on conflict (case_id, author_person_id) do update
    set body = excluded.body,
        submitted_by_person_id = excluded.submitted_by_person_id,
        updated_at = excluded.updated_at
    where public.case_feedback.locked_at is null
  returning id into feedback_id;
  if feedback_id is null then raise exception '案件回饋已鎖定，無法修改'; end if;

  insert into public.case_events(case_id, event_type, actor_person_id, details)
  values (target_call.case_id, 'feedback.saved', p_author_person_id,
    jsonb_build_object(
      'source', 'line_public',
      'callId', target_call.id,
      'author_person_id', p_author_person_id,
      'submission_mode', 'self'
    ));
  return feedback_id;
end;
$$;

revoke all on function public.edge_save_public_case_feedback(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.edge_save_public_case_feedback(uuid, uuid, text)
  to service_role;

create or replace function private.revoke_stale_case_feedback_calls()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.workflow->>'wordSaved', 'false') <> 'true'
     or coalesce(new.workflow->>'closed', 'false') = 'true' then
    update public.case_feedback_calls
    set status = 'revoked', error_message = '案件已重設或結案'
    where task_id = new.task_id
      and status in ('awaiting_reply', 'replying', 'replied', 'reply_failed');
  end if;
  return new;
end;
$$;

create trigger task_case_states_revoke_stale_feedback_calls
after update of workflow on public.task_case_states
for each row execute function private.revoke_stale_case_feedback_calls();

comment on table public.case_feedback_calls is
  'LINE 回饋呼喚的一次性精準比對資料；只保存 Token 與完整文案雜湊，不保存群組聊天內容。';
comment on table public.case_feedback_call_responders is
  '回饋圖卡建立時的有效委員快照；公開頁以不可逆別名選人。';
comment on function public.edge_save_public_case_feedback(uuid, uuid, text) is
  '把免登入回饋寫入既有正式 case_feedback；本人回饋不可由公開頁覆蓋，副主席代填可由本人取代。';
