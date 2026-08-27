-- Copy-only accountability email work queue. The application never sends email
-- and never changes membership or professional-category status from these rows.

create table public.accountability_email_tasks (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  reason text not null check (reason in ('absence', 'proxy')),
  occurrence smallint not null check (
    (reason = 'absence' and occurrence in (2, 3, 4))
    or (reason = 'proxy' and occurrence in (6, 7, 8, 9))
  ),
  title text not null check (length(btrim(title)) between 1 and 240),
  risk_level text not null check (risk_level in ('notice', 'warning', 'final_warning', 'open_category')),
  status text not null default 'pending_send'
    check (status in ('pending_data', 'pending_send', 'sent', 'held', 'not_applicable')),
  profession text not null default '',
  period_start date not null,
  period_end date not null,
  trigger_on date not null,
  source_type text not null check (source_type in ('palms_baseline', 'confirmed_attendance')),
  source_report_import_id uuid not null references public.report_imports(id) on delete restrict,
  source_attendance_session_id uuid references public.attendance_sessions(id) on delete restrict,
  source_fingerprint text not null check (length(btrim(source_fingerprint)) between 1 and 300),
  template_key text not null check (length(btrim(template_key)) between 1 and 120),
  template_version text not null check (length(btrim(template_version)) between 1 and 120),
  draft_subject text not null check (length(btrim(draft_subject)) between 1 and 500),
  draft_body text not null check (length(btrim(draft_body)) between 1 and 30000),
  recipient_email text,
  cc_emails text[] not null default '{}',
  missing_fields text[] not null default '{}',
  hold_reason text,
  outcome_reason text,
  last_copied_at timestamptz,
  last_copied_by uuid references public.people(id) on delete restrict,
  sent_at timestamptz,
  sent_by uuid references public.people(id) on delete restrict,
  sent_subject text,
  sent_body text,
  created_by uuid not null references public.people(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  check ((status = 'sent' and sent_at is not null and sent_by is not null) or status <> 'sent'),
  unique (member_id, reason, occurrence, trigger_on)
);

create index accountability_email_tasks_status_idx
  on public.accountability_email_tasks (status, risk_level, trigger_on desc);
create index accountability_email_tasks_member_idx
  on public.accountability_email_tasks (member_id, trigger_on desc);

create table public.accountability_email_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.accountability_email_tasks(id) on delete restrict,
  event_type text not null check (event_type in ('generated', 'copied', 'sent', 'held', 'not_applicable', 'restored')),
  actor_id uuid not null references public.people(id) on delete restrict,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index accountability_email_events_task_idx
  on public.accountability_email_events (task_id, created_at desc);

comment on table public.accountability_email_tasks is
  'VP/Admin copy-only accountability email queue. Rows never authorize automatic email delivery, membership termination, or professional-category changes.';
comment on table public.accountability_email_events is
  'Append-only audit trail for accountability email draft generation, copying, and manually reported outcomes.';

alter table public.accountability_email_tasks enable row level security;
alter table public.accountability_email_events enable row level security;

revoke all on table public.accountability_email_tasks, public.accountability_email_events
  from public, anon, authenticated;
grant select, insert, update on table public.accountability_email_tasks to service_role;
grant select, insert on table public.accountability_email_events to service_role;

create trigger accountability_email_tasks_set_updated_at
before update on public.accountability_email_tasks
for each row execute function private.set_updated_at();
