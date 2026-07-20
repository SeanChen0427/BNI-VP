-- 富聯分會會員委員會整合系統：正式資料庫、RLS 與 Private Storage
--
-- 重要邊界：
-- 1. Auth 維持 admin／vp／committee 三組共用帳號；授權角色只讀取
--    public.app_accounts，不信任可由前端修改的 user_metadata。
-- 2. committee 共用帳號登入後選擇姓名是已確認的自我申報信任機制，
--    無法提供一人一帳號等級的不可否認性。資料庫仍驗證該姓名必須是
--    當期有效名單或該案投票資格快照成員。
-- 3. BNI 計分與診斷不在資料庫重算；analysis_snapshots 只保存分析核心
--    已發布的版本化結果。
-- 4. 本 migration 不建立 Auth 使用者、不放入真實會員資料，也不含 secret。

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.app_role as enum ('admin', 'vp', 'committee');
create type public.person_status as enum ('active', 'suspended', 'departed');
create type public.committee_role as enum ('vp', 'committee');
create type public.term_status as enum ('active', 'suspended', 'ended');
create type public.member_status as enum ('active', 'pending', 'departed');
create type public.case_type as enum ('renewal', 'new', 'midterm', 'industry', 'departure', 'special');
create type public.case_stage as enum ('waiting', 'interview', 'feedback', 'vote', 'advisor', 'closed');
create type public.assignment_role as enum ('lead', 'companion');
create type public.vote_status as enum ('draft', 'open', 'decided', 'closed', 'cancelled');
-- 棄權規則仍待確認，因此正式 schema 只開放已確認的贊成／反對。
create type public.vote_choice as enum ('approve', 'reject');
create type public.decision_result as enum ('approved', 'rejected', 'tie', 'no_quorum', 'pending');
create type public.confirmation_status as enum ('pending', 'confirmed', 'returned');
create type public.task_status as enum ('pending', 'in_progress', 'completed', 'cancelled');
create type public.meeting_status as enum ('draft', 'final');
create type public.attendance_status as enum ('draft', 'confirmed');
create type public.file_kind as enum ('interview_word', 'application', 'evidence', 'confirmation', 'other');

