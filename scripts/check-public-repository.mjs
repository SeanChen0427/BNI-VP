import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const candidateOutput = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: repositoryRoot },
);
const candidates = candidateOutput.toString('utf8').split('\0').filter(Boolean);
const violations = [];

const forbiddenPaths = [
  /^apps\/bni-analysis\/data\//,
  /^apps\/bni-analysis\/index\.html$/,
  /^apps\/vice-chair-web\//,
  /^apps\/vice-chair\/data\//,
  /(^|\/)(uploads|backups|exports)\//,
  /(^|\/)\.env($|\.)/,
];
const forbiddenExtensions = /\.(xls|xlsx|csv|key|enc)$/i;
const textExtensions = new Set([
  '', '.css', '.html', '.js', '.json', '.md', '.mjs', '.toml', '.ts', '.tsx',
  '.txt', '.yml', '.yaml',
]);

let memberNames = [];
try {
  const memberFile = JSON.parse(await readFile(
    path.join(
      repositoryRoot,
      'apps',
      'bni-analysis',
      'data',
      'reference',
      'current-members.json',
    ),
    'utf8',
  ));
  memberNames = (memberFile.members || [])
    .map((member) => String(member.name || '').trim())
    .filter(Boolean);
} catch {
  // Private validation data is intentionally absent in clean GitHub checkouts.
}

function isServiceRoleJwt(candidate) {
  const parts = candidate.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

for (const relativePath of candidates) {
  if (
    forbiddenPaths.some((pattern) => pattern.test(relativePath))
    || forbiddenExtensions.test(relativePath)
  ) {
    violations.push(`${relativePath}: forbidden public repository path`);
    continue;
  }

  if (!textExtensions.has(path.extname(relativePath).toLowerCase())) continue;

  const text = await readFile(path.join(repositoryRoot, relativePath), 'utf8');
  const secretPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bghp_[A-Za-z0-9]{20,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
    /\bsb_secret_[A-Za-z0-9_-]{12,}\b/,
  ];
  if (secretPatterns.some((pattern) => pattern.test(text))) {
    violations.push(`${relativePath}: possible secret`);
  }

  const jwtCandidates = text.match(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g) || [];
  if (jwtCandidates.some(isServiceRoleJwt)) {
    violations.push(`${relativePath}: Supabase service_role JWT`);
  }

  const matchedMembers = memberNames.filter((name) => text.includes(name));
  if (matchedMembers.length) {
    violations.push(
      `${relativePath}: contains ${matchedMembers.length} current member name(s)`,
    );
  }
}

if (violations.length) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log(`Public repository check passed for ${candidates.length} files.`);
