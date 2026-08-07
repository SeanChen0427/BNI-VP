-- LINE Bot only sends a confirmed attendance announcement snapshot. Group IDs and
-- delivery details are service-only data and are never exposed through browser RLS.

create table public.line_group_targets (
  id uuid primary key default gen_random_uuid(),
  line_group_id text not null unique
    check (length(line_group_id) between 8 and 100),
  display_name text not null default '待確認 LINE 群組'
    check (length(btrim(display_name)) between 1 and 200),
  purpose text check (purpose in ('test', 'production')),
  status text not null default 'discovered'
    check (status in ('discovered', 'active', 'disabled')),
  discovered_at timestamptz not null default now(),
  last_event_at timestamptz not null default now(),
  verified_by uuid references public.people(id) on delete restrict,
  verified_at timestamptz,
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'active' and purpose is not null and verified_by is not null and verified_at is not null and left_at is null)
    or (status = 'discovered' and purpose is null and verified_by is null and verified_at is null and left_at is null)
    or status = 'disabled'
  )
);

create unique index line_group_targets_one_active_test
  on public.line_group_targets (purpose)
  where status = 'active' and purpose = 'test';

create unique index line_group_targets_one_active_production
  on public.line_group_targets (purpose)
  where status = 'active' and purpose = 'production';

create index line_group_targets_status_idx
  on public.line_group_targets (status, purpose, last_event_at desc);

create table public.attendance_line_deliveries (
  id uuid primary key default gen_random_uuid(),
  attendance_session_id uuid not null references public.attendance_sessions(id) on delete restrict,
  group_target_id uuid not null references public.line_group_targets(id) on delete restrict,
  announcement_sha256 text not null
    check (announcement_sha256 ~ '^[0-9a-f]{64}$'),
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
  unique (attendance_session_id, group_target_id, announcement_sha256),
  check (
    (status = 'processing' and sent_at is null and failed_at is null)
    or (status = 'sent' and sent_at is not null and failed_at is null)
    or (status = 'failed' and sent_at is null and failed_at is not null)
  )
);

create index attendance_line_deliveries_session_idx
  on public.attendance_line_deliveries (attendance_session_id, requested_at desc);

comment on table public.line_group_targets is
  'LINE webhook 發現的群組目標；必須由副主席或 Admin 明確核對後才可啟用發送。';
comment on table public.attendance_line_deliveries is
  '已確認點名公告的 LINE 發送稽核與冪等記錄；不儲存 Token 或群組聊天內容。';

alter table public.line_group_targets enable row level security;
alter table public.attendance_line_deliveries enable row level security;

revoke all on table public.line_group_targets, public.attendance_line_deliveries
  from public, anon, authenticated;
grant select, insert, update on table public.line_group_targets, public.attendance_line_deliveries
  to service_role;

create trigger line_group_targets_set_updated_at
before update on public.line_group_targets
for each row execute function private.set_updated_at();

create trigger attendance_line_deliveries_set_updated_at
before update on public.attendance_line_deliveries
for each row execute function private.set_updated_at();

create trigger line_group_targets_audit
after insert or update or delete on public.line_group_targets
for each row execute function private.audit_row_change();

create trigger attendance_line_deliveries_audit
after insert or update or delete on public.attendance_line_deliveries
for each row execute function private.audit_row_change();