create table public.app_accounts (
  auth_user_id uuid primary key references auth.users(id) on delete restrict,
  role public.app_role not null,
  enabled boolean not null default true,
  label text not null check (length(btrim(label)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.app_accounts is
  'Supabase Auth 共用帳號的伺服器端角色對照。只由 Admin/service_role 維護；不可使用 user_metadata 取代。';

create table public.people (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(btrim(display_name)) between 1 and 100),
  email text,
  phone text,
  status public.person_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (display_name)
);

create table public.committee_terms (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete restrict,
  role public.committee_role not null,
  starts_on date not null,
  ends_on date,
  has_voting_right boolean not null default true,
  status public.term_status not null default 'active',
  status_changed_at timestamptz not null default now(),
  status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  unique (person_id, role, starts_on)
);

create unique index committee_terms_one_active_vp
  on public.committee_terms ((role))
  where role = 'vp' and status = 'active';
create unique index committee_terms_one_active_term_per_person
  on public.committee_terms (person_id)
  where status = 'active';
create index committee_terms_active_lookup
  on public.committee_terms (person_id, status, starts_on, ends_on);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null unique references public.people(id) on delete restrict,
  profession text not null default '',
  membership_started_on date,
  membership_expires_on date,
  internal_renewal_due_on date,
  status public.member_status not null default 'active',
  bni_member_reference text,
  departed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (membership_expires_on is null or membership_started_on is null or membership_expires_on >= membership_started_on),
  check (departed_on is null or status = 'departed')
);

create index members_status_idx on public.members (status);
create index members_expiry_idx on public.members (membership_expires_on);

create table public.analysis_snapshots (
  id uuid primary key default gen_random_uuid(),
  schema_version text not null check (length(btrim(schema_version)) between 1 and 100),
  analysis_version text not null check (length(btrim(analysis_version)) between 1 and 100),
  period_start date not null,
  period_end date not null,
  generated_at timestamptz not null,
  source_version text not null,
  source_fingerprint text,
  member_count integer not null check (member_count >= 0),
  reconciliation jsonb not null default '{}'::jsonb check (jsonb_typeof(reconciliation) = 'object'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  is_published boolean not null default false,
  published_at timestamptz,
  published_by uuid references public.people(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (period_end >= period_start),
  check ((not is_published and published_at is null) or (is_published and published_at is not null))
);

create index analysis_snapshots_published_idx
  on public.analysis_snapshots (is_published, period_end desc, generated_at desc);

create table public.report_imports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('monthly_palms', 'half_year_palms', 'membership', 'tenure', 'audit', 'other')),
  period_start date,
  period_end date,
  storage_bucket text not null default 'raw-reports' check (storage_bucket = 'raw-reports'),
  storage_path text not null check (length(btrim(storage_path)) > 0),
  sha256 text,
  imported_by uuid references public.people(id) on delete restrict,
  imported_at timestamptz not null default now(),
  analysis_snapshot_id uuid references public.analysis_snapshots(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  check (period_end is null or period_start is null or period_end >= period_start),
  unique (storage_bucket, storage_path)
);

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique check (length(btrim(case_number)) between 1 and 100),
  type public.case_type not null,
  title text not null check (length(btrim(title)) between 1 and 200),
  member_id uuid references public.members(id) on delete restrict,
  applicant_name_snapshot text not null check (length(btrim(applicant_name_snapshot)) between 1 and 100),
  profession_snapshot text not null default '',
  stage public.case_stage not null default 'waiting',
  lead_person_id uuid references public.people(id) on delete restrict,
  scheduled_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  reopened_at timestamptz,
  analysis_snapshot_id uuid references public.analysis_snapshots(id) on delete restrict,
  progress_summary text,
  created_by uuid references public.people(id) on delete restrict,
  updated_by uuid references public.people(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((stage = 'closed' and completed_at is not null) or stage <> 'closed')
);

create index cases_stage_due_idx on public.cases (stage, due_at);
create index cases_member_idx on public.cases (member_id);
create index cases_lead_idx on public.cases (lead_person_id);

create table public.case_assignments (
  case_id uuid not null references public.cases(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete restrict,
  role public.assignment_role not null,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.people(id) on delete restrict,
  primary key (case_id, person_id),
  unique (case_id, role, person_id)
);

create unique index case_assignments_one_lead
  on public.case_assignments (case_id)
  where role = 'lead';

create table public.case_forms (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.cases(id) on delete cascade,
  schema_version text not null,
  form_data jsonb not null default '{}'::jsonb check (jsonb_typeof(form_data) = 'object'),
  completed_at timestamptz,
  updated_by uuid references public.people(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.case_notes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  author_person_id uuid not null references public.people(id) on delete restrict,
  body text not null check (length(btrim(body)) > 0),
  vp_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index case_notes_case_idx on public.case_notes (case_id, created_at);

create table public.case_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.cases(id) on delete cascade,
  event_type text not null check (length(btrim(event_type)) between 1 and 100),
  actor_person_id uuid references public.people(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object')
);

create index case_events_case_idx on public.case_events (case_id, occurred_at);

create table public.case_feedback (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  author_person_id uuid not null references public.people(id) on delete restrict,
  body text not null check (length(btrim(body)) > 0),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  locked_at timestamptz,
  unique (case_id, author_person_id)
);

create index case_feedback_case_idx on public.case_feedback (case_id, submitted_at);

create table public.vote_snapshots (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.cases(id) on delete restrict,
  opened_at timestamptz,
  deadline_at timestamptz,
  closed_at timestamptz,
  status public.vote_status not null default 'draft',
  original_base integer not null check (original_base >= 0),
  eligible_base integer not null check (eligible_base >= 0 and eligible_base <= original_base),
  majority_threshold integer generated always as ((eligible_base / 2) + 1) stored,
  result public.decision_result not null default 'pending',
  approve_count integer not null default 0 check (approve_count >= 0),
  reject_count integer not null default 0 check (reject_count >= 0),
  confirmed_by uuid references public.people(id) on delete restrict,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (deadline_at is null or opened_at is null or deadline_at > opened_at),
  check (closed_at is null or opened_at is null or closed_at >= opened_at)
);

create table public.vote_snapshot_voters (
  snapshot_id uuid not null references public.vote_snapshots(id) on delete restrict,
  person_id uuid not null references public.people(id) on delete restrict,
  role public.committee_role not null,
  term_id uuid references public.committee_terms(id) on delete restrict,
  is_recused boolean not null default false,
  recusal_reason text,
  primary key (snapshot_id, person_id),
  check ((not is_recused and recusal_reason is null) or (is_recused and length(btrim(recusal_reason)) > 0))
);

create index vote_snapshot_voters_person_idx
  on public.vote_snapshot_voters (person_id, snapshot_id);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null,
  voter_person_id uuid not null,
  choice public.vote_choice not null,
  cast_at timestamptz not null default now(),
  actor_auth_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  correction_reason text,
  created_at timestamptz not null default now(),
  unique (snapshot_id, voter_person_id),
  foreign key (snapshot_id, voter_person_id)
    references public.vote_snapshot_voters(snapshot_id, person_id) on delete restrict
);

create index votes_snapshot_idx on public.votes (snapshot_id, cast_at);

create table public.advisor_confirmations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete restrict,
  status public.confirmation_status not null default 'pending',
  confirmed_by_name text,
  confirmed_at timestamptz,
  notes text,
  recorded_by uuid references public.people(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (case_id),
  check ((status = 'pending' and confirmed_at is null) or status <> 'pending')
);

create table public.case_files (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  bucket_id text not null check (bucket_id in ('case-files', 'case-confirmations')),
  object_path text not null,
  kind public.file_kind not null,
  original_filename text not null,
  content_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  sha256 text,
  uploaded_by uuid references public.people(id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  unique (bucket_id, object_path)
);

create index case_files_case_idx on public.case_files (case_id, uploaded_at);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.cases(id) on delete cascade,
  member_id uuid references public.members(id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 200),
  category text not null,
  status public.task_status not null default 'pending',
  lead_person_id uuid not null references public.people(id) on delete restrict,
  due_at timestamptz,
  completed_at timestamptz,
  result_summary text,
  source text,
  source_reference text,
  created_by uuid references public.people(id) on delete restrict,
  completed_by uuid references public.people(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'completed' and completed_at is not null) or status <> 'completed')
);

create index tasks_status_due_idx on public.tasks (status, due_at);
create index tasks_lead_idx on public.tasks (lead_person_id);

create table public.task_private_details (
  task_id uuid primary key references public.tasks(id) on delete cascade,
  details text,
  updated_by uuid references public.people(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_assignments (
  task_id uuid not null references public.tasks(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete restrict,
  role public.assignment_role not null,
  assigned_at timestamptz not null default now(),
  primary key (task_id, person_id)
);

create unique index task_assignments_one_lead
  on public.task_assignments (task_id)
  where role = 'lead';

create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  meeting_date date not null unique,
  status public.attendance_status not null default 'draft',
  primary_recorder_id uuid not null references public.people(id) on delete restrict,
  assistant_recorder_id uuid references public.people(id) on delete restrict,
  confirmed_by uuid references public.people(id) on delete restrict,
  confirmed_at timestamptz,
  announcement_sent_at timestamptz,
  cumulative_analysis_snapshot_id uuid references public.analysis_snapshots(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (assistant_recorder_id is null or assistant_recorder_id <> primary_recorder_id),
  check ((status = 'confirmed' and confirmed_at is not null and confirmed_by is not null) or status = 'draft')
);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  present_0630 boolean not null default false,
  present_0700 boolean not null default false,
  late boolean not null default false,
  left_early boolean not null default false,
  proxy boolean not null default false,
  absent boolean not null default false,
  presentation_completed boolean not null default false,
  name_badge boolean not null default false,
  pin_badge boolean not null default false,
  suit boolean not null default false,
  camera_on boolean not null default false,
  notes text,
  updated_by uuid references public.people(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, member_id),
  check (not (absent and (present_0630 or present_0700)))
);

create index attendance_records_member_idx
  on public.attendance_records (member_id, session_id);

create table public.committee_meetings (
  id uuid primary key default gen_random_uuid(),
  meeting_month date not null unique check (extract(day from meeting_month) = 1),
  meeting_date date not null,
  report_month date not null check (extract(day from report_month) = 1),
  recorder_id uuid not null references public.people(id) on delete restrict,
  attendee_ids uuid[] not null default '{}'::uuid[],
  status public.meeting_status not null default 'draft',
  attendance_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(attendance_summary) = 'object'),
  growth_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(growth_summary) = 'object'),
  care_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(care_summary) = 'object'),
  member_assistance text,
  motions text,
  conclusion text,
  follow_ups text,
  finalized_by uuid references public.people(id) on delete restrict,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'final' and finalized_by is not null and finalized_at is not null) or status = 'draft')
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.cases(id) on delete restrict,
  kind text not null,
  body text not null check (length(btrim(body)) > 0),
  status text not null default 'draft' check (status in ('draft', 'ready', 'sent', 'cancelled')),
  sent_at timestamptz,
  sent_by uuid references public.people(id) on delete restrict,
  created_by uuid references public.people(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'sent' and sent_at is not null and sent_by is not null) or status <> 'sent')
);

