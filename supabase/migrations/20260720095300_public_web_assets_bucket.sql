-- Public bucket for the deployable frontend only.
-- No member, PALMS, case, vote, attendance, credential, or attachment data belongs here.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'web-app',
  'web-app',
  true,
  26214400,
  array[
    'text/html',
    'text/css',
    'text/javascript',
    'application/javascript',
    'image/png',
    'application/pdf'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
