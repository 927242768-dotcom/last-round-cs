import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const allowedKey = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|gif|webp|avif|mp4|webm)$/;
const maxSize = 90 * 1024 * 1024;

export async function createFileBucket(dataDir) {
  const folder = join(dataDir, 'uploads');
  await mkdir(folder, { recursive: true });
  function pathFor(key) {
    if (!allowedKey.test(key)) throw new Error('无效的媒体文件名');
    return join(folder, key);
  }
  async function head(key) {
    const path = pathFor(key);
    try {
      const [info, raw] = await Promise.all([stat(path), readFile(`${path}.json`, 'utf8')]);
      const metadata = JSON.parse(raw);
      if (!info.isFile()) return null;
      return { size: info.size, httpEtag: metadata.httpEtag, uploaded: new Date(metadata.uploaded) };
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  return {
    head,
    async get(key, options = {}) {
      const object = await head(key);
      if (!object) return null;
      const range = options.range;
      const settings = range ? { start: range.offset, end: range.offset + range.length - 1 } : {};
      return { ...object, body: Readable.toWeb(createReadStream(pathFor(key), settings)) };
    },
    async put(key, body, options = {}) {
      const destination = pathFor(key);
      const temporary = join(folder, `.${randomUUID()}.part`);
      const temporaryMetadata = `${temporary}.json`;
      const hash = createHash('sha256');
      let size = 0;
      const inspect = new Transform({
        transform(chunk, encoding, callback) {
          size += chunk.length;
          if (size > maxSize) return callback(new Error('文件超过允许大小'));
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      try {
        await pipeline(Readable.fromWeb(body), inspect, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
        const metadata = { httpEtag: `"${hash.digest('hex')}"`, uploaded: new Date().toISOString(), contentType: options.httpMetadata?.contentType };
        await writeFile(temporaryMetadata, JSON.stringify(metadata), { flag: 'wx', mode: 0o600 });
        await rename(temporary, destination);
        await rename(temporaryMetadata, `${destination}.json`);
        return { key, size, ...metadata };
      } catch (error) {
        await Promise.allSettled([unlink(temporary), unlink(temporaryMetadata)]);
        throw error;
      }
    },
  };
}