create table public.ai_credentials (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  provider text not null check (provider in ('openai', 'gemini', 'anthropic')),
  encrypted_payload text not null,
  key_suffix text not null check (length(key_suffix) <= 8),
  encryption_version text not null,
  updated_at timestamptz not null default now(),
  unique (person_id, provider)
);

comment on table public.ai_credentials is
  '只供受信任 Edge Function/service_role 存取的密文；anon/authenticated 不授權，完整 Key 不可回傳前端。';

create table public.audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_auth_user_id uuid,
  actor_role public.app_role,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  table_name text not null,
  record_id text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb
);

create index audit_logs_lookup_idx
  on public.audit_logs (table_name, record_id, occurred_at desc);

-- Authorization helpers live outside the exposed public schema.
create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select a.role
  from public.app_accounts a
  where a.auth_user_id = (select auth.uid())
    and a.enabled
$$;

create or replace function private.has_role(allowed public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.current_app_role()) = any(allowed), false)
$$;

create or replace function private.is_active_committee_person(target_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.committee_terms t
    where t.person_id = target_person_id
      and t.status = 'active'
      and t.has_voting_right
      and current_date >= t.starts_on
      and (t.ends_on is null or current_date <= t.ends_on)
  )
$$;

create or replace function private.is_case_assigned(target_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role]))
    or (
      (select private.current_app_role()) = 'committee'::public.app_role
      and exists (
        select 1
        from public.case_assignments ca
        join public.committee_terms t on t.person_id = ca.person_id
        where ca.case_id = target_case_id
          and t.role = 'committee'
          and t.status = 'active'
          and current_date >= t.starts_on
          and (t.ends_on is null or current_date <= t.ends_on)
      )
    )
