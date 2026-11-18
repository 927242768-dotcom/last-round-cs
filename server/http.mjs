export class RequestError extends Error {
    constructor(status, message, headers) {
        super(message);
        this.status = status;
        this.headers = headers;
    }
}

export function json(value, status = 200, headers) {
    return Response.json(value, {
        status,
        headers: {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            ...headers,
        },
    });
}

export function noContent(headers) {
    return new Response(null, {
        status: 204,
        headers: { "Cache-Control": "no-store", ...headers },
    });
}

export async function readJson(request) {
    const type = request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
    if (type !== "application/json" || !request.body) {
        throw new RequestError(415, "请求需要使用 JSON 格式。");
    }

    const maxBytes = 32 * 1024;
    const reader = request.body.getReader();
    const bytes = new Uint8Array(maxBytes);
    let size = 0;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value.byteLength + size > maxBytes) {
                await reader.cancel();
                throw new RequestError(413, "请求内容过长。");
            }
            bytes.set(value, size);
            size += value.byteLength;
        }
    } finally {
        reader.releaseLock();
    }

    try {
        const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)));
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error("需要 JSON 对象");
        }
        return value;
    } catch {
        throw new RequestError(400, "请求中的 JSON 无法读取。");
    }
}
