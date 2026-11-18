import { RequestError } from "./http.mjs";

const maxUpload = 90 * 1024 * 1024;
const requiredPrefix = 128;
const decode = new TextDecoder();

function ascii(bytes, offset, size) {
    return decode.decode(bytes.subarray(offset, offset + size));
}

const formats = new Map([
    ["image/jpeg", { extension: "jpg", matches: (p) => p[0] === 255 && p[1] === 216 && p[2] === 255 }],
    ["image/png", { extension: "png", matches: (p) => p[0] === 137 && ascii(p, 1, 7) === "PNG\r\n\x1a\n" }],
    ["image/gif", { extension: "gif", matches: (p) => /^GIF8[79]a$/u.test(ascii(p, 0, 6)) }],
    ["image/webp", { extension: "webp", matches: (p) => ascii(p, 0, 4) === "RIFF" && ascii(p, 8, 4) === "WEBP" }],
    ["image/avif", { extension: "avif", matches: (p) => ascii(p, 4, 4) === "ftyp" && /^avi[fs]$/u.test(ascii(p, 8, 4)) }],
    ["video/mp4", {
        extension: "mp4",
        matches: (p) => ascii(p, 4, 4) === "ftyp" && !/^(avi[fs]|mif1|heic|heix)$/u.test(ascii(p, 8, 4)),
    }],
    ["video/webm", {
        extension: "webm",
        matches: (p) => p[0] === 0x1a && p[1] === 0x45 && p[2] === 0xdf && p[3] === 0xa3 &&
            ascii(p, 0, requiredPrefix).includes("webm"),
    }],
]);

const typesByExtension = new Map(Array.from(formats, ([type, format]) => [format.extension, type]));

async function validatedStream(body, length, format) {
    const reader = body.getReader();
    const prefix = new Uint8Array(Math.min(length, requiredPrefix));
    const queued = [];
    let size = 0;
    try {
        while (size < prefix.length) {
            const chunk = await reader.read();
            if (chunk.done) throw new RequestError(400, "上传内容不完整。");
            const remaining = prefix.length - size;
            const fromChunk = chunk.value.subarray(0, remaining);
            prefix.set(fromChunk, size);
            size += fromChunk.length;
            queued.push(chunk.value);
        }
        if (!format.matches(prefix)) throw new RequestError(415, "文件内容与所选格式不一致。");
    } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
    }

    return new ReadableStream({
        async pull(controller) {
            if (queued.length) {
                controller.enqueue(queued.shift());
                return;
            }
            const { value, done } = await reader.read();
            if (done) controller.close();
            else controller.enqueue(value);
        },
        cancel(reason) {
            return reader.cancel(reason);
        },
    });
}

export async function uploadMedia(request, bucket) {
    const type = request.headers.get("Content-Type")?.trim().toLowerCase();
    const format = formats.get(type);
    if (!format || !request.body || request.headers.has("Content-Encoding")) {
        throw new RequestError(415, "请上传 JPG、PNG、WebP、AVIF、GIF、MP4 或 WebM 文件。");
    }
    const declaredLength = request.headers.get("Content-Length") ?? "";
    if (!/^\d+$/u.test(declaredLength)) {
        throw new RequestError(411, "无法确认上传大小，请重新选择文件。");
    }
    const length = Number(declaredLength);
    if (length < 12) throw new RequestError(400, "上传文件不完整。");
    if (length > maxUpload) throw new RequestError(413, "每个文件最多 90 MiB。");

    const input = await validatedStream(request.body, length, format);
    const output = new FixedLengthStream(length);
    const objectKey = `${crypto.randomUUID()}.${format.extension}`;
    const abort = new AbortController();
    // 固定长度流使 Worker 无需把整段视频缓冲到内存。
    const pump = input.pipeTo(output.writable, { signal: abort.signal });
    const put = Promise.resolve().then(() => {
        return bucket.put(objectKey, output.readable, { httpMetadata: { contentType: type } });
    });
    try {
        await Promise.all([pump, put]);
    } catch (error) {
        abort.abort();
        await Promise.allSettled([pump, put]);
        throw error;
    }
    return `/api/media/${objectKey}`;
}

export function getByteRange(header, size) {
    const match = /^bytes=(\d*)-(\d*)$/iu.exec(header.trim());
    if (!match || (!match[1] && !match[2])) return null;

    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const last = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
    return start <= last ? { offset: start, length: last - start + 1, last } : null;
}

function matchesValidator(header, object) {
    if (!header) return true;
    if (header.startsWith('"') || header.startsWith("W/")) return header === object.httpEtag;
    const date = Date.parse(header);
    return Number.isFinite(date) && Math.floor(object.uploaded.getTime() / 1000) <= Math.floor(date / 1000);
}

export async function serveMedia(request, bucket, key) {
    const object = await bucket.head(key);
    if (!object) throw new RequestError(404, "找不到该媒体。");

    const headers = new Headers({
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Disposition": "inline",
        "Content-Type": typesByExtension.get(key.split(".").pop()),
        "ETag": object.httpEtag,
        "Last-Modified": object.uploaded.toUTCString(),
        "X-Content-Type-Options": "nosniff",
    });
    const etags = request.headers.get("If-None-Match")?.split(",").map((part) => part.trim().replace(/^W\//u, ""));
    if (etags?.some((etag) => etag === "*" || etag === object.httpEtag)) {
        return new Response(null, { status: 304, headers });
    }

    const rangeHeader = request.headers.get("Range");
    let range = null;
    if (request.method === "GET" && /^bytes=/iu.test(rangeHeader ?? "") &&
        matchesValidator(request.headers.get("If-Range"), object)) {
        range = getByteRange(rangeHeader, object.size);
        if (!range) {
            headers.set("Content-Range", `bytes */${object.size}`);
            return new Response(null, { status: 416, headers });
        }
        headers.set("Content-Range", `bytes ${range.offset}-${range.last}/${object.size}`);
    }

    headers.set("Content-Length", String(range?.length ?? object.size));
    if (request.method === "HEAD") return new Response(null, { headers });
    const data = range
        ? await bucket.get(key, { range: { offset: range.offset, length: range.length } })
        : await bucket.get(key);
    if (!data) throw new RequestError(404, "找不到该媒体。");
    return new Response(data.body, { status: range ? 206 : 200, headers });
}
