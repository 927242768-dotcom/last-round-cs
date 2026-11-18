const layout = `
  <div class="clip-gallery-filters" role="group" aria-label="回放分类" hidden></div>
  <div class="clip-gallery-stage" role="group" aria-label="回放封面" hidden></div>
  <div class="clip-gallery-foot" hidden>
    <div class="clip-gallery-copy" aria-live="polite" aria-atomic="true">
      <h3></h3>
      <p></p>
    </div>
    <div class="clip-gallery-nav" role="group" aria-label="切换回放" hidden>
      <button type="button" data-step="-1" aria-label="上一段回放"><span aria-hidden="true"></span></button>
      <button type="button" data-step="1" aria-label="下一段回放"><span aria-hidden="true"></span></button>
    </div>
  </div>
  <p class="clip-gallery-status" role="status">正在读取回放…</p>
`;

function createCover(work) {
  const button = document.createElement("button");
  button.className = "clip-gallery-cover";
  button.type = "button";
  button.dataset.work = String(work.id);
  button.hidden = true;

  if (work.poster) {
    const image = document.createElement("img");
    image.alt = "";
    image.decoding = "async";
    image.loading = "lazy";
    image.draggable = false;
    image.addEventListener("error", () => { image.hidden = true; }, { once: true });
    image.src = work.poster;
    button.append(image);
  }

  const play = document.createElement("span");
  play.className = "clip-gallery-play";
  play.setAttribute("aria-hidden", "true");
  button.append(play);
  return button;
}

export function mountGallery(root, { openReplay }) {
  root.classList.add("clip-gallery");
  root.innerHTML = layout;
  const filters = root.querySelector(".clip-gallery-filters");
  const stage = root.querySelector(".clip-gallery-stage");
  const foot = root.querySelector(".clip-gallery-foot");
  const name = foot.querySelector("h3");
  const description = foot.querySelector("p");
  const nav = foot.querySelector(".clip-gallery-nav");
  const [previous, next] = nav.querySelectorAll("button");
  const status = root.querySelector(".clip-gallery-status");

  let works = [];
  let cards = new Map();
  let category = "";
  let selected = "";
  let gesture = null;
  let ignorePointerClickUntil = 0;
  let horizontalWheel = 0;
  let lastWheel = 0;

  function currentWorks() {
    return category ? works.filter((work) => work.category === category) : works;
  }

  function render() {
    const visible = currentWorks();
    let index = visible.findIndex((work) => work.id === selected);
    if (index < 0) index = 0;
    const work = visible[index];
    selected = work?.id ?? "";

    const slots = new Map([
      [visible[index - 1]?.id, "previous"],
      [selected, "current"],
      [visible[index + 1]?.id, "next"],
    ]);
    for (const item of works) {
      const cover = cards.get(item.id);
      const slot = slots.get(item.id);
      cover.hidden = !slot;
      cover.tabIndex = slot === "current" ? 0 : -1;
      cover.dataset.slot = slot ?? "";
      if (slot) {
        const action = slot === "current" ? "播放" : "选中";
        cover.setAttribute("aria-label", `${action}《${item.title}》`);
      }
    }

    for (const button of filters.querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.category === category));
    }
    status.hidden = Boolean(work);
    if (!work) status.textContent = "暂无回放。";
    stage.hidden = !work;
    foot.hidden = !work;
    if (!work) return;

    name.textContent = work.title;
    description.textContent = work.description ?? "";
    description.hidden = !description.textContent;
    nav.hidden = visible.length < 2;
    previous.setAttribute("aria-disabled", String(index === 0));
    next.setAttribute("aria-disabled", String(index === visible.length - 1));
  }

  function setWorks(items) {
    const seen = new Set();
    works = [];
    for (const item of Array.isArray(items) ? items : []) {
      if (!item || item.id == null || !item.title || item.published === false) continue;
      const id = String(item.id);
      if (seen.has(id)) continue;
      seen.add(id);
      works.push({ ...item, id, category: item.category?.trim() ?? "" });
    }
    works.sort((first, second) => (first.order ?? 0) - (second.order ?? 0));

    const categories = [...new Set(works.map((work) => work.category).filter(Boolean))];
    const filterItems = categories.length > 1 ? [["", "全部"], ...categories.map((label) => [label, label])] : [];
    filters.replaceChildren(...filterItems.map(([value, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.category = value;
      button.textContent = label;
      return button;
    }));
    filters.hidden = filterItems.length === 0;
    if (filters.hidden || !categories.includes(category)) category = "";

    cards = new Map(works.map((work) => [work.id, createCover(work)]));
    stage.replaceChildren(...cards.values());
    render();
  }

  function select(id) {
    const work = works.find((item) => item.id === String(id));
    if (!work) return false;
    if (category && category !== work.category) category = work.category;
    selected = work.id;
    render();
    return true;
  }

  function step(direction, focus = false) {
    const visible = currentWorks();
    const index = visible.findIndex((work) => work.id === selected);
    const target = visible[index + direction];
    if (!target || index < 0) return false;
    select(target.id);
    if (focus) cards.get(selected).focus({ preventScroll: true });
    return true;
  }

  filters.addEventListener("click", (event) => {
    const choice = event.target.closest("button[data-category]");
    if (!choice || choice.dataset.category === category) return;
    category = choice.dataset.category;
    render();
  });

  stage.addEventListener("click", (event) => {
    if (event.detail && performance.now() < ignorePointerClickUntil) return;
    const cover = event.target.closest("button[data-work]");
    if (!cover || cover.hidden) return;
    const id = cover.dataset.work;
    if (id !== selected) {
      select(id);
      cover.focus({ preventScroll: true });
      return;
    }
    const work = works.find((item) => item.id === id);
    if (work) openReplay(work, cover);
  });

  nav.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-step]");
    if (!button || button.getAttribute("aria-disabled") === "true") return;
    step(Number(button.dataset.step));
  });

  root.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (!stage.contains(event.target) && !nav.contains(event.target)) return;
    event.preventDefault();
    step(event.key === "ArrowRight" ? 1 : -1, stage.contains(event.target));
  });

  stage.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });

  stage.addEventListener("pointerup", (event) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    gesture = null;
    if (Math.abs(dx) < 38 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    ignorePointerClickUntil = performance.now() + 350;
    step(dx < 0 ? 1 : -1);
  });

  stage.addEventListener("pointercancel", () => { gesture = null; });
  stage.addEventListener("wheel", (event) => {
    if (event.ctrlKey || Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 1.2) return;
    const now = performance.now();
    if (now - lastWheel > 180) horizontalWheel = 0;
    lastWheel = now;
    if (horizontalWheel === Infinity) return;
    horizontalWheel += event.deltaX;
    if (Math.abs(horizontalWheel) < 42) return;
    step(horizontalWheel > 0 ? 1 : -1);
    horizontalWheel = Infinity;
  }, { passive: true });

  return { setWorks, select };
}
