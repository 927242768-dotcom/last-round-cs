import http from 'node:http';
import { isIP } from 'node:net';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { handleApi } from '../server/api.mjs';
import { getByteRange } from '../server/media.mjs';
import { openDatabase } from './sqlite.mjs';
import { createFileBucket } from './files.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const port = Number(process.env.PORT || 3000);
const dataDir = resolve(process.env.DATA_DIR || './.local/data');
const origin = new URL(process.env.PUBLIC_URL || (process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://127.0.0.1:${port}`)).origin;
if (!process.env.ADMIN_PASSWORD || (process.env.ADMIN_SESSION_SECRET || '').length < 32) {
  throw new Error('请配置后台密码和至少32字符的会话密钥。');
}
const env = { ...process.env, DB: await openDatabase(dataDir), BUCKET: await createFileBucket(dataDir) };
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
};

async function staticResponse(request, pathname) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return new Response('Bad Request', { status: 400 }); }
  if (decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').some(part => part.startsWith('.'))) return new Response('Not Found', { status: 404 });
  const page = decoded === '/' ? '/index.html' : ['/admin', '/admin/'].includes(decoded) ? '/admin.html' : decoded;
  const path = resolve(root, `.${page}`);
  if (!path.startsWith(root + sep)) return new Response('Not Found', { status: 404 });
  let info;
  try { info = await stat(path); } catch (error) { if (['ENOENT', 'ENOTDIR'].includes(error.code)) return new Response('Not Found', { status: 404 }); throw error; }
  if (!info.isFile()) return new Response('Not Found', { status: 404 });
  const etag = `"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`;
  const headers = new Headers({
    'Content-Type': types[extname(path).toLowerCase()] || 'application/octet-stream',
    'Accept-Ranges': 'bytes', ETag: etag, 'Last-Modified': info.mtime.toUTCString(),
    'Cache-Control': /\.(html|css|js)$/.test(path) ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  });
  if (page === '/admin.html') { headers.set('Cache-Control', 'no-store'); headers.set('X-Robots-Tag', 'noindex'); }
  if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers });
  let range;
  const requested = request.headers.get('Range');
  const validator = request.headers.get('If-Range');
  if (request.method === 'GET' && requested && (!validator || validator === etag || Date.parse(validator) >= Math.floor(info.mtimeMs / 1000) * 1000)) {
    range = getByteRange(requested, info.size);
    if (!range) { headers.set('Content-Range', `bytes */${info.size}`); return new Response(null, { status: 416, headers }); }
    headers.set('Content-Range', `bytes ${range.offset}-${range.last}/${info.size}`);
  }
  headers.set('Content-Length', String(range?.length ?? info.size));
  if (request.method === 'HEAD') return new Response(null, { headers });
  const stream = createReadStream(path, range ? { start: range.offset, end: range.last } : {});
  return new Response(Readable.toWeb(stream), { status: range ? 206 : 200, headers });
}

const server = http.createServer(async (incoming, outgoing) => {
  const abort = new AbortController();
  incoming.once('aborted', () => abort.abort());
  outgoing.once('close', () => { if (!outgoing.writableFinished) abort.abort(); });
  try {
    if (!incoming.url?.startsWith('/') || incoming.url.startsWith('//')) { outgoing.writeHead(400).end(); return; }
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (value !== undefined && !['host', 'connection', 'transfer-encoding', 'cf-connecting-ip'].includes(key)) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
    // 在 Railway 边缘之后取其追加的最后一跳地址；不接受客户端伪造的 CF 头。
    const forwarded = process.env.RAILWAY_PROJECT_ID ? incoming.headers['x-forwarded-for']?.split(',').at(-1)?.trim() : null;
    headers.set('CF-Connecting-IP', forwarded && isIP(forwarded) ? forwarded : incoming.socket.remoteAddress || 'unknown');
    const options = { method: incoming.method, headers, signal: abort.signal };
    if (!['GET', 'HEAD'].includes(incoming.method)) { options.body = Readable.toWeb(incoming); options.duplex = 'half'; }
    const request = new Request(origin + incoming.url, options);
    const pathname = new URL(request.url).pathname;
    const replay = /^\/api\/replay\/(round-0[12]\.mp4)$/.exec(pathname);
    const response = replay ? await staticResponse(request, `/media/${replay[1]}`)
      : await handleApi(request, env) || await staticResponse(request, pathname);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (!response.body || incoming.method === 'HEAD') outgoing.end();
    else await pipeline(Readable.fromWeb(response.body), outgoing);
  } catch (error) {
    if (abort.signal.aborted) return;
    console.error('请求处理失败', error.name, error.message);
    if (!outgoing.headersSent) outgoing.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: '服务暂时不可用，请稍后重试。' }));
    else outgoing.destroy();
  }
});
server.requestTimeout = 180000;
server.listen(port, '0.0.0.0', () => console.log(`LAST ROUND 已启动，监听端口 ${port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  server.close(() => { env.DB.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 10000).unref();
});
