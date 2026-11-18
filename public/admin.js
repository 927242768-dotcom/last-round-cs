"use strict";

const find = (id) => document.getElementById(id);
const loginPanel = find("login-panel");
const loginForm = find("login-form");
const dashboard = find("dashboard");
const pageState = find("page-state");
const retry = find("retry");
const logout = find("logout");
const dashboardMessage = find("dashboard-message");
const worksList = find("works-list");
const editor = find("editor");
const workForm = find("work-form");
const newWork = find("new-work");
const saveWork = find("save-work");
const deleteDialog = find("delete-dialog");
const deleteForm = find("delete-form");
const confirmDelete = find("confirm-delete");

const sessionRoute = "/api/admin/session";
const worksRoute = "/api/admin/works";
const uploadRoute = "/api/admin/upload";
const media = {
  poster: {
    file: find("poster-file"),
    input: workForm.elements.poster,
    message: find("poster-feedback"),
    allowed: ["image/webp", "image/jpeg", "image/png", "image/avif", "image/gif"],
    formatHint: "请选择 JPG、PNG、WebP、AVIF 或 GIF 图片。",
    busy: false,
  },
  video: {
    file: find("video-file"),
    input: workForm.elements.video,
    message: find("video-feedback"),
    allowed: ["video/mp4", "video/webm"],
    formatHint: "请选择 MP4 或 WebM 视频。",
    busy: false,
  },
};

let authenticated = false;
let works = [];
let editing = null;
let deleting = null;
let initializationPending = false;
let editorSaving = false;
let deletePending = false;
const togglesPending = new Set();

function feedback(node, message = "", kind = "") {
  node.textContent = message;
  node.dataset.kind = kind;
  node.hidden = message.length === 0;
}

async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { cache: "no-store", credentials: "same-origin", ...options });
  } catch {
    throw new Error("无法连接服务器，请检查网络并重试。");
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await response.json().catch(() => null) : null;
  if (!response.ok) {
    const fallback = response.status === 413 ? "文件过大，上传请求被拒绝。" : `请求失败（${response.status}），请重试。`;
    const error = new Error(typeof body?.error === "string" ? body.error : fallback);
    error.status = response.status;
    throw error;
  }
  return body;
}

