import { authenticated, clearSession, createSession, requireSameOrigin } from "./auth.mjs";
import { json, noContent, readJson, RequestError } from "./http.mjs";
import { serveMedia, uploadMedia } from "./media.mjs";
import { addWork, deleteWork, listWorks, updateWork } from "./works.mjs";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const mediaPath = new RegExp(`^/api/media/(${UUID}\\.(?:jpg|png|gif|webp|avif|mp4|webm))$`, "u");
const workPath = new RegExp(`^/api/admin/works/(round-0[12]|${UUID})$`, "u");

function methodNotAllowed(allowed) {
    throw new RequestError(405, "此接口不支持该请求方式。", { Allow: allowed });
}

async function sessionRoute(request, env) {
    if (request.method === "GET") {
        return json({ authenticated: await authenticated(request, env) });
    }
    if (request.method === "POST") {
        const { password } = await readJson(request);
        const cookie = await createSession(request, env, password);
        return json({ authenticated: true }, 200, { "Set-Cookie": cookie });
    }
    if (request.method === "DELETE") {
        return json({ authenticated: false }, 200, { "Set-Cookie": clearSession() });
    }
    return methodNotAllowed("GET, POST, DELETE");
}

async function listRoute(request, env) {
    if (request.method === "GET") return json({ works: await listWorks(env.DB, false) });
    if (request.method === "POST") {
        return json({ work: await addWork(env.DB, await readJson(request)) }, 201);
    }
    return methodNotAllowed("GET, POST");
}

async function workRoute(request, env, id) {
    if (request.method === "PATCH") {
        return json({ work: await updateWork(env.DB, id, await readJson(request)) });
    }
    if (request.method === "DELETE") {
        await deleteWork(env.DB, id);
        return noContent();
    }
    return methodNotAllowed("PATCH, DELETE");
}

async function adminRoute(request, env, path) {
    if (request.method !== "GET") requireSameOrigin(request);
    if (path === "/api/admin/session") return sessionRoute(request, env);
    if (!await authenticated(request, env)) throw new RequestError(401, "请先登录后台。");
    if (path === "/api/admin/works") return listRoute(request, env);
    if (path === "/api/admin/upload") {
        if (request.method !== "POST") return methodNotAllowed("POST");
        return json({ url: await uploadMedia(request, env.BUCKET) }, 201);
    }
    const work = workPath.exec(path);
    if (work) return workRoute(request, env, work[1]);
    throw new RequestError(404, "此接口不存在。");
}

async function apiRoute(request, env, path) {
    if (path === "/api/works") {
        if (request.method !== "GET") return methodNotAllowed("GET");
        return json({ works: await listWorks(env.DB, true) });
    }
    if (path.startsWith("/api/admin/")) return adminRoute(request, env, path);
    const media = mediaPath.exec(path);
    if (media) {
        if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed("GET, HEAD");
        return serveMedia(request, env.BUCKET, media[1]);
    }
    throw new RequestError(404, "此接口不存在。");
}

export async function handleApi(request, env) {
    const path = new URL(request.url).pathname;
    if (path !== "/api" && !path.startsWith("/api/")) return null;

    try {
        return await apiRoute(request, env, path);
    } catch (error) {
        if (error instanceof RequestError) return json({ error: error.message }, error.status, error.headers);
        console.error("作品接口请求失败", request.method, path.split("/").slice(0, 4).join("/"), error?.name);
        return json({ error: "服务暂时不可用，请稍后重试。" }, 500);
    }
}
