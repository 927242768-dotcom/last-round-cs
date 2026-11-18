const DIRECTIONS = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];
const FRONT = 'front';
const BLEND_MS = 105;
const AIM_SETTLE_MS = 36;
const SECTOR = Math.PI / 4;

function directionGap(a, b) {
  const gap = Math.abs(DIRECTIONS.indexOf(a) - DIRECTIONS.indexOf(b));
  return Math.min(gap, DIRECTIONS.length - gap);
}

function resolveDirection(x, y, previous) {
  const distance = Math.hypot(x, y);
  if (distance < (previous === FRONT ? 0.2 : 0.14)) return FRONT;

  const angle = Math.atan2(y, x);
  if (previous !== FRONT) {
    const difference = angle - DIRECTIONS.indexOf(previous) * SECTOR;
    const separation = Math.abs(Math.atan2(Math.sin(difference), Math.cos(difference)));
    if (separation < SECTOR / 2 + Math.PI / 24) return previous;
  }
  const index = Math.round(angle / SECTOR) + DIRECTIONS.length;
  return DIRECTIONS[index % DIRECTIONS.length];
}

export function mountPortrait(hero, { stage: suppliedStage } = {}) {
  const stage = suppliedStage || hero?.querySelector('.hero-portrait');
  const base = stage?.querySelector('img');
  if (!hero || !base) return () => {};

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(any-hover: hover) and (any-pointer: fine)');
  const originalBlend = base.style.mixBlendMode;
  const originalOpacity = base.style.opacity;
  const originalIsolation = stage.style.isolation;
  const events = new AbortController();
  const { signal } = events;

  const frames = new Map([[FRONT, { image: base, ready: true }]]);
  let current = FRONT;
  let desired = FRONT;
  let aim = FRONT;
  let blend = null;
  let settleTimer = 0;
  let warmTimer = 0;
  let visible = true;
  let disposed = false;

  stage.style.isolation = 'isolate';
  base.style.mixBlendMode = 'plus-lighter';
  stage.dataset.gaze = FRONT;

  function canTrack() {
    return visible && !document.hidden && !motion.matches;
  }

  function load(name, priority) {
    const existing = frames.get(name);
    if (existing) {
      if (priority === 'high' && !existing.ready) existing.image.fetchPriority = priority;
      return existing;
    }

    const image = new Image();
    const frame = { image, ready: false, failed: false };
    frames.set(name, frame);
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    image.draggable = false;
    image.decoding = 'async';
    image.fetchPriority = priority;
    image.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0;mix-blend-mode:plus-lighter';
    image.addEventListener('load', async () => {
      try {
        await image.decode();
      } catch {
        // 某些浏览器会在 load 后拒绝再次解码，可直接使用已加载图像。
      }
      if (disposed || !image.naturalWidth) return;
      frame.ready = true;
      if (desired === name && canTrack()) advance();
    }, { signal, once: true });
    image.addEventListener('error', () => {
      frame.failed = true;
      if (desired === name) target(FRONT);
    }, { signal, once: true });
    image.src = '/art/gaze/' + name + '.webp';
    return frame;
  }

  function warmFrames() {
    if (disposed || !finePointer.matches || motion.matches) return;
    // 正面图进入画面后再分批准备转向帧，触屏不下载多余素材。
    const pending = DIRECTIONS.filter((direction) => !frames.has(direction));
    for (const name of pending.slice(0, 2)) load(name, 'low');
    if (pending.length > 2) warmTimer = setTimeout(warmFrames, 180);
  }

  function advance() {
    if (blend || desired === current || disposed) return;
    let next = desired;
    let incoming = frames.get(next);
    if (next !== FRONT && !canTrack()) return;
    if (!incoming?.ready) return;

    // 大角度换向先经过正面。每次过渡只叠化两张画面。
    if (current !== FRONT && next !== FRONT && directionGap(current, next) > 2) {
      next = FRONT;
      incoming = frames.get(next);
    }
    const from = frames.get(current).image;
    const to = incoming.image;
    if (!to.isConnected) stage.append(to);
    from.style.opacity = '0';
    to.style.opacity = '1';
    if (!to.animate) {
      current = next;
      stage.dataset.gaze = current;
      advance();
      return;
    }

    const settings = { duration: BLEND_MS, easing: 'ease-in-out' };
    const animation = [
      from.animate([{ opacity: 1 }, { opacity: 0 }], settings),
      to.animate([{ opacity: 0 }, { opacity: 1 }], settings),
    ];
    blend = animation;
    Promise.allSettled(animation.map((effect) => effect.finished)).then(() => {
      if (blend !== animation) return;
      blend = null;
      current = next;
      stage.dataset.gaze = current;
      advance();
    });
  }

  function target(name) {
    const frame = name === FRONT ? frames.get(FRONT) : load(name, 'high');
    desired = frame.failed ? FRONT : name;
    advance();
  }

  function returnFront() {
    clearTimeout(settleTimer);
    aim = FRONT;
    target(FRONT);
  }

  function setFrontImmediately() {
    clearTimeout(settleTimer);
    const active = blend;
    blend = null;
    active?.forEach((effect) => effect.cancel());
    for (const [name, frame] of frames) {
      frame.image.style.opacity = name === FRONT ? originalOpacity : '0';
    }
    aim = desired = current = FRONT;
    stage.dataset.gaze = FRONT;
  }

  function track(event) {
    if (event.pointerType === 'touch' || !canTrack()) return;
    const scene = hero.getBoundingClientRect();
    if (!inFirstScreen(scene) || event.clientX < scene.left || event.clientX > scene.right
      || event.clientY > Math.min(scene.bottom, innerHeight)) {
      if (aim !== FRONT) returnFront();
      return;
    }
    const portrait = stage.getBoundingClientRect();
    const x = (event.clientX - portrait.left - portrait.width * 0.53) / Math.max(160, Math.min(scene.width, innerWidth) * 0.31);
    const y = (event.clientY - portrait.top - portrait.height * 0.373) / Math.max(120, Math.min(scene.height, innerHeight) * 0.34);
    const next = resolveDirection(x, y, aim);
    if (aim === next) return;
    aim = next;
    clearTimeout(settleTimer);
    if (next !== FRONT) load(next, 'high');
    settleTimer = setTimeout(() => target(aim), AIM_SETTLE_MS);
  }

  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting && entry.intersectionRatio >= 0.35;
    if (!visible) setFrontImmediately();
  }, { threshold: [0, 0.35] });
  intersection.observe(hero);

  function inFirstScreen(bounds) {
    const viewHeight = Math.min(bounds.height, innerHeight);
    return bounds.bottom > viewHeight * 0.5 && bounds.top >= -Math.min(140, viewHeight * 0.18);
  }

  function resetIfScrollingAway() {
    if (desired === FRONT && current === FRONT && aim === FRONT) return;
    if (!inFirstScreen(hero.getBoundingClientRect())) returnFront();
  }

  // 顶栏和人物可能在首幕的兄弟层，首幕仍能响应移动到顶栏附近的指针。
  window.addEventListener('pointermove', track, { passive: true, signal });
  document.documentElement.addEventListener('pointerleave', returnFront, { passive: true, signal });
  window.addEventListener('pointercancel', returnFront, { passive: true, signal });
  window.addEventListener('blur', returnFront, { signal });
  window.addEventListener('scroll', resetIfScrollingAway, { passive: true, signal });
  document.addEventListener('visibilitychange', setFrontImmediately, { signal });
  motion.addEventListener('change', () => {
    setFrontImmediately();
    if (!motion.matches) warmFrames();
  }, { signal });
  finePointer.addEventListener('change', warmFrames, { signal });
  if (base.complete) warmTimer = setTimeout(warmFrames, 220);
  else base.addEventListener('load', () => {
    warmTimer = setTimeout(warmFrames, 220);
  }, { signal, once: true });

  return () => {
    disposed = true;
    clearTimeout(warmTimer);
    setFrontImmediately();
    intersection.disconnect();
    events.abort();
    for (const direction of DIRECTIONS) frames.get(direction)?.image.remove();
    base.style.mixBlendMode = originalBlend;
    base.style.opacity = originalOpacity;
    stage.style.isolation = originalIsolation;
    delete stage.dataset.gaze;
  };
}
