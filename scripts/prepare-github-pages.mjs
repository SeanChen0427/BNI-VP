import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const sourceRoot = path.join(repositoryRoot, 'apps', 'vice-chair');
const outputRoot = path.join(repositoryRoot, 'dist', 'github-pages');

const browserServices = [
  'case-files.js',
  'interview-completion.js',
  'test-data-reset.js',
];
const forbiddenExtensions = new Set(['.xls', '.xlsx', '.csv', '.env', '.key', '.enc']);
const forbiddenPathParts = new Set([
  'data',
  'uploads',
  'backups',
  'exports',
  'tests',
]);

async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(absolutePath, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const rootEntries = await readdir(sourceRoot, { withFileTypes: true });
for (const entry of rootEntries) {
  if (
    entry.isFile()
    && entry.name.endsWith('.html')
    && entry.name !== 'dashboard-preview-temp.html'
  ) {
    await cp(path.join(sourceRoot, entry.name), path.join(outputRoot, entry.name));
  }
}

for (const directory of ['assets', 'core', 'vendor']) {
  await cp(
    path.join(sourceRoot, directory),
    path.join(outputRoot, directory),
    { recursive: true },
  );
}

await mkdir(path.join(outputRoot, 'services'), { recursive: true });
for (const filename of browserServices) {
  await cp(
    path.join(sourceRoot, 'services', filename),
    path.join(outputRoot, 'services', filename),
  );
}
await writeFile(path.join(outputRoot, '.nojekyll'), '');

const outputFiles = await listFiles(outputRoot);
for (const relativePath of outputFiles) {
  const segments = relativePath.split('/');
  const extension = path.extname(relativePath).toLowerCase();
  if (
    forbiddenExtensions.has(extension)
    || relativePath.startsWith('docs/')
    || segments.some((segment) => forbiddenPathParts.has(segment))
  ) {
    throw new Error(`Forbidden GitHub Pages asset: ${relativePath}`);
  }
}

for (const required of [
  'index.html',
  'login.html',
  'assets/js/auth.js',
  'assets/js/supabase-config.js',
  'assets/js/supabase-data.js',
]) {
  if (!outputFiles.includes(required)) {
    throw new Error(`Missing required GitHub Pages asset: ${required}`);
  }
}

const memberDirectory = await readFile(
  path.join(outputRoot, 'assets', 'js', 'member-directory.js'),
  'utf8',
);
if (
  !memberDirectory.includes('FulianData.getMemberNames')
  || /members\s*[:=]\s*\[[^\]]+\]/s.test(memberDirectory)
) {
  throw new Error('Public member directory must load names from Supabase.');
}

console.log(`Prepared ${outputFiles.length} public frontend files in dist/github-pages`);
