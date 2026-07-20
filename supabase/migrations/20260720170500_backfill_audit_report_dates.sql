-- 初次搬移時審計報表曾沿用 PALMS 期間解析器，導致已上傳的審計檔
-- period_start／period_end 為 null。由既有 Private Storage 檔名補回實際週日，
-- 不重傳、不改寫原始檔。

with parsed as (
  select
    id,
    substring(storage_path from 'audit_week_(\d{4}-\d{2}-\d{2})\.xls$')::date as report_date
  from public.report_imports
  where report_type = 'audit'
    and (period_start is null or period_end is null)
    and storage_path ~ 'audit_week_\d{4}-\d{2}-\d{2}\.xls$'
)
update public.report_imports as imports
set
  period_start = coalesce(imports.period_start, parsed.report_date),
  period_end = coalesce(imports.period_end, parsed.report_date),
  metadata = imports.metadata || jsonb_build_object(
    'periodBackfilledAt', now(),
    'periodBackfillSource', 'storage_filename'
  )
from parsed
where imports.id = parsed.id
  and parsed.report_date is not null;
