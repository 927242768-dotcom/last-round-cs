import { RequestError } from "./http.mjs";
import { initialWorks } from "./seed.mjs";

const seedFlag = "initial-works-v1";
const fields = {
    title: "title",
    description: "description",
    category: "category",
    poster: "poster",
    video: "video",
    order: "sort_order",
    published: "published",
};

function publicWork(row) {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        category: row.category,
        poster: row.poster,
        video: row.video,
        order: row.sort_order,
        published: Boolean(row.published),
    };
}

function workValues(work) {
    return [work.id, work.title, work.description, work.category, work.poster, work.video, work.order, Number(work.published)];
}

function initializeWorks(db, works) {
    // 初始化标记与初始记录写在同一事务，后台删除作品后不会自动恢复。
    const insert = db.prepare(`
        INSERT OR IGNORE INTO works
            (id, title, description, category, poster, video, sort_order, published)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM site_state WHERE name = ?)
    `);
    return db.batch([
        ...works.map((work) => insert.bind(...workValues(work), seedFlag)),
        db.prepare("INSERT OR IGNORE INTO site_state (name) VALUES (?)").bind(seedFlag),
    ]);
}

export async function listWorks(db, publishedOnly) {
    const seed = await db.prepare("SELECT 1 FROM site_state WHERE name = ?").bind(seedFlag).first();
    if (!seed) await initializeWorks(db, initialWorks);

    const query = publishedOnly
        ? "SELECT * FROM works WHERE published = 1 ORDER BY sort_order, created_at, id"
        : "SELECT * FROM works ORDER BY sort_order, created_at, id";
    const { results } = await db.prepare(query).all();
    return results.map(publicWork);
}

function checkedText(value, label, limit, required = true) {
    if (typeof value !== "string") {
        throw new RequestError(400, `${label}需要填写文本。`);
    }
    const text = value.trim();
    if ((required && !text) || [...text].length > limit || text.includes("\0")) {
        const range = required ? `需要填写，最长 ${limit} 字` : `最长 ${limit} 字`;
        throw new RequestError(400, `${label}${range}。`);
    }
    return text;
}

function checkedUrl(value, label, required) {
    const url = checkedText(value, label, 2048, required);
    if (!url) return url;

    // 站内绝对路径与普通网络链接可直接用于图片和视频地址。
    if (/[\u0000-\u001f\u007f\\]/u.test(url)) {
        throw new RequestError(400, `${label}地址包含无效字符。`);
    }
    if (url.startsWith("/") && !url.startsWith("//")) return url;

    try {
        const parsed = new URL(url);
        if (/^https?:\/\//i.test(url) && !parsed.username && !parsed.password) return url;
    } catch {
        // 统一返回可直接显示的链接格式错误。
    }
    throw new RequestError(400, `${label}需要使用 HTTP、HTTPS 或站内路径。`);
}

function validateFields(body, partial) {
    const validators = {
        title: (value) => checkedText(value, "标题", 120),
        description: (value) => checkedText(value, "简介", 3000, false),
        category: (value) => checkedText(value, "分类", 60),
        poster: (value) => checkedUrl(value, "封面", false),
        video: (value) => checkedUrl(value, "视频", true),
        order: (value) => {
            if (!Number.isInteger(value) || value < 0 || value > 999999) {
                throw new RequestError(400, "排序需要填写 0 到 999999 之间的整数。");
            }
            return value;
        },
        published: (value) => {
            if (typeof value !== "boolean") {
                throw new RequestError(400, "公开状态需要使用布尔值。");
            }
            return value;
        },
    };
    const defaults = { description: "", poster: "", order: 0, published: false };
    const validated = {};
    for (const [name, validate] of Object.entries(validators)) {
        if (Object.hasOwn(body, name)) validated[name] = validate(body[name]);
        else if (!partial) validated[name] = validate(defaults[name]);
    }
    return validated;
}

export async function addWork(db, body) {
    const work = { id: crypto.randomUUID(), ...validateFields(body, false) };
    await db.prepare(`
        INSERT INTO works (id, title, description, category, poster, video, sort_order, published)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(...workValues(work)).run();
    return work;
}

export async function updateWork(db, id, body) {
    const updates = Object.entries(validateFields(body, true));
    if (updates.length === 0) throw new RequestError(400, "请提供需要修改的作品内容。");

    const assignments = updates.map(([name]) => `${fields[name]} = ?`);
    const values = updates.map(([name, value]) => name === "published" ? Number(value) : value);
    const row = await db.prepare(`UPDATE works SET ${assignments.join(", ")} WHERE id = ? RETURNING *`)
        .bind(...values, id).first();
    if (!row) throw new RequestError(404, "找不到这条作品。");
    return publicWork(row);
}

export async function deleteWork(db, id) {
    const { meta } = await db.prepare("DELETE FROM works WHERE id = ?").bind(id).run();
    if (!meta.changes) throw new RequestError(404, "找不到这条作品。");
}
