import { RequestError } from "./http.mjs";

const cookieName = "__Host-last-round-admin";
const sessionDuration = 8 * 60 * 60;
const loginWindow = 10 * 60;
const encode = new TextEncoder();

export function requireSameOrigin(request) {
    if (request.headers.get("Origin") !== new URL(request.url).origin) {
        throw new RequestError(403, "请从当前站点的后台页面操作。");
    }
}

function hasConfig(env) {
    return typeof env.ADMIN_PASSWORD === "string" && env.ADMIN_PASSWORD.length > 0 &&
        typeof env.ADMIN_SESSION_SECRET === "string" && env.ADMIN_SESSION_SECRET.length >= 32;
}

function toBase64Url(bytes) {
    return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(value) {
    return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (char) => char.charCodeAt(0));
}

function signingKey(env) {
    return crypto.subtle.importKey(
        "raw",
        encode.encode(env.ADMIN_SESSION_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
    );
}

function sessionMessage(env, token) {
    // 更换登录密码后，已签发的会话也随即失效。
    return encode.encode(`${token}\0${env.ADMIN_PASSWORD}`);
}

function sessionCookie(token, lifetime) {
    return `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${lifetime}`;
}

export function clearSession() {
    return sessionCookie("", 0);
}

export async function authenticated(request, env) {
    if (!hasConfig(env)) return false;

    const cookies = request.headers.get("Cookie")?.split(";") ?? [];
    const cookie = cookies.map((item) => item.trim()).find((item) => item.startsWith(`${cookieName}=`));
    const token = cookie?.slice(cookieName.length + 1);
    if (!token || !/^v1\.\d{1,12}\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/u.test(token)) return false;

    const [version, expiry, nonce, signature] = token.split(".");
    if (Number(expiry) <= Math.floor(Date.now() / 1000)) return false;
    return crypto.subtle.verify(
        "HMAC",
        await signingKey(env),
        fromBase64Url(signature),
        sessionMessage(env, `${version}.${expiry}.${nonce}`),
    );
}

async function countAttempt(db, scope, windowStart) {
    const result = await db.prepare(`
        INSERT INTO admin_login_attempts (scope, window_start, attempts)
        VALUES (?, ?, 1)
        ON CONFLICT(scope) DO UPDATE SET
            attempts = CASE WHEN window_start >= excluded.window_start THEN MIN(attempts + 1, 121) ELSE 1 END,
            window_start = MAX(window_start, excluded.window_start)
        RETURNING attempts
    `).bind(scope, windowStart).first();
    return result.attempts;
}

async function enforceLoginLimit(request, env) {
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - now % loginWindow;
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const ipDigest = await crypto.subtle.sign("HMAC", await signingKey(env), encode.encode(`ip:${ip}`));
    const ipKey = `client:${toBase64Url(new Uint8Array(ipDigest))}`;
    const ipAttempts = await countAttempt(env.DB, ipKey, windowStart);
    if (ipAttempts === 1) {
        await env.DB.prepare("DELETE FROM admin_login_attempts WHERE window_start < ?")
            .bind(windowStart - loginWindow).run();
    }
    const allAttempts = ipAttempts <= 8 ? await countAttempt(env.DB, "global", windowStart) : 0;
    if (allAttempts > 120 || ipAttempts > 8) {
        throw new RequestError(429, "登录尝试次数过多，稍后再试。", {
            "Retry-After": String(windowStart + loginWindow - now),
        });
    }
}

async function passwordsMatch(password, expected) {
    const hashes = await Promise.all(
        [password, expected].map((value) => crypto.subtle.digest("SHA-256", encode.encode(value))),
    );
    const actualBytes = new Uint8Array(hashes[0]);
    const expectedBytes = new Uint8Array(hashes[1]);
    let difference = 0;
    for (let index = 0; index < actualBytes.length; index++) {
        difference |= actualBytes[index] ^ expectedBytes[index];
    }
    return difference === 0;
}

export async function createSession(request, env, password) {
    if (!hasConfig(env)) throw new RequestError(503, "后台尚未配置登录密钥。");
    if (typeof password !== "string" || password.length === 0 || password.length > 512) {
        throw new RequestError(400, "请输入管理密码。");
    }
    await enforceLoginLimit(request, env);
    if (!await passwordsMatch(password, env.ADMIN_PASSWORD)) {
        throw new RequestError(401, "管理密码不正确。");
    }

    const expiry = Math.floor(Date.now() / 1000) + sessionDuration;
    const token = `v1.${expiry}.${crypto.randomUUID()}`;
    const digest = await crypto.subtle.sign("HMAC", await signingKey(env), sessionMessage(env, token));
    return sessionCookie(`${token}.${toBase64Url(new Uint8Array(digest))}`, sessionDuration);
}
