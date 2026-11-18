import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
assert.equal(Number(process.versions.node.split('.')[0]), 24, '请使用 Node.js 24.x');

async function filesIn(folder) {
  const result = [];
  for (const entry of await readdir(resolve(root, folder), { withFileTypes: true })) {
    const name = `${folder}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await filesIn(name));
    else if (entry.isFile()) result.push(name);
  }
  return result;
}

for (const file of ['README.md', 'LICENSE', '.env.example', 'Dockerfile', 'public/index.html', 'public/admin.html', 'hosting/server.mjs', 'drizzle/0001_works.sql']) {
  await access(resolve(root, file));
}
JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));

const sourceFiles = (await Promise.all(['public', 'server', 'hosting', 'scripts'].map(filesIn))).flat();
const scripts = sourceFiles.filter(file => ['.js', '.mjs'].includes(extname(file)));
for (const script of scripts) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, script)], { encoding: 'utf8', timeout: 10000 });
  if (result.status !== 0) throw new Error(`语法检查失败：${script}\n${result.stderr || result.error || ''}`);
}

const documents = ['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md', ...(await filesIn('docs')).filter(file => file.endsWith('.md'))];
let checkedLinks = 0;
for (const file of documents) {
  const text = (await readFile(resolve(root, file), 'utf8')).replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '');
  const links = [...text.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)].map(match => match[1]);
  links.push(...[...text.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]));
  for (const link of links) {
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(link)) continue;
    const path = decodeURIComponent(link.split(/[?#]/)[0]);
    if (!path) continue;
    const target = path.startsWith('/') ? resolve(root, `.${path}`) : resolve(root, dirname(file), path);
    try { await access(target); } catch { throw new Error(`文档链接不存在：${file} → ${link}`); }
    checkedLinks++;
  }
}
console.log(`检查通过：${scripts.length} 个脚本，${documents.length} 份文档，${checkedLinks} 个本地链接。`);