$$;

create or replace function private.can_read_case_sensitive(target_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role]))
    or (
      (select private.is_case_assigned(target_case_id))
      and exists (
        select 1 from public.cases c
        where c.id = target_case_id and c.stage <> 'closed'
      )
    )
$$;

create or replace function private.is_task_assigned(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role]))
    or (
      (select private.current_app_role()) = 'committee'::public.app_role
      and exists (
        select 1
        from public.task_assignments ta
        join public.committee_terms t on t.person_id = ta.person_id
        where ta.task_id = target_task_id
          and t.status = 'active'
          and current_date >= t.starts_on
          and (t.ends_on is null or current_date <= t.ends_on)
      )
    )
$$;

create or replace function private.storage_case_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  first_folder text;
begin
  first_folder := (storage.foldername(object_name))[1];
  return first_folder::uuid;
exception when others then
  return null;
end;
$$;

revoke all on all functions in schema private from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.current_app_role() to authenticated;
grant execute on function private.has_role(public.app_role[]) to authenticated;
grant execute on function private.is_active_committee_person(uuid) to authenticated;
grant execute on function private.is_case_assigned(uuid) to authenticated;
grant execute on function private.can_read_case_sensitive(uuid) to authenticated;
grant execute on function private.is_task_assigned(uuid) to authenticated;
grant execute on function private.storage_case_id(text) to authenticated;

-- Integrity and audit triggers.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.validate_feedback_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_case public.cases%rowtype;
begin
  select * into target_case from public.cases where id = new.case_id;
  if target_case.id is null or target_case.type not in ('renewal', 'new', 'industry') then
    raise exception '此案件不適用委員回饋';
  end if;
  if target_case.stage = 'closed' then
    raise exception '結案或鎖定後不得修改回饋';
  end if;
  if tg_op = 'UPDATE' then
    if old.locked_at is not null then
      raise exception '結案或鎖定後不得修改回饋';
    end if;
    if new.case_id <> old.case_id or new.author_person_id <> old.author_person_id then
      raise exception '不得變更既有回饋的案件或作者';
    end if;
  end if;
  if not (select private.is_active_committee_person(new.author_person_id)) then
    raise exception '回饋者不是當期有效投票成員';
  end if;
  if exists (
    select 1 from public.members m
    where m.id = target_case.member_id and m.person_id = new.author_person_id
  ) or exists (
    select 1 from public.people p
    where p.id = new.author_person_id
      and btrim(p.display_name) = btrim(target_case.applicant_name_snapshot)
  ) then
    raise exception '申請者本人必須迴避';
  end if;
  return new;
end;
$$;

create trigger case_feedback_validate
before insert or update on public.case_feedback
for each row execute function private.validate_feedback_write();

create or replace function private.validate_case_file_path()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.storage_case_id(new.object_path) is distinct from new.case_id then
    raise exception '案件檔案路徑第一層必須與 case_id 相同';
  end if;
  return new;
end;
$$;

create trigger case_files_validate_path
before insert or update on public.case_files
for each row execute function private.validate_case_file_path();

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
  new.actor_auth_user_id := auth.uid();
  return new;
end;
$$;

create trigger votes_validate_insert
before insert on public.votes
for each row execute function private.validate_vote_insert();

create or replace function private.validate_vote_snapshot_open()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  original_count integer;
  eligible_count integer;
  target_type public.case_type;
begin
  if new.status = 'open' and tg_op = 'INSERT' then
    select c.type into target_type from public.cases c where c.id = new.case_id;
    if target_type is null or target_type not in ('renewal', 'new', 'industry') then
      raise exception '此案件類型不適用投票';
    end if;
    select count(*), count(*) filter (where not v.is_recused)
      into original_count, eligible_count
    from public.vote_snapshot_voters v
    where v.snapshot_id = new.id;
    if original_count <> new.original_base or eligible_count <> new.eligible_base then
      raise exception '投票基數與資格快照名單不一致';
    end if;
    if new.opened_at is null then
      new.opened_at := now();
    end if;
  end if;
  if new.status = 'open' and tg_op = 'UPDATE' then
    if old.status <> 'open' then
      select c.type into target_type from public.cases c where c.id = new.case_id;
      if target_type is null or target_type not in ('renewal', 'new', 'industry') then
        raise exception '此案件類型不適用投票';
      end if;
      select count(*), count(*) filter (where not v.is_recused)
        into original_count, eligible_count
      from public.vote_snapshot_voters v
      where v.snapshot_id = new.id;
      if original_count <> new.original_base or eligible_count <> new.eligible_base then
        raise exception '投票基數與資格快照名單不一致';
      end if;
      if new.opened_at is null then
        new.opened_at := now();
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger vote_snapshots_validate_open
before insert or update on public.vote_snapshots
for each row execute function private.validate_vote_snapshot_open();

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
  target_snapshot_id := case when tg_op = 'DELETE' then old.snapshot_id else new.snapshot_id end;
  select s.status into target_status from public.vote_snapshots s where s.id = target_snapshot_id;
  if target_status <> 'draft' then
    raise exception '投票開啟後不得改寫資格快照';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger vote_snapshot_voters_immutable_after_open
