-- Homepage committee board posts are formal cross-device data. Browser localStorage
-- remains only as a cache and as a one-time source for importing legacy posts.

alter table public.announcements
  add column if not exists author_name text,
  add column if not exists author_role public.app_role,
  add column if not exists source_reference text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.people(id) on delete restrict;

create unique index if not exists announcements_source_reference_unique
  on public.announcements (source_reference);

create index if not exists announcements_committee_board_active_idx
  on public.announcements (created_at desc)
  where kind = 'committee-board' and status = 'ready';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.announcements'::regclass
      and conname = 'announcements_committee_board_shape'
  ) then
    alter table public.announcements
      add constraint announcements_committee_board_shape check (
        kind <> 'committee-board'
        or (
          status in ('ready', 'cancelled')
          and created_by is not null
          and nullif(btrim(author_name), '') is not null
          and author_role is not null
          and nullif(btrim(source_reference), '') is not null
          and (status = 'ready' or deleted_at is not null)
        )
      );
  end if;
end
$$;

-- Board writes must pass through app-api so the shared-account selected identity,
-- authorship and delete permission are checked server-side.
revoke all on table public.announcements from public, anon, authenticated;

comment on column public.announcements.source_reference is
  'Idempotency key for committee-board browser creates and one-time localStorage imports.';
comment on column public.announcements.author_name is
  'Display-name snapshot recorded by app-api after authenticating the selected identity.';
