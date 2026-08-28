import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const faviconPath = path.join(appRoot, 'assets', 'images', 'fulian-favicon.png');

test('正式前台頁面都使用富聯 favicon 與 Apple Touch Icon', async () => {
  const pages = (await readdir(appRoot))
    .filter((name) => name.endsWith('.html') && name !== 'dashboard-preview-temp.html');

  assert.equal(pages.length, 22);
  for (const page of pages) {
    const html = await readFile(path.join(appRoot, page), 'utf8');
    assert.match(html, /<link rel="icon" type="image\/png" sizes="512x512" href="assets\/images\/fulian-favicon\.png">/, page);
    assert.match(html, /<link rel="apple-touch-icon" href="assets\/images\/fulian-favicon\.png">/, page);
  }
});

test('favicon 是可發布的 PNG 圖檔', async () => {
  const metadata = await stat(faviconPath);
  const file = await readFile(faviconPath);

  assert.ok(metadata.size > 1_000);
  assert.deepEqual([...file.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test('桌機側欄、手機選單、登入與課程入口都顯示富聯 Logo', async () => {
  for (const page of ['index.html', 'login.html', 'course.html']) {
    const html = await readFile(path.join(appRoot, page), 'utf8');
    assert.match(html, /<img class="[^"]*brand-logo[^"]*" src="assets\/images\/fulian-favicon\.png" alt="富聯分會">/, page);
  }

  const workspaceNav = await readFile(path.join(appRoot, 'assets', 'js', 'workspace-nav.js'), 'utf8');
  assert.match(workspaceNav, /<img class="workspace-menu-brand" src="assets\/images\/fulian-favicon\.png" alt="富聯分會">/);
  assert.doesNotMatch(workspaceNav, /workspace-menu-brand">富</);
});