before insert or update or delete on public.vote_snapshot_voters
for each row execute function private.prevent_open_voter_snapshot_mutation();

create or replace function private.refresh_vote_tally()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_snapshot_id uuid;
  approvals integer;
  rejections integer;
  threshold integer;
  next_result public.decision_result;
begin
  target_snapshot_id := case when tg_op = 'DELETE' then old.snapshot_id else new.snapshot_id end;
  select
    count(*) filter (where v.choice = 'approve'),
    count(*) filter (where v.choice = 'reject')
  into approvals, rejections
  from public.votes v
  where v.snapshot_id = target_snapshot_id;

  select s.majority_threshold into threshold
  from public.vote_snapshots s where s.id = target_snapshot_id;

  next_result := case
    when approvals + rejections < threshold then 'no_quorum'::public.decision_result
    when approvals = rejections then 'tie'::public.decision_result
    when approvals > rejections then 'approved'::public.decision_result
    else 'rejected'::public.decision_result
  end;

  update public.vote_snapshots
  set approve_count = approvals,
      reject_count = rejections,
      result = next_result
  where id = target_snapshot_id;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger votes_refresh_tally
after insert or update or delete on public.votes
for each row execute function private.refresh_vote_tally();

create or replace function private.prevent_vote_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin')
     or (select private.current_app_role()) = 'admin'::public.app_role then
    if tg_op = 'UPDATE'
       and (new.snapshot_id <> old.snapshot_id or new.voter_person_id <> old.voter_person_id) then
      raise exception '投票更正不得變更資格快照或投票人';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception '既有投票不得修改或刪除；更正須由 Admin 留存原因';
end;
$$;

create trigger votes_prevent_mutation
before update or delete on public.votes
for each row execute function private.prevent_vote_mutation();

create or replace function private.protect_finalized_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'attendance_sessions' then
    if new.status = 'confirmed'
       and not (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])) then
      raise exception '只有副主席或 Admin 可最終確認點名';
    end if;
    if tg_op = 'UPDATE' then
      if old.status = 'confirmed'
         and not (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])) then
        raise exception '已確認點名只有副主席或 Admin 可修改';
      end if;
    end if;
  end if;
  if tg_table_name = 'committee_meetings' then
    if new.status = 'final'
       and not (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])) then
      raise exception '只有副主席或 Admin 可完成月會結案';
    end if;
    if tg_op = 'UPDATE' then
      if old.status = 'final'
         and not (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])) then
        raise exception '已結案月會只有副主席或 Admin 可修改';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger attendance_sessions_protect_final
before insert or update on public.attendance_sessions
for each row execute function private.protect_finalized_records();
create trigger committee_meetings_protect_final
before insert or update on public.committee_meetings
for each row execute function private.protect_finalized_records();

create or replace function private.protect_case_closure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stage is distinct from old.stage
     and (new.stage = 'closed' or old.stage = 'closed')
     and not (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])) then
    raise exception '只有副主席或 Admin 可結案或重新開啟案件';
  end if;
  return new;
end;
$$;

create trigger cases_protect_closure
before update on public.cases
for each row execute function private.protect_case_closure();

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_logs (
    actor_auth_user_id, actor_role, action, table_name, record_id, request_id, metadata
  ) values (
    auth.uid(),
    (select private.current_app_role()),
    tg_op,
    tg_table_name,
    coalesce(row_data ->> 'id', row_data ->> 'case_id', row_data ->> 'task_id'),
    nullif(current_setting('request.headers', true)::jsonb ->> 'x-request-id', ''),
    jsonb_build_object('source', 'database-trigger')
  );
  return case when tg_op = 'DELETE' then old else new end;
