-- Add a fourth LINE route for the chapter exchange group and keep recurring
-- reminder configuration/delivery history service-only. Rules are seeded
-- disabled so a deployment can never start messaging a group by accident.

alter table public.line_group_targets
  drop constraint if exists line_group_targets_route_key_check;

alter table public.line_group_targets
  add constraint line_group_targets_route_key_check
  check (route_key in ('attendance', 'committee', 'leadership', 'exchange'));

comment on column public.line_group_targets.route_key is
  'Confirmed destination route: attendance, committee, leadership, or exchange. At most one active group per route.';

create table public.line_reminder_rules (
  reminder_key text primary key
    check (reminder_key in ('weekly_meeting_alarm', 'monthly_data_entry')),
  display_name text not null check (length(btrim(display_name)) between 1 and 100),
  enabled boolean not null default false,
  timezone text not null default 'Asia/Taipei'
    check (timezone = 'Asia/Taipei'),
  send_weekday smallint check (send_weekday between 1 and 7),
  send_time time without time zone not null,
  meeting_weekday smallint check (meeting_weekday between 1 and 7),
  days_before smallint check (days_before between 0 and 7),
  message_template text not null
    check (length(btrim(message_template)) between 1 and 4500),
  mention_all boolean not null default true,
  updated_by uuid references public.people(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (reminder_key = 'weekly_meeting_alarm'
      and send_weekday is not null
      and meeting_weekday is null
      and days_before is null)
    or
    (reminder_key = 'monthly_data_entry'
      and send_weekday is null
      and meeting_weekday is not null
      and days_before is not null)
  )
);

insert into public.line_reminder_rules (
  reminder_key,
  display_name,
  enabled,
  send_weekday,
  send_time,
  meeting_weekday,
  days_before,
  message_template
) values
  (
    'weekly_meeting_alarm',
    '每週例會鬧鐘提醒',
    false,
    1,
    '20:00',
    null,
    null,
    E'明天是富聯分會例會，請夥伴記得設定鬧鐘，準時與大家見面！'
  ),
  (
    'monthly_data_entry',
    '月底數據 Key in 提醒',
    false,
    null,
    '20:00',
    2,
    1,
    E'提醒夥伴：本月最後一次例會前，請完成 BNI Connect 數據 Key in，讓月底 PALMS 資料完整。'
  )
on conflict (reminder_key) do nothing;

create table public.line_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  delivery_key text not null unique
    check (length(delivery_key) between 20 and 250),
  reminder_key text not null references public.line_reminder_rules(reminder_key) on delete restrict,
  group_target_id uuid not null references public.line_group_targets(id) on delete restrict,
  trigger_source text not null
    check (trigger_source in ('scheduled', 'manual_test')),
  local_due_date date not null,
  scheduled_for timestamptz,
  message_sha256 text not null check (message_sha256 ~ '^[0-9a-f]{64}$'),
  retry_key uuid not null default gen_random_uuid() unique,
  status text not null default 'processing'
    check (status in ('processing', 'sent', 'failed', 'skipped')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  requested_by uuid references public.people(id) on delete restrict,
  requested_by_auth_user_id uuid,
  requested_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  line_request_id text,
  line_message_id text,
  error_code text,
  error_message text check (error_message is null or length(error_message) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'processing' and sent_at is null and failed_at is null)
    or (status = 'sent' and sent_at is not null and failed_at is null)
    or (status = 'failed' and sent_at is null and failed_at is not null)
    or status = 'skipped'
  )
);

create index line_reminder_deliveries_recent_idx
  on public.line_reminder_deliveries (requested_at desc);

create index line_reminder_deliveries_rule_idx
  on public.line_reminder_deliveries (reminder_key, local_due_date desc);

comment on table public.line_reminder_rules is
  '副主席或 Admin 管理的交流群常態提醒；初始一律停用，啟用前必須先綁定 exchange 群組。';
comment on table public.line_reminder_deliveries is
  '交流群常態提醒的排程及測試發送稽核；delivery_key 與 LINE retry key 防止重複發送。';

alter table public.line_reminder_rules enable row level security;
alter table public.line_reminder_deliveries enable row level security;

revoke all on table public.line_reminder_rules, public.line_reminder_deliveries
  from public, anon, authenticated;
grant select, insert, update on table public.line_reminder_rules, public.line_reminder_deliveries
  to service_role;

create trigger line_reminder_rules_set_updated_at
before update on public.line_reminder_rules
for each row execute function private.set_updated_at();

create trigger line_reminder_deliveries_set_updated_at
before update on public.line_reminder_deliveries
for each row execute function private.set_updated_at();

create trigger line_reminder_rules_audit
after insert or update or delete on public.line_reminder_rules
for each row execute function private.audit_row_change();

create trigger line_reminder_deliveries_audit
after insert or update or delete on public.line_reminder_deliveries
for each row execute function private.audit_row_change();
