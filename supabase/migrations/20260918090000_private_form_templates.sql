-- Reviewed regional originals/packages stay out of Git and public hosting.
-- Only service_role may manage/read objects; app-api authenticates template readers.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('form-templates', 'form-templates', false, 2097152,
  array['application/json','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