exception when invalid_text_representation then
  insert into public.audit_logs (
    actor_auth_user_id, actor_role, action, table_name, record_id, metadata
  ) values (
    auth.uid(), (select private.current_app_role()), tg_op, tg_table_name,
    coalesce(row_data ->> 'id', row_data ->> 'case_id', row_data ->> 'task_id'),
    jsonb_build_object('source', 'database-trigger')
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Functions created after the helper grants must not inherit PostgreSQL's default
-- EXECUTE-to-PUBLIC privilege. Trigger invocation continues to work normally.
revoke all on all functions in schema private from public, anon;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'app_accounts', 'people', 'committee_terms', 'members', 'analysis_snapshots',
    'report_imports', 'cases', 'case_assignments', 'case_forms', 'case_notes', 'case_events',
    'case_feedback', 'vote_snapshots', 'vote_snapshot_voters', 'votes',
    'advisor_confirmations', 'case_files', 'tasks', 'task_private_details', 'task_assignments',
    'attendance_sessions', 'attendance_records', 'committee_meetings',
    'announcements', 'ai_credentials'
  ]
  loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row_change()',
      target_table || '_audit', target_table
    );
  end loop;
end $$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'app_accounts', 'people', 'committee_terms', 'members', 'cases', 'case_forms',
    'case_notes', 'case_feedback', 'vote_snapshots', 'advisor_confirmations',
    'tasks', 'task_private_details', 'attendance_sessions', 'attendance_records', 'committee_meetings',
    'announcements', 'ai_credentials'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
      target_table || '_updated_at', target_table
    );
  end loop;
end $$;

-- Every public table is API-exposed only through RLS. anon receives no table grants.
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'app_accounts', 'people', 'committee_terms', 'members', 'analysis_snapshots',
    'report_imports', 'cases', 'case_assignments', 'case_forms', 'case_notes', 'case_events',
    'case_feedback', 'vote_snapshots', 'vote_snapshot_voters', 'votes',
    'advisor_confirmations', 'case_files', 'tasks', 'task_private_details', 'task_assignments',
    'attendance_sessions', 'attendance_records', 'committee_meetings',
    'announcements', 'ai_credentials', 'audit_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('revoke all on table public.%I from anon, authenticated', target_table);
  end loop;
end $$;

grant select, insert, update on public.app_accounts to authenticated;
grant select, insert, update on public.people, public.committee_terms, public.members to authenticated;
grant select, insert, update on public.analysis_snapshots, public.report_imports to authenticated;
grant select, insert, update on public.cases, public.case_assignments, public.case_forms, public.case_notes to authenticated;
grant select, insert on public.case_events to authenticated;
grant usage on sequence public.case_events_id_seq to authenticated;
grant select, insert, update on public.case_feedback to authenticated;
grant select, insert on public.vote_snapshots to authenticated;
grant update (opened_at, deadline_at, closed_at, status, confirmed_by, confirmed_at, updated_at)
  on public.vote_snapshots to authenticated;
grant select, insert, update on public.vote_snapshot_voters to authenticated;
grant select, insert, update on public.votes to authenticated;
grant select, insert, update on public.advisor_confirmations, public.case_files to authenticated;
grant select, insert, update on public.tasks, public.task_private_details, public.task_assignments to authenticated;
grant select, insert, update on public.attendance_sessions, public.attendance_records to authenticated;
grant select, insert, update on public.committee_meetings, public.announcements to authenticated;
grant select on public.audit_logs to authenticated;

-- app_accounts
create policy app_accounts_read_self_or_admin
on public.app_accounts for select to authenticated
using (
  auth_user_id = (select auth.uid())
  or (select private.has_role(array['admin'::public.app_role]))
);
create policy app_accounts_insert_admin
on public.app_accounts for insert to authenticated
with check ((select private.has_role(array['admin'::public.app_role])));
create policy app_accounts_update_admin
on public.app_accounts for update to authenticated
using ((select private.has_role(array['admin'::public.app_role])))
with check ((select private.has_role(array['admin'::public.app_role])));

-- People, committee terms and member directory
create policy people_read_authenticated
on public.people for select to authenticated
using ((select private.current_app_role()) is not null);
create policy people_write_leadership
on public.people for insert to authenticated
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));
create policy people_update_leadership
on public.people for update to authenticated
using ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])))
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));

create policy committee_terms_read_authenticated
on public.committee_terms for select to authenticated
using ((select private.current_app_role()) is not null);
create policy committee_terms_write_leadership
on public.committee_terms for insert to authenticated
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));
create policy committee_terms_update_leadership
on public.committee_terms for update to authenticated
using ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])))
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));

create policy members_read_authenticated
on public.members for select to authenticated
using ((select private.current_app_role()) is not null);
create policy members_write_leadership
on public.members for insert to authenticated
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));
create policy members_update_leadership
on public.members for update to authenticated
using ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])))
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));

-- Analysis is read-only for normal authenticated users once published.
create policy analysis_snapshots_read
on public.analysis_snapshots for select to authenticated
using (
  is_published
  or (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role]))
);
create policy analysis_snapshots_insert_leadership
on public.analysis_snapshots for insert to authenticated
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));
create policy analysis_snapshots_update_leadership
on public.analysis_snapshots for update to authenticated
using ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])))
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));

create policy report_imports_read_leadership
on public.report_imports for select to authenticated
using ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));
create policy report_imports_insert_leadership
on public.report_imports for insert to authenticated
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));
create policy report_imports_update_leadership
on public.report_imports for update to authenticated
using ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])))
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));

