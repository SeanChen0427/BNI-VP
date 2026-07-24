-- 排程工作跨裝置同步
--
-- 瀏覽器原型使用字串 task id；正式資料表仍使用 uuid 主鍵，並以
-- source_reference 保存原型 id，讓既有案件連結與草稿 key 不需要改寫。

create unique index if not exists tasks_source_reference_unique
  on public.tasks (source_reference);

grant select, insert, update, delete
  on public.tasks, public.task_private_details, public.task_assignments
  to service_role;

comment on column public.tasks.source_reference is
  'vice-chair 前端穩定 task id；用於既有瀏覽器資料的一次性搬移與跨裝置連結。';

comment on table public.task_private_details is
  '工作備註等非公開細節；Edge API 僅回傳給副主席、Admin 或該工作受派人。';
