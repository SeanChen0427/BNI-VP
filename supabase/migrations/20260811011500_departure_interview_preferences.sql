-- Departure registration is mandatory administration; the interview is an
-- optional follow-up. Keep an explicit opt-out without changing member status.
create table if not exists public.departure_interview_preferences (
  member_id uuid primary key references public.members(id) on delete restrict,
  disposition text not null default 'optional' check (disposition in ('optional', 'waived')),
  updated_by uuid not null references public.people(id) on delete restrict,
  updated_at timestamptz not null default now()
);

alter table public.departure_interview_preferences enable row level security;

revoke all on table public.departure_interview_preferences from public, anon, authenticated;
grant select, insert, update on table public.departure_interview_preferences to service_role;

comment on table public.departure_interview_preferences is
  '離會訪談為選擇性補訪；只記錄副主席是否暫不安排，不改變 members.status 或 departed_on。';
