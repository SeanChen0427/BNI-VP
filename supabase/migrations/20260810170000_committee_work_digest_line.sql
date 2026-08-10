-- Manual, vice-chair-confirmed weekly committee work digest delivery.
-- The message is generated from current formal tasks, previewed and editable in
-- the UI, and is never sent by the recurring cron without human confirmation.

create table public.committee_work_digest_deliveries (
  id uuid primary key default gen_random_uuid(),
  group_target_id uuid not null references public.line_group_targets(id) on delete restrict,
  local_due_date date not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  message_sha256 text not null check (message_sha256 ~ '^[0-9a-f]{64}$'),
  retry_key uuid not null default gen_random_uuid() unique,
  status text not null default 'processing'
    check (status in ('processing', 'sent', 'failed')),
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
  unique (group_target_id, local_due_date, message_sha256),
  check (
    (status = 'processing' and sent_at is null and failed_at is null)
    or (status = 'sent' and sent_at is not null and failed_at is null)
    or (status = 'failed' and sent_at is null and failed_at is not null)
  )
);

create index committee_work_digest_deliveries_recent_idx
  on public.committee_work_digest_deliveries (requested_at desc);

comment on table public.committee_work_digest_deliveries is
  '副主席或 Admin 預覽、編輯並確認的每週委員工作進度 LINE 發送稽核；不保存完整訊息，只保存來源與文案雜湊。';

alter table public.committee_work_digest_deliveries enable row level security;

revoke all on table public.committee_work_digest_deliveries
  from public, anon, authenticated;
grant select, insert, update on table public.committee_work_digest_deliveries
  to service_role;

create trigger committee_work_digest_deliveries_set_updated_at
before update on public.committee_work_digest_deliveries
for each row execute function private.set_updated_at();

create trigger committee_work_digest_deliveries_audit
after insert or update or delete on public.committee_work_digest_deliveries
for each row execute function private.audit_row_change();
