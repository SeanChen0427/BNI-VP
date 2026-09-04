-- Exchange-group routine reminders use a fresh group message reply token during
-- the twelve hours before their configured delivery deadline. If the window
-- expires, the vice-chair OA broadcasts a two-bubble manual-action notice to
-- all of its friends. No LINE user IDs or group message contents are retained.

alter table public.line_group_targets
  add column delivery_strategy text not null default 'push',
  add column opportunistic_window_minutes integer not null default 720;

alter table public.line_group_targets
  add constraint line_group_targets_delivery_strategy_check
    check (delivery_strategy in ('push', 'opportunistic')),
  add constraint line_group_targets_opportunistic_window_check
    check (opportunistic_window_minutes between 5 and 1440);

update public.line_group_targets
set delivery_strategy = 'opportunistic',
    opportunistic_window_minutes = 720
where route_key = 'exchange';

alter table public.line_group_targets
  add constraint line_group_targets_route_delivery_strategy_check
  check (
    route_key is null
    or (route_key = 'exchange' and delivery_strategy = 'opportunistic')
    or (route_key <> 'exchange' and delivery_strategy = 'push')
  );

comment on column public.line_group_targets.delivery_strategy is
  'push for normal routes; opportunistic for exchange reminders that wait for a fresh replyToken.';
comment on column public.line_group_targets.opportunistic_window_minutes is
  'Minutes before the configured latest-delivery deadline during which an exchange-group message may trigger a free Reply.';

create table public.pending_announcements (
  id uuid primary key default gen_random_uuid(),
  delivery_key text not null unique
    check (length(delivery_key) between 20 and 250),
  reminder_key text not null references public.line_reminder_rules(reminder_key) on delete restrict
    check (reminder_key in ('weekly_meeting_alarm', 'monthly_data_entry')),
  group_target_id uuid not null references public.line_group_targets(id) on delete restrict,
  oa_channel text not null default 'vice_chair'
    check (oa_channel = 'vice_chair'),
  trigger_source text not null default 'scheduled'
    check (trigger_source in ('scheduled', 'manual_test')),
  local_due_date date not null,
  scheduled_for timestamptz not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  group_display_name text not null
    check (length(btrim(group_display_name)) between 1 and 200),
  message_text text not null
    check (length(btrim(message_text)) between 1 and 4500),
  message_payload jsonb not null
    check (jsonb_typeof(message_payload) = 'object'),
  message_sha256 text not null
    check (message_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending'
    check (status in (
      'pending',
      'replying',
      'fallback_processing',
      'fallback_notified',
      'fallback_failed',
      'delivered',
      'manual_delivered',
      'failed',
      'expired',
      'cancelled'
    )),
  delivery_mode text
    check (delivery_mode is null or delivery_mode in ('reply', 'manual')),
  reply_attempt_count integer not null default 0 check (reply_attempt_count >= 0),
  fallback_attempt_count integer not null default 0 check (fallback_attempt_count >= 0),
  fallback_retry_key uuid not null default gen_random_uuid() unique,
  requested_by uuid references public.people(id) on delete restrict,
  requested_by_auth_user_id uuid,
  requested_at timestamptz not null default now(),
  reply_claimed_at timestamptz,
  fallback_claimed_at timestamptz,
  delivered_at timestamptz,
  fallback_notified_at timestamptz,
  manual_completed_at timestamptz,
  manual_completed_by uuid references public.people(id) on delete restrict,
  webhook_event_id text,
  line_request_id text,
  line_message_id text,
  failed_at timestamptz,
  error_code text,
  error_message text check (error_message is null or length(error_message) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (window_end > window_start),
  check (scheduled_for = window_end)
);

create unique index pending_announcements_one_scheduled_occurrence
  on public.pending_announcements (reminder_key, group_target_id, local_due_date)
  where trigger_source = 'scheduled';

create unique index pending_announcements_one_live_test
  on public.pending_announcements (reminder_key, group_target_id)
  where trigger_source = 'manual_test'
    and status in ('pending', 'replying');

create unique index pending_announcements_webhook_event_unique
  on public.pending_announcements (webhook_event_id)
  where webhook_event_id is not null;

create index pending_announcements_reply_lookup
  on public.pending_announcements (group_target_id, status, window_start, window_end, created_at);

create index pending_announcements_fallback_lookup
  on public.pending_announcements (trigger_source, status, window_end)
  where trigger_source = 'scheduled';

comment on table public.pending_announcements is
  'Service-only queue and audit trail for exchange reminders. Stores prepared reminder payloads but never replyTokens, LINE user IDs, or triggering group message contents.';

alter table public.pending_announcements enable row level security;

revoke all on table public.pending_announcements
  from public, anon, authenticated;
grant select, insert, update on table public.pending_announcements
  to service_role;

create trigger pending_announcements_set_updated_at
before update on public.pending_announcements
for each row execute function private.set_updated_at();

create trigger pending_announcements_audit
after insert or update or delete on public.pending_announcements
for each row execute function private.audit_row_change();