function jsonRequest(url, method, body) {
  return request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function showLogin(message = "") {
  authenticated = false;
  works = [];
  editor.close();
  deleteDialog.close();
  worksList.replaceChildren();
  dashboard.hidden = true;
  pageState.hidden = true;
  logout.hidden = true;
  loginPanel.hidden = false;
  loginForm.reset();
  feedback(find("login-message"), message, message ? "error" : "");
  find("password").focus();
}

function handleOperationError(error, location) {
  if (error.status === 401) {
    if (authenticated) showLogin("登录状态已过期，请重新登录。");
    return;
  }
  feedback(location, error.message, "error");
}

async function initialize() {
  if (initializationPending) return;
  initializationPending = true;
  pageState.hidden = false;
  retry.hidden = true;
  loginPanel.hidden = true;
  dashboard.hidden = true;
  feedback(find("page-state-message"), "正在检查登录状态…");

  try {
    const session = await request(sessionRoute);
    if (typeof session?.authenticated !== "boolean") throw new Error("无法读取登录状态，请重试。");
    if (!session.authenticated) {
      showLogin();
      return;
    }

    authenticated = true;
    logout.hidden = false;
    logout.disabled = true;
    feedback(find("page-state-message"), "正在加载作品…");
    const response = await request(worksRoute);
    if (!Array.isArray(response?.works)) throw new Error("无法读取作品列表，请重试。");
    works = response.works;
    renderWorks();
    feedback(dashboardMessage);
    pageState.hidden = true;
    dashboard.hidden = false;
  } catch (error) {
    if (error.status === 401) {
      showLogin("登录状态已过期，请重新登录。");
    } else {
      feedback(find("page-state-message"), error.message, "error");
      retry.hidden = false;
    }
  } finally {
    initializationPending = false;
    logout.disabled = false;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = find("signin");
  if (button.disabled) return;
  button.disabled = true;
  feedback(find("login-message"), "正在登录…");

  try {
    await jsonRequest(sessionRoute, "POST", { password: find("password").value });
    loginForm.reset();
    await initialize();
    if (!dashboard.hidden) newWork.focus();
  } catch (error) {
    feedback(find("login-message"), error.message, "error");
    find("password").focus();
    find("password").select();
  } finally {
    button.disabled = false;
  }
});

retry.addEventListener("click", initialize);

logout.addEventListener("click", async () => {
  if (logout.disabled) return;
  logout.disabled = true;
  dashboard.inert = true;
  const message = dashboard.hidden ? find("page-state-message") : dashboardMessage;
  feedback(message, "正在退出…");

  try {
    await request(sessionRoute, { method: "DELETE" });
    showLogin();
  } catch (error) {
    handleOperationError(error, message);
  } finally {
    logout.disabled = false;
    dashboard.inert = false;
  }
});

function compareWorks(first, second) {
  return first.order - second.order;
}

function validMediaUrl(input) {
  if (!input || /[\u0000-\u001f\u007f\\]/u.test(input) || input.startsWith("//")) return false;
  try {
    const url = new URL(input, location.origin);
    if (input.startsWith("/")) return url.origin === location.origin;
    return /^https?:\/\//i.test(input) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function renderWorks(focusId, focusAction) {
  const publishedCount = works.filter((work) => work.published).length;
  find("works-summary").textContent = `共 ${works.length} 项 · ${publishedCount} 项已上架`;

  if (works.length === 0) {
    const empty = document.createElement("p");
    empty.className = "panel empty";
    empty.textContent = "暂无作品。新增作品后即可在这里编辑和上架。";
    worksList.replaceChildren(empty);
    if (focusAction) newWork.focus();
    return;
  }

  const template = find("work-card-template");
  const cards = document.createDocumentFragment();
  let focusTarget;

  for (const work of works.slice().sort(compareWorks)) {
    const card = template.content.firstElementChild.cloneNode(true);
    card.dataset.id = work.id;
    card.querySelector(".work-title").textContent = work.title;
    card.querySelector(".work-category").textContent = work.category;
    card.querySelector(".work-order").textContent = `排序 ${work.order}`;
    const summary = card.querySelector(".work-description");
    summary.textContent = work.description;
    summary.hidden = !work.description;

    const cover = card.querySelector("img");
    if (validMediaUrl(work.poster)) {
      cover.addEventListener("error", () => { cover.hidden = true; }, { once: true });
      cover.src = work.poster;
      cover.hidden = false;
    }

    const status = card.querySelector(".status-tag");
    status.dataset.published = String(work.published);
    status.textContent = work.published ? "已上架" : "未上架";
    const toggle = card.querySelector('[data-action="toggle"]');
    toggle.textContent = work.published ? "下架" : "上架";
    for (const button of card.querySelectorAll("[data-action]")) {
      button.disabled = togglesPending.has(work.id);
      button.setAttribute("aria-label", `${button.textContent} ${work.title}`);
      if (String(work.id) === focusId && button.dataset.action === focusAction) focusTarget = button;
    }
    cards.append(card);
  }

  worksList.replaceChildren(cards);
  if (focusAction) (focusTarget ?? newWork).focus();
}

function applyWork(response) {
  const work = response?.work;
  if (!work?.id) throw new Error("服务器未返回保存结果，请刷新页面确认作品状态。");
  const existing = works.findIndex((current) => current.id === work.id);
  if (existing === -1) works.push(work);
  else works[existing] = work;
  return work;
}

function updateEditorBusy() {
  const uploading = Object.values(media).some((field) => field.busy);
  const busy = editorSaving || uploading;
  saveWork.disabled = busy;
  saveWork.textContent = editorSaving ? "正在保存…" : "保存作品";
  find("close-editor").disabled = busy;
  find("cancel-editor").disabled = busy;

  for (const field of workForm.querySelectorAll(".form-body input, .form-body textarea")) {
    field.disabled = editorSaving;
  }
  for (const field of Object.values(media)) {
    field.file.disabled = editorSaving || field.busy;
    field.input.disabled = editorSaving || field.busy;
  }
}

function openEditor(work = null) {
  editing = work;
  workForm.reset();
  for (const field of workForm.querySelectorAll("input")) field.setCustomValidity("");
  find("editor-title").textContent = work ? "编辑作品" : "新增作品";
  const fieldNames = ["title", "category", "description", "poster", "video", "order"];
  for (const name of fieldNames) workForm.elements[name].value = work?.[name] ?? "";
  if (!work) {
    const maxOrder = works.reduce((highest, current) => Math.max(highest, current.order), 0);
    workForm.elements.order.value = Math.min(maxOrder + 10, 999999);
  }
  workForm.elements.published.checked = Boolean(work?.published);

  const suggestions = [...new Set(works.map((current) => current.category).filter(Boolean))].sort();
  find("categories").replaceChildren(...suggestions.map((category) => {
    const option = document.createElement("option");
    option.value = category;
    return option;
  }));

  feedback(find("editor-message"));
  for (const field of Object.values(media)) feedback(field.message);
  editor.showModal();
  workForm.elements.title.focus();
}

newWork.addEventListener("click", () => openEditor());
find("close-editor").addEventListener("click", () => editor.close());
find("cancel-editor").addEventListener("click", () => editor.close());
editor.addEventListener("cancel", (event) => {
  if (saveWork.disabled) event.preventDefault();
});

for (const input of workForm.querySelectorAll('input:not([type="file"])')) {
  input.addEventListener("input", () => input.setCustomValidity(""));
}

workForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (saveWork.disabled) return;
  const form = workForm.elements;
  const work = {
    title: form.title.value.trim(),
    category: form.category.value.trim(),
    description: form.description.value.trim(),
    poster: form.poster.value.trim(),
    video: form.video.value.trim(),
    order: form.order.valueAsNumber,
    published: form.published.checked,
  };

  form.title.setCustomValidity(work.title ? "" : "请输入作品标题。");
  form.category.setCustomValidity(work.category ? "" : "请输入作品分类。");
  form.poster.setCustomValidity(!work.poster || validMediaUrl(work.poster) ? "" : "请输入有效的站内路径或 HTTP / HTTPS 链接。");
  form.video.setCustomValidity(validMediaUrl(work.video) ? "" : "请上传视频或输入有效的视频链接。");
  if (!workForm.reportValidity()) return;

  editorSaving = true;
  updateEditorBusy();
  feedback(find("editor-message"));
  try {
    const response = editing
      ? await jsonRequest(`${worksRoute}/${encodeURIComponent(editing.id)}`, "PATCH", work)
      : await jsonRequest(worksRoute, "POST", work);
    const saved = applyWork(response);
    editor.close();
    renderWorks(String(saved.id), "edit");
    feedback(dashboardMessage, `已保存「${saved.title}」。`, "success");
  } catch (error) {
    handleOperationError(error, find("editor-message"));
  } finally {
    editorSaving = false;
    updateEditorBusy();
  }
});