-- Case progress is visible to the committee; sensitive form/notes/files are separate.
create policy cases_read_authenticated
on public.cases for select to authenticated
using ((select private.current_app_role()) is not null);
create policy cases_insert_leadership
on public.cases for insert to authenticated
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));
create policy cases_update_manager
on public.cases for update to authenticated
using ((select private.is_case_assigned(id)))
with check ((select private.is_case_assigned(id)));

create policy case_assignments_read_authenticated
on public.case_assignments for select to authenticated
using ((select private.current_app_role()) is not null);
create policy case_assignments_insert_leadership
on public.case_assignments for insert to authenticated
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));
create policy case_assignments_update_leadership
on public.case_assignments for update to authenticated
using ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])))
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));

create policy case_forms_read_sensitive
on public.case_forms for select to authenticated
using ((select private.can_read_case_sensitive(case_id)));
create policy case_forms_insert_sensitive
on public.case_forms for insert to authenticated
with check ((select private.can_read_case_sensitive(case_id)));
create policy case_forms_update_sensitive
on public.case_forms for update to authenticated
using ((select private.can_read_case_sensitive(case_id)))
with check ((select private.can_read_case_sensitive(case_id)));

create policy case_notes_read_sensitive
on public.case_notes for select to authenticated
using (
  (not vp_only and (select private.can_read_case_sensitive(case_id)))
  or (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role]))
);
create policy case_notes_insert_sensitive
on public.case_notes for insert to authenticated
with check (
  (not vp_only and (select private.can_read_case_sensitive(case_id)))
  or (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role]))
);
create policy case_notes_update_sensitive
on public.case_notes for update to authenticated
using (
  (not vp_only and (select private.can_read_case_sensitive(case_id)))
  or (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role]))
)
with check (
  (not vp_only and (select private.can_read_case_sensitive(case_id)))
  or (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role]))
);

create policy case_events_read_leadership
on public.case_events for select to authenticated
using ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));
create policy case_events_insert_leadership
on public.case_events for insert to authenticated
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));

create policy case_feedback_read_committee
on public.case_feedback for select to authenticated
using ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role, 'committee'::public.app_role])));
create policy case_feedback_insert_committee
on public.case_feedback for insert to authenticated
with check (
  (select private.has_role(array['vp'::public.app_role, 'committee'::public.app_role]))
  and (select private.is_active_committee_person(author_person_id))
);
create policy case_feedback_update_author_or_leadership
on public.case_feedback for update to authenticated
using (
  locked_at is null
  and (
    (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role]))
    or (select private.current_app_role()) = 'committee'::public.app_role
  )
)
with check (locked_at is null);

-- Vote eligibility is snapshotted. Individual vote direction is visible only to VP/Admin.
create policy vote_snapshots_read_committee
on public.vote_snapshots for select to authenticated
using ((select private.current_app_role()) is not null);
create policy vote_snapshots_insert_leadership
on public.vote_snapshots for insert to authenticated
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));
create policy vote_snapshots_update_leadership
on public.vote_snapshots for update to authenticated
using ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])))
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));

create policy vote_voters_read_committee
on public.vote_snapshot_voters for select to authenticated
using ((select private.current_app_role()) is not null);
create policy vote_voters_insert_leadership
on public.vote_snapshot_voters for insert to authenticated
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));
create policy vote_voters_update_leadership
on public.vote_snapshot_voters for update to authenticated
using ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])))
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));

create policy votes_read_leadership
on public.votes for select to authenticated
using ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));
create policy votes_cast_eligible
on public.votes for insert to authenticated
with check (
  actor_auth_user_id = (select auth.uid())
  and (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role, 'committee'::public.app_role]))
  and exists (
    select 1 from public.vote_snapshot_voters v
    where v.snapshot_id = votes.snapshot_id
      and v.person_id = votes.voter_person_id
      and not v.is_recused
  )
);
create policy votes_admin_correct
on public.votes for update to authenticated
using ((select private.has_role(array['admin'::public.app_role])))
with check (
  (select private.has_role(array['admin'::public.app_role]))
  and length(btrim(coalesce(correction_reason, ''))) > 0
);
create policy advisor_confirmations_read_leadership
on public.advisor_confirmations for select to authenticated
using ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));
create policy advisor_confirmations_insert_leadership
on public.advisor_confirmations for insert to authenticated
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));
create policy advisor_confirmations_update_leadership
on public.advisor_confirmations for update to authenticated
using ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])))
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));

create policy case_files_read_sensitive
on public.case_files for select to authenticated
using ((select private.can_read_case_sensitive(case_id)));
create policy case_files_insert_sensitive
on public.case_files for insert to authenticated
with check ((select private.can_read_case_sensitive(case_id)));
create policy case_files_update_leadership
on public.case_files for update to authenticated
using ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])))
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));

