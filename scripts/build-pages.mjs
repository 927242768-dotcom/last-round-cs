import { cp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initialWorks } from '../server/seed.mjs';

const folder = resolve(process.argv[2] || '.local/pages-source');
await mkdir(folder, { recursive: true });
await cp('public', folder, { recursive: true });
await mkdir(`${folder}/api`, { recursive: true });
await mkdir(`${folder}/data`, { recursive: true });
await mkdir(`${folder}/admin`, { recursive: true });
await writeFile(`${folder}/.nojekyll`, '');
// 反复构建时保留后台已经保存的作品。
let works = initialWorks;
try { works = JSON.parse(await readFile(`${folder}/data/works.json`, 'utf8')).works; } catch {}
await writeFile(`${folder}/api/works`, JSON.stringify({ works: works.filter(work => work.published) }, null, 2));
await writeFile(`${folder}/data/works.json`, JSON.stringify({ works }, null, 2));
await cp('hosting/pages-admin.js', `${folder}/github-backend.js`);
let main = await readFile(`${folder}/main.js`, 'utf8');
main = main.replace("url.pathname = '/api/replay/' + example[1]", "url.pathname = '/media/' + example[1]");
await writeFile(`${folder}/main.js`, main);
let admin = await readFile(`${folder}/admin.html`, 'utf8');
admin = admin.replace('<script src="/admin.js" defer></script>', '<script src="/github-backend.js" defer></script>\n  <script src="/admin.js" defer></script>');
admin = admin.replace('输入管理密码进入后台。', '使用本站仓库的 GitHub 访问令牌登录。');
admin = admin.replace('<span>管理密码</span>', '<span>GitHub 访问令牌</span>');
admin = admin.replace('autocomplete="current-password"', 'autocomplete="off" placeholder="github_pat_…"');
admin = admin.replace('</form>\n    </section>', `</form>\n      <details class="muted" style="margin-top:24px;line-height:1.8"><summary>首次登录：创建本站专用令牌</summary><p>打开<a href="https://github.com/settings/personal-access-tokens/new?name=LAST%20ROUND%20Admin&amp;target_name=927242768-dotcom&amp;contents=write&amp;metadata=read&amp;expires_in=30" target="_blank" rel="noopener noreferrer"> GitHub 令牌设置</a>，在 Repository access 中选择 Only select repositories，仅选择 <strong>927242768-dotcom.github.io</strong>，并确认 Contents 为 Read and write。生成后复制到上方登录。</p><p>令牌仅保留在当前页面内存，刷新或退出后清除。作品保存在你的 GitHub 仓库，保存后需等待 GitHub 完成网站发布。草稿不在前台展示，但公开仓库中的文件仍可被访问。</p></details>\n    </section>`);
await writeFile(`${folder}/admin.html`, admin);
await writeFile(`${folder}/admin/index.html`, admin);
let adminJs = await readFile(`${folder}/admin.js`, 'utf8');
adminJs = adminJs.replaceAll('90 * 1024 * 1024', '25 * 1024 * 1024').replaceAll('90 MiB', '25 MiB');
adminJs = adminJs.replace('已保存「${saved.title}」。', '已保存「${saved.title}」。网站将在 GitHub 发布完成后更新。');
await writeFile(`${folder}/admin.js`, adminJs);
console.log('GitHub Pages 发布文件已生成。');
