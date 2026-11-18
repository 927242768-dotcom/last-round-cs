// GitHub Pages 版后台：令牌只保留在当前页面内存，不写入仓库或浏览器存储。
(() => {
  const repository = '927242768-dotcom/927242768-dotcom.github.io';
  const branch = 'main';
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const apiRoot = `https://api.github.com/repos/${repository}`;
  let token = '';
  let queue = Promise.resolve();
  const serial = task => { const result = queue.then(task, task); queue = result.catch(() => {}); return result; };
  const failure = (message, status = 400) => Object.assign(new Error(message), { status });
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const decode = content => new TextDecoder().decode(Uint8Array.from(atob(content.replace(/\s/g, '')), char => char.charCodeAt(0)));
  async function github(path, options = {}, absolute = false) {
    const response = await nativeFetch(absolute ? path : apiRoot + path, {
      ...options,
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401) { token = ''; throw failure('GitHub 令牌无效或已过期，请重新登录。', 401); }
      if (response.status === 403) throw failure('GitHub 拒绝写入。请确认令牌仅授权本站仓库，并开启 Contents 的 Read and write 权限。', 403);
      if (response.status === 422 || response.status === 409) throw failure('仓库内容已被另一处更新，请刷新后台后重试。', 409);
      throw failure(`GitHub 请求失败（${response.status}），请稍后重试。`, response.status);
    }
    return body;
  }
  async function snapshot() {
    const ref = await github(`/git/ref/heads/${branch}`);
    const sha = ref.object.sha;
    const [commit, file] = await Promise.all([github(`/git/commits/${sha}`), github(`/contents/data/works.json?ref=${sha}`)]);
    const data = JSON.parse(decode(file.content));
    return { sha, tree: commit.tree.sha, works: data.works };
  }
  async function commitFiles(state, files, message) {
    const tree = await github('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: state.tree, tree: files.map(file => ({ mode: '100644', type: 'blob', ...file })) }) });
    const commit = await github('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [state.sha] }) });
    await github(`/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
  }
  async function saveWorks(state, works, message) {
    works.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    await commitFiles(state, [
      { path: 'data/works.json', content: JSON.stringify({ works }, null, 2) + '\n' },
      { path: 'api/works', content: JSON.stringify({ works: works.filter(work => work.published) }, null, 2) + '\n' },
    ], message);
  }
  function validate(input, current = {}) {
    const work = { ...current };
    for (const [key, limit, required] of [['title', 120, true], ['description', 3000, false], ['category', 60, true], ['poster', 2048, false], ['video', 2048, true]]) {
      const value = input[key] === undefined ? work[key] : input[key];
      if (typeof value !== 'string' || (required && !value.trim()) || [...value.trim()].length > limit) throw failure('作品内容填写不完整或超过长度限制。');
      work[key] = value.trim();
      if (['poster', 'video'].includes(key) && work[key]) {
        const address = new URL(work[key], location.origin);
        if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password || /[\u0000-\u001f\\]/.test(work[key])) throw failure('图片和视频需要使用有效的 HTTP、HTTPS 或站内地址。');
      }
    }
    work.order = input.order === undefined ? work.order : input.order;
    work.published = input.published === undefined ? work.published : input.published;
    if (!Number.isInteger(work.order) || work.order < 0 || work.order > 999999 || typeof work.published !== 'boolean') throw failure('排序或上架状态无效。');
    return work;
  }
  async function upload(request) {
    const file = await request.blob();
    const formats = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'video/mp4': 'mp4', 'video/webm': 'webm' };
    const extension = formats[file.type];
    if (!extension) throw failure('请选择支持的图片或视频格式。', 415);
    if (!file.size || file.size > 25 * 1024 * 1024) throw failure('GitHub 版单个上传文件最大 25 MiB；更大的视频可填写外部视频直链。', 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 16384) binary += String.fromCharCode(...bytes.subarray(index, index + 16384));
    const blob = await github('/git/blobs', { method: 'POST', body: JSON.stringify({ encoding: 'base64', content: btoa(binary) }) });
    const path = `media/uploads/${crypto.randomUUID()}.${extension}`;
    const state = await snapshot();
    await commitFiles(state, [{ path, sha: blob.sha }], '上传个人作品素材');
    return json({ url: `/${path}` }, 201);
  }
  async function route(request, path) {
    if (path === '/api/admin/session') {
      if (request.method === 'GET') return json({ authenticated: Boolean(token) });
      if (request.method === 'DELETE') { token = ''; return json({ authenticated: false }); }
      if (request.method === 'POST') {
        const password = (await request.json()).password;
        if (typeof password !== 'string' || !/^(github_pat_|gh[pousr]_)[A-Za-z0-9_]+$/.test(password.trim())) throw failure('此版本使用 GitHub 访问令牌登录，请按照下方说明创建令牌。', 401);
        token = password.trim();
        try {
          const profile = await github('https://api.github.com/user', {}, true);
          const repo = await github('');
          if (profile.login !== repository.split('/')[0] && !repo.permissions?.push) throw failure('此 GitHub 账户没有本站仓库的写入权限。', 403);
          await snapshot();
        } catch (error) { token = ''; throw error; }
        return json({ authenticated: true });
      }
    }
    if (!token) throw failure('请先使用本站仓库的 GitHub 令牌登录。', 401);
    if (path === '/api/admin/upload' && request.method === 'POST') return serial(() => upload(request));
    if (path === '/api/admin/works' && request.method === 'GET') return json({ works: (await snapshot()).works });
    return serial(async () => {
      const state = await snapshot();
      if (path === '/api/admin/works' && request.method === 'POST') {
        const work = { ...validate(await request.json()), id: crypto.randomUUID() };
        await saveWorks(state, [...state.works, work], `新增作品：${work.title}`);
        return json({ work }, 201);
      }
      const id = path.split('/').at(-1);
      const current = state.works.find(work => work.id === id);
      if (!current) throw failure('找不到该作品。', 404);
      if (request.method === 'PATCH') {
        const work = validate(await request.json(), current);
        await saveWorks(state, state.works.map(item => item.id === id ? work : item), `更新作品：${work.title}`);
        return json({ work });
      }
      if (request.method === 'DELETE') {
        await saveWorks(state, state.works.filter(item => item.id !== id), `删除作品：${current.title}`);
        return new Response(null, { status: 204 });
      }
      throw failure('不支持此操作。', 405);
    });
  }
  globalThis.fetch = async (input, options) => {
    const request = new Request(new URL(typeof input === 'string' ? input : input.url, location.href), options);
    const url = new URL(request.url);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/admin/')) return nativeFetch(input, options);
    try { return await route(request, url.pathname); }
    catch (error) { return json({ error: error.message || '操作失败，请重试。' }, error.status || 500); }
  };
})();
