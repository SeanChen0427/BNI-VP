import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const read = relative => readFile(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

test('留言板正式資料表提供冪等匯入、軟刪除且禁止瀏覽器直接寫入', async () => {
  const migration = await read('../../../supabase/migrations/20260810173000_committee_board_sync.sql');
  const serviceRoleGrant = await read('../../../supabase/migrations/20260810174500_announcements_service_role_grant.sql');

  assert.match(migration, /add column if not exists author_name text/);
  assert.match(migration, /add column if not exists source_reference text/);
  assert.match(migration, /create unique index if not exists announcements_source_reference_unique/);
  assert.match(migration, /deleted_at timestamptz/);
  assert.match(migration, /revoke all on table public\.announcements from public, anon, authenticated/);
  assert.match(serviceRoleGrant, /grant select, insert, update\s+on table public\.announcements\s+to service_role/s);
  assert.match(serviceRoleGrant, /revoke all\s+on table public\.announcements\s+from public, anon, authenticated/s);
  assert.doesNotMatch(serviceRoleGrant, /\b(update|delete|insert into)\s+public\.announcements/i);
});

test('Edge API 以登入身份建立、匯入與刪除留言', async () => {
  const edge = await read('../../../supabase/functions/app-api/index.ts');

  assert.match(edge, /path === "\/api\/announcements"/);
  assert.match(edge, /body\.action === "create"/);
  assert.match(edge, /body\.action === "import-legacy"/);
  assert.match(edge, /post\?\.authorName === context\.name && post\?\.authorRole === context\.role/);
  assert.match(edge, /created_by: context\.personId/);
  assert.match(edge, /author_name: context\.name/);
  assert.match(edge, /const publishedAt = new Date\(\)\.toISOString\(\)/);
  assert.match(edge, /created_at: publishedAt/);
  assert.doesNotMatch(edge, /created_at: body\.(?:createdAt|publishedAt)/);
  assert.match(edge, /只能刪除自己發布的留言/);
  assert.match(edge, /status: "cancelled"/);
});

test('前台先搬移舊留言再以 Supabase 結果取代快取', async () => {
  const [board, notifications, html] = await Promise.all([
    read('../assets/js/announcement-board.js'),
    read('../assets/js/notification-center.js'),
    read('../index.html'),
  ]);

  assert.match(board, /fetch\("\/api\/announcements"/);
  assert.match(board, /action: "import-legacy"/);
  assert.match(board, /replaceCache\(data\.posts\)/);
  assert.match(board, /formatTaipeiTimestamp\(value, \{ seconds: true \}\)/);
  assert.match(board, /data\.publishedAt/);
  assert.match(notifications, /FulianCalendarDomain\.formatTaipeiTimestamp\(value\)/);
  assert.match(board, /內容仍在輸入框，請勿重複送出/);
  assert.match(board, /目前顯示此裝置的安全備援/);
  assert.match(notifications, /await window\.FulianAnnouncementBoard\?\.ready/);
  assert.match(html, /announcementSyncState/);
  assert.match(html, /calendar-domain\.js\?v=4/);
  assert.match(html, /announcement-board\.js\?v=3/);
  assert.ok(html.indexOf("calendar-domain.js?v=4") < html.indexOf("announcement-board.js?v=3"));
});