for (const field of Object.values(media)) {
  field.file.addEventListener("change", async () => {
    const file = field.file.files[0];
    if (!file) return;
    field.file.value = "";
    if (file.size === 0 || file.size > 90 * 1024 * 1024) {
      feedback(field.message, "请选择非空文件，单个文件最大 90 MiB。", "error");
      return;
    }
    if (!field.allowed.includes(file.type)) {
      feedback(field.message, field.formatHint, "error");
      return;
    }

    field.busy = true;
    updateEditorBusy();
    feedback(field.message, `正在上传 ${file.name}…`);
    try {
      const result = await request(uploadRoute, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!validMediaUrl(result?.url)) throw new Error("上传后未返回有效的文件链接，请重试。");
      field.input.value = result.url;
      field.input.setCustomValidity("");
      feedback(field.message, "已上传，保存作品后应用。", "success");
    } catch (error) {
      handleOperationError(error, field.message);
    } finally {
      field.busy = false;
      updateEditorBusy();
    }
  });
}

worksList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || button.disabled) return;
  const id = button.closest(".work-card").dataset.id;
  const work = works.find((current) => String(current.id) === id);
  if (!work) return;

  if (button.dataset.action === "edit") {
    openEditor(work);
  } else if (button.dataset.action === "delete") {
    deleting = work;
    find("delete-copy").textContent = `删除「${work.title}」后，该作品将从列表和个人主页移除。`;
    feedback(find("delete-message"));
    deleteDialog.showModal();
  } else {
    await togglePublished(work, button);
  }
});

async function togglePublished(work, button) {
  togglesPending.add(work.id);
  for (const control of button.parentElement.querySelectorAll("button")) control.disabled = true;
  feedback(dashboardMessage, work.published ? "正在下架作品…" : "正在上架作品…");
  try {
    const response = await jsonRequest(`${worksRoute}/${encodeURIComponent(work.id)}`, "PATCH", {
      published: !work.published,
    });
    if (!authenticated) return;
    const saved = applyWork(response);
    feedback(dashboardMessage, `「${saved.title}」已${saved.published ? "上架" : "下架"}。`, "success");
  } catch (error) {
    if (authenticated) handleOperationError(error, dashboardMessage);
  } finally {
    togglesPending.delete(work.id);
    if (authenticated) renderWorks(String(work.id), "toggle");
  }
}

find("cancel-delete").addEventListener("click", () => deleteDialog.close());
deleteDialog.addEventListener("cancel", (event) => {
  if (deletePending) event.preventDefault();
});

deleteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!deleting || deletePending) return;
  const work = deleting;
  deletePending = true;
  confirmDelete.disabled = true;
  find("cancel-delete").disabled = true;
  confirmDelete.textContent = "正在删除…";
  feedback(find("delete-message"));

  try {
    await request(`${worksRoute}/${encodeURIComponent(work.id)}`, { method: "DELETE" });
    works = works.filter((current) => current.id !== work.id);
    deleteDialog.close();
    renderWorks(null, "delete");
    feedback(dashboardMessage, `已删除「${work.title}」。`, "success");
  } catch (error) {
    handleOperationError(error, find("delete-message"));
  } finally {
    deletePending = false;
    confirmDelete.disabled = false;
    find("cancel-delete").disabled = false;
    confirmDelete.textContent = "删除作品";
  }
});

initialize();
