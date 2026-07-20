import { homedir } from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const projectUrl = 'https://fahrblkukuhgveiptufn.supabase.co';
const siteUrl = `${projectUrl}/functions/v1/site`;
const publishableKey = 'sb_publishable_f5U5bDJjXjvRxYSzh7zqGQ__lF-jwPZ';
const credentialPath = process.env.FULIAN_BOOTSTRAP_CREDENTIALS
  || path.join(
    homedir(),
    'Library',
    'Application Support',
    'Fulian VP System',
    'supabase-bootstrap-credentials.txt',
  );

const credentialsText = await readFile(credentialPath, 'utf8');
const roleLabels = {
  admin: 'Admin',
  vp: '副主席',
  committee: '會員委員',
};

function credentialsFor(role) {
  const pattern = new RegExp(
    `\\(${role}\\)\\s+Email:\\s*(\\S+)\\s+Password:\\s*(\\S+)`,
  );
  const match = credentialsText.match(pattern);
  if (!match) throw new Error(`找不到 ${roleLabels[role]} 登入憑證`);
  return { email: match[1], password: match[2] };
}

async function signIn(role) {
  const credentials = credentialsFor(role);
  const response = await fetch(`${projectUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(credentials),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(`${roleLabels[role]} Auth 驗證失敗：${response.status}`);
  }
  return data.access_token;
}

async function rest(resource, accessToken) {
  const response = await fetch(`${projectUrl}/rest/v1/${resource}`, {
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${accessToken}`,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${resource} 查詢失敗：${response.status}`);
  }
  return data;
}

async function listRawReports(accessToken) {
  const response = await fetch(`${projectUrl}/storage/v1/object/list/raw-reports`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      prefix: 'imports/2026-07-20',
      limit: 100,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' },
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Private Storage 驗證失敗：${response.status}`);
  }
  return Array.isArray(data) ? data.length : 0;
}

const loginResponse = await fetch(siteUrl);
const loginHtml = await loginResponse.text();
if (
  !loginResponse.ok
  || !loginResponse.headers.get('content-type')?.includes('text/html')
  || !loginHtml.includes('assets/js/auth.js?v=5')
  || !loginHtml.includes('id="loginForm"')
) {
  throw new Error(`正式登入頁驗證失敗：${loginResponse.status}`);
}

const results = {};
for (const role of ['admin', 'vp', 'committee']) {
  const accessToken = await signIn(role);
  const [accounts, members, snapshots, rawReportObjects] = await Promise.all([
    rest('app_accounts?select=role,enabled', accessToken),
    rest(
      'members?status=eq.active&select=people!inner(display_name)&order=created_at.asc',
      accessToken,
    ),
    rest(
      'analysis_snapshots?is_published=eq.true&select=snapshot,period_start,period_end&order=period_end.desc,generated_at.desc&limit=1',
      accessToken,
    ),
    listRawReports(accessToken),
  ]);

  const account = accounts[0];
  const snapshot = snapshots[0];
  if (!account?.enabled || account.role !== role) {
    throw new Error(`${roleLabels[role]} 角色驗證不一致`);
  }
  if (members.length !== 44) {
    throw new Error(`${roleLabels[role]} 會員數不是 44`);
  }
  if (
    !snapshot?.snapshot
    || snapshot.period_start !== '2026-01-01'
    || snapshot.period_end !== '2026-06-30'
    || !snapshot.snapshot.monthlyAttendance?.['2026-06']
  ) {
    throw new Error(`${roleLabels[role]} 已發布 PALMS 快照驗證失敗`);
  }
  if (role === 'committee' && rawReportObjects !== 0) {
    throw new Error('會員委員不應看見 raw-reports 私人檔案');
  }

  results[role] = {
    role: account.role,
    members: members.length,
    analysisPeriod: `${snapshot.period_start}..${snapshot.period_end}`,
    monthlyAttendance: Object.keys(snapshot.snapshot.monthlyAttendance),
    rawReportObjectsVisible: rawReportObjects,
  };
}

console.log(JSON.stringify({
  site: {
    url: siteUrl,
    status: loginResponse.status,
    contentType: loginResponse.headers.get('content-type'),
  },
  roles: results,
}, null, 2));
