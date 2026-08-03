-- 副主席可依會員委員提供的 LINE 內容代填案件回饋。
-- 回饋仍歸屬原委員，submitted_by_person_id 永久保存實際操作人。
-- 投票不適用代理操作。

alter table public.case_feedback
  add column if not exists submitted_by_person_id uuid references public.people(id) on delete restrict;

update public.case_feedback
set submitted_by_person_id = author_person_id
where submitted_by_person_id is null;

alter table public.case_feedback
  alter column submitted_by_person_id set not null;

comment on column public.case_feedback.author_person_id is
  '回饋歸屬的副主席或會員委員；副主席代填時仍記錄原委員。';
comment on column public.case_feedback.submitted_by_person_id is
  '實際執行保存的人員；與 author_person_id 不同時代表副主席代填。';

create or replace function public.edge_save_case_feedback(
  p_task_id uuid,
  p_actor uuid,
  p_body text,
  p_author uuid
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
  target_author uuid := coalesce(p_author, p_actor);
  taipei_today date := (now() at time zone 'Asia/Taipei')::date;
  existing_feedback public.case_feedback%rowtype;
begin
  select * into target_task from public.tasks where id = p_task_id for update;
  if target_task.id is null then raise exception '找不到指定案件'; end if;
  if nullif(btrim(p_body), '') is null then raise exception '請先填寫回饋內容'; end if;

  select * into target_state from public.task_case_states where task_id = p_task_id;
  if coalesce(target_state.workflow->>'closed', 'false') = 'true' then
    raise exception '案件已結案，無法修改回饋';
  end if;

  if target_author <> p_actor then
    if not exists (
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
      raise exception '只有現任副主席可以代填委員回饋';
    end if;
    if not exists (
      select 1
      from public.committee_terms ct
      join public.people p on p.id = ct.person_id
      where ct.person_id = target_author
        and ct.role = 'committee'
        and ct.status = 'active'
        and ct.has_voting_right
        and ct.starts_on <= taipei_today
        and (ct.ends_on is null or ct.ends_on >= taipei_today)
        and p.status = 'active'
    ) then
      raise exception '只能代填現任會員委員的回饋';
    end if;
  end if;

  if exists (
    select 1
    from public.members m
    where m.id = target_task.member_id
      and m.person_id = target_author
  ) then
    raise exception '申請者本人須迴避，不得提交本案回饋';
  end if;

  case_id_value := public.edge_ensure_task_case(p_task_id, p_actor);
  if exists (select 1 from public.cases where id = case_id_value and stage = 'closed') then
    raise exception '案件已結案，無法修改回饋';
  end if;

  select * into existing_feedback
  from public.case_feedback
  where case_id = case_id_value and author_person_id = target_author
  for update;

  if target_author <> p_actor
    and existing_feedback.id is not null
    and existing_feedback.submitted_by_person_id <> p_actor then
    raise exception '該委員已有本人回饋，不可由副主席代填覆蓋';
  end if;

  insert into public.case_feedback(
    case_id, author_person_id, submitted_by_person_id, body, updated_at
  ) values (
    case_id_value, target_author, p_actor, btrim(p_body), now()
  )
  on conflict (case_id, author_person_id) do update
    set body = excluded.body,
        submitted_by_person_id = excluded.submitted_by_person_id,
        updated_at = excluded.updated_at
    where public.case_feedback.locked_at is null
  returning id into feedback_id;
  if feedback_id is null then
    raise exception '案件回饋已鎖定，無法修改';
  end if;

  insert into public.case_events(case_id, event_type, actor_person_id, details)
  values (
    case_id_value,
    'feedback.saved',
    p_actor,
    jsonb_build_object(
      'source', 'app-api',
      'author_person_id', target_author,
      'submission_mode', case when target_author = p_actor then 'self' else 'vp-proxy' end
    )
  );
  return feedback_id;
end;
$$;

-- 保留舊三參數入口，避免資料庫與 Edge Function 部署的短暫交界造成保存失敗。
create or replace function public.edge_save_case_feedback(
  p_task_id uuid,
  p_actor uuid,
  p_body text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.edge_save_case_feedback(p_task_id, p_actor, p_body, p_actor);
$$;

revoke all on function public.edge_save_case_feedback(uuid, uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.edge_save_case_feedback(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.edge_save_case_feedback(uuid, uuid, text, uuid)
  to service_role;
grant execute on function public.edge_save_case_feedback(uuid, uuid, text)
  to service_role;

comment on function public.edge_save_case_feedback(uuid, uuid, text, uuid) is
  '交易式保存本人或副主席代填回饋；驗證現任角色、迴避規則並保存實際操作者。';
comment on function public.edge_save_case_feedback(uuid, uuid, text) is
  '舊版相容入口；只允許把回饋保存為操作者本人。';
