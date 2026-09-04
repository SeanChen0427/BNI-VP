-- Members of the confirmed committee group can request the latest work digest
-- with an exact command. The bot responds synchronously with the webhook's
-- replyToken, which is never persisted. Only hashes and LINE delivery metadata
-- are retained for deduplication and audit.

create table public.committee_work_digest_reply_deliveries (
  id uuid primary key default gen_random_uuid(),
  group_target_id uuid not null references public.line_group_targets(id) on delete restrict,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  message_sha256 text not null check (message_sha256 ~ '^[0-9a-f]{64}$'),
  trigger_event_key text not null unique check (length(trigger_event_key) between 1 and 220),
  trigger_line_message_id text check (trigger_line_message_id is null or length(trigger_line_message_id) <= 200),
  status text not null default 'processing'
    check (status in ('processing', 'sent', 'failed')),
  triggered_at timestamptz not null,
  sent_at timestamptz,
  failed_at timestamptz,
  line_request_id text,
  reply_line_message_id text,
  error_code text,
  error_message text check (error_message is null or length(error_message) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'processing' and sent_at is null and failed_at is null)
    or (status = 'sent' and sent_at is not null and failed_at is null)
    or (status = 'failed' and sent_at is null and failed_at is not null)
  )
);

create index committee_work_digest_reply_deliveries_recent_idx
  on public.committee_work_digest_reply_deliveries (triggered_at desc);

comment on table public.committee_work_digest_reply_deliveries is
  'Exact-command committee work digest Reply audit. Never stores command text, replyToken, LINE user IDs, or full digest content.';

alter table public.committee_work_digest_reply_deliveries enable row level security;

revoke all on table public.committee_work_digest_reply_deliveries
  from public, anon, authenticated;
grant select, insert, update on table public.committee_work_digest_reply_deliveries
  to service_role;

create trigger committee_work_digest_reply_deliveries_set_updated_at
before update on public.committee_work_digest_reply_deliveries
for each row execute function private.set_updated_at();

create trigger committee_work_digest_reply_deliveries_audit
after insert or update or delete on public.committee_work_digest_reply_deliveries
for each row execute function private.audit_row_change();