-- Task progress is committee-visible; sensitive details live in an assignee-only table.
create policy tasks_read_authenticated
on public.tasks for select to authenticated
using ((select private.current_app_role()) is not null);
create policy tasks_insert_leadership
on public.tasks for insert to authenticated
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));
create policy tasks_update_assigned
on public.tasks for update to authenticated
using ((select private.is_task_assigned(id)))
with check ((select private.is_task_assigned(id)));

create policy task_private_details_read_assigned
on public.task_private_details for select to authenticated
using ((select private.is_task_assigned(task_id)));
create policy task_private_details_insert_assigned
on public.task_private_details for insert to authenticated
with check ((select private.is_task_assigned(task_id)));
create policy task_private_details_update_assigned
on public.task_private_details for update to authenticated
using ((select private.is_task_assigned(task_id)))
with check ((select private.is_task_assigned(task_id)));

create policy task_assignments_read_authenticated
on public.task_assignments for select to authenticated
using ((select private.current_app_role()) is not null);
create policy task_assignments_insert_leadership
on public.task_assignments for insert to authenticated
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));
create policy task_assignments_update_leadership
on public.task_assignments for update to authenticated
using ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])))
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));

create policy attendance_sessions_read_authenticated
on public.attendance_sessions for select to authenticated
using ((select private.current_app_role()) is not null);
create policy attendance_sessions_insert_committee
on public.attendance_sessions for insert to authenticated
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role, 'committee'::public.app_role])));
create policy attendance_sessions_update_committee
on public.attendance_sessions for update to authenticated
using ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role, 'committee'::public.app_role])))
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role, 'committee'::public.app_role])));

create policy attendance_records_read_authenticated
on public.attendance_records for select to authenticated
using ((select private.current_app_role()) is not null);
create policy attendance_records_insert_committee
on public.attendance_records for insert to authenticated
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role, 'committee'::public.app_role])));
create policy attendance_records_update_committee
on public.attendance_records for update to authenticated
using ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role, 'committee'::public.app_role])))
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role, 'committee'::public.app_role])));

create policy committee_meetings_read_authenticated
on public.committee_meetings for select to authenticated
using ((select private.current_app_role()) is not null);
create policy committee_meetings_insert_committee
on public.committee_meetings for insert to authenticated
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role, 'committee'::public.app_role])));
create policy committee_meetings_update_committee
on public.committee_meetings for update to authenticated
using ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role, 'committee'::public.app_role])))
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role, 'committee'::public.app_role])));

create policy announcements_read_authenticated
on public.announcements for select to authenticated
using ((select private.current_app_role()) is not null);
create policy announcements_insert_leadership
on public.announcements for insert to authenticated
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));
create policy announcements_update_leadership
on public.announcements for update to authenticated
using ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])))
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));

-- ai_credentials intentionally has no authenticated grants or policies.
create policy audit_logs_read_admin
on public.audit_logs for select to authenticated
using ((select private.has_role(array['admin'::public.app_role])));

-- Private Storage buckets. The first folder of case buckets must be the case UUID:
-- case-files/<case_uuid>/<filename>
-- case-confirmations/<case_uuid>/<filename>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'raw-reports', 'raw-reports', false, 26214400,
    array[
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv', 'application/json', 'application/zip'
    ]
  ),
  (
    'case-files', 'case-files', false, 26214400,
    array[
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/pdf', 'image/png', 'image/jpeg'
    ]
  ),
  (
    'case-confirmations', 'case-confirmations', false, 10485760,
    array['image/png', 'image/jpeg', 'application/pdf']
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy storage_raw_reports_read_leadership
on storage.objects for select to authenticated
using (
  bucket_id = 'raw-reports'
  and (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role]))
);
create policy storage_raw_reports_insert_leadership
on storage.objects for insert to authenticated
with check (
  bucket_id = 'raw-reports'
  and (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role]))
);
create policy storage_raw_reports_update_leadership
on storage.objects for update to authenticated
using (
  bucket_id = 'raw-reports'
  and (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role]))
)
with check (
  bucket_id = 'raw-reports'
  and (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role]))
);
create policy storage_case_objects_read
on storage.objects for select to authenticated
using (
  bucket_id in ('case-files', 'case-confirmations')
  and (select private.can_read_case_sensitive(private.storage_case_id(name)))
);
create policy storage_case_objects_insert
on storage.objects for insert to authenticated
with check (
  bucket_id in ('case-files', 'case-confirmations')
  and (select private.can_read_case_sensitive(private.storage_case_id(name)))
);
create policy storage_case_objects_update_leadership
on storage.objects for update to authenticated
using (
  bucket_id in ('case-files', 'case-confirmations')
  and (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role]))
)
with check (
  bucket_id in ('case-files', 'case-confirmations')
  and (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role]))
);
comment on schema public is
  '富聯分會正式結構化資料。所有公開 schema 資料表均啟用 RLS；anon 無資料表權限。';
