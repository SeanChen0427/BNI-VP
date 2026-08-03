-- Preserve the VP's explicit confirmation that the center office has completed a
-- specific renewal cycle. The official expiry date remains unchanged until a new
-- official membership-expiry report is imported.

create table public.membership_renewal_completions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  prior_expiry_on date not null,
  completed_on date not null,
  source text not null default 'center-office' check (source = 'center-office'),
  confirmed_by uuid not null references public.people(id) on delete restrict,
  confirmed_at timestamptz not null default now(),
  note text not null default '' check (length(note) <= 500),
  revoked_at timestamptz,
  revoked_by uuid references public.people(id) on delete restrict,
  check ((revoked_at is null and revoked_by is null) or (revoked_at is not null and revoked_by is not null)),
  unique (member_id, prior_expiry_on)
);

comment on table public.membership_renewal_completions is
  'VP/Admin confirmation that the center office completed one exact renewal cycle; does not replace the official expiry report.';

create index membership_renewal_completions_active_idx
  on public.membership_renewal_completions (member_id, prior_expiry_on)
  where revoked_at is null;

alter table public.membership_renewal_completions enable row level security;
revoke all on table public.membership_renewal_completions from public, anon, authenticated;
grant select, insert, update on table public.membership_renewal_completions to service_role;

create trigger membership_renewal_completions_audit
after insert or update or delete on public.membership_renewal_completions
for each row execute function private.audit_row_change();
