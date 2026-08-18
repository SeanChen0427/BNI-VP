-- Send each case's feedback-open notice once to the confirmed production
-- committee LINE group. The table keeps delivery evidence, not message text.

create table public.case_feedback_line_deliveries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete restrict,
  group_target_id uuid not null references public.line_group_targets(id) on delete restrict,
  notification_type text not null default 'feedback_open'
    check (notification_type = 'feedback_open'),
  message_sha256 text not null check (message_sha256 ~ '^[0-9a-f]{64}$'),
  retry_key uuid not null default gen_random_uuid() unique,
  status text not null default 'processing'
    check (status in ('processing', 'sent', 'failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  requested_by uuid not null references public.people(id) on delete restrict,
  requested_by_auth_user_id uuid not null,
  requested_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  line_request_id text,
  line_message_id text,
  error_code text,
  error_message text check (error_message is null or length(error_message) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, notification_type),
  check (
    (status = 'processing' and sent_at is null and failed_at is null)
    or (status = 'sent' and sent_at is not null and failed_at is null)
    or (status = 'failed' and sent_at is null and failed_at is not null)
  )
);

create index case_feedback_line_deliveries_task_idx
  on public.case_feedback_line_deliveries (task_id, requested_at desc);

comment on table public.case_feedback_line_deliveries is
  '正式會員委員會群的案件回饋通知稽核；不保存 LINE Token、群組聊天內容或完整通知文案。';

alter table public.case_feedback_line_deliveries enable row level security;
revoke all on table public.case_feedback_line_deliveries from public, anon, authenticated;
grant select, insert, update on table public.case_feedback_line_deliveries to service_role;

create trigger case_feedback_line_deliveries_set_updated_at
before update on public.case_feedback_line_deliveries
for each row execute function private.set_updated_at();

create trigger case_feedback_line_deliveries_audit
after insert or update or delete on public.case_feedback_line_deliveries
for each row execute function private.audit_row_change();

create or replace function public.edge_mark_task_feedback_notice_sent(
  p_task_id uuid,
  p_actor uuid,
  p_actor_auth_user_id uuid,
  p_delivery_id uuid,
  p_target_name text,
  p_sent_at timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role;
  taipei_today date := (now() at time zone 'Asia/Taipei')::date;
  target_task public.tasks%rowtype;
  target_state public.task_case_states%rowtype;
  target_delivery public.case_feedback_line_deliveries%rowtype;
  target_group public.line_group_targets%rowtype;
  next_workflow jsonb;
  next_log jsonb;
  event_item jsonb;
begin
  select aa.role into actor_role
  from public.app_accounts aa
  where aa.auth_user_id = p_actor_auth_user_id
    and aa.enabled;
  if actor_role is null or actor_role not in ('admin', 'vp') then
    raise exception '只有副主席或 Admin 可發送委員回饋通知';
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

  select * into target_task
  from public.tasks
  where id = p_task_id
  for update;
  if target_task.id is null or target_task.category not in ('renewal', 'new', 'industry') then
    raise exception '此案件不適用委員回饋通知';
  end if;
  if target_task.case_id is null then
    raise exception '本案尚未建立正式案件';
  end if;

  select * into target_delivery
  from public.case_feedback_line_deliveries
  where id = p_delivery_id
  for update;
  if target_delivery.id is null
     or target_delivery.task_id <> p_task_id
     or target_delivery.status <> 'sent' then
    raise exception 'LINE 委員回饋通知尚未確認送達';
  end if;

  select * into target_group
  from public.line_group_targets
  where id = target_delivery.group_target_id
  for update;
  if target_group.id is null
     or target_group.status <> 'active'
     or target_group.route_key <> 'committee'
     or target_group.purpose <> 'production' then
    raise exception 'LINE 會員委員會正式群指定已變更，請重新整理後確認';
  end if;

  select * into target_state
  from public.task_case_states
  where task_id = p_task_id
  for update;
  if target_state.task_id is null
     or coalesce(target_state.workflow->>'wordSaved', 'false') <> 'true'
     or coalesce(target_state.workflow->>'closed', 'false') = 'true' then
    raise exception '訪談 Word 尚未保存或案件已結案';
  end if;

  if coalesce(target_state.workflow->>'feedbackNotified', 'false') = 'true' then
    return target_state.revision;
  end if;

  event_item := jsonb_build_object(
    'text', format('委員回饋通知已由正式 LINE OA 發送至「%s」', left(btrim(p_target_name), 200)),
    'time', to_char(p_sent_at at time zone 'Asia/Taipei', 'YYYY/MM/DD HH24:MI'),
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

  next_workflow := jsonb_set(target_state.workflow, '{feedbackNotified}', 'true'::jsonb, true);
  next_workflow := jsonb_set(next_workflow, '{feedbackNoticeSentAt}', to_jsonb(p_sent_at::text), true);
  next_workflow := jsonb_set(next_workflow, '{feedbackNoticeTargetName}', to_jsonb(left(btrim(p_target_name), 200)), true);
  next_workflow := jsonb_set(next_workflow, '{feedbackNoticeDeliveryId}', to_jsonb(p_delivery_id::text), true);
  next_workflow := jsonb_set(next_workflow, '{log}', next_log, true);

  update public.task_case_states
  set workflow = next_workflow,
      revision = target_state.revision + 1,
      updated_by = p_actor
  where task_id = p_task_id;

  insert into public.case_events(case_id, event_type, actor_person_id, details)
  values (
    target_task.case_id,
    'line_feedback_notice_sent',
    p_actor,
    jsonb_build_object(
      'deliveryId', p_delivery_id,
      'targetName', left(btrim(p_target_name), 200),
      'actorAuthUserId', p_actor_auth_user_id
    )
  );

  return target_state.revision + 1;
end;
$$;

revoke all on function public.edge_mark_task_feedback_notice_sent(uuid, uuid, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.edge_mark_task_feedback_notice_sent(uuid, uuid, uuid, uuid, text, timestamptz)
  to service_role;

comment on function public.edge_mark_task_feedback_notice_sent(uuid, uuid, uuid, uuid, text, timestamptz) is
  '重新驗證正式登入角色、正式會員委員會群、LINE 送達紀錄與案件狀態後，才將案件標記為已通知回饋。';
