import { mountPortrait } from '/portrait.js'
import { mountGallery } from '/gallery.js'
import { mountArena } from '/arena.js'
import { mountLoadout } from '/loadout.js'

const hero = document.querySelector('.hero')
const storyScreen = document.querySelector('.story-screen')
const about = document.querySelector('#about')
const archive = document.querySelector('#archive')
const outro = document.querySelector('.outro')
const chapters = [...document.querySelectorAll('main .scene')]
const nav = [...document.querySelectorAll('.topbar nav a')]
const topbar = document.querySelector('.topbar')
const motion = matchMedia('(prefers-reduced-motion: reduce)')
const poses = [...storyScreen.querySelectorAll('[data-pose]')]
const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, n))
const mix = (a, b, t) => a + (b - a) * t

mountPortrait(hero, { stage: document.querySelector('.hero-portrait') })
mountRipples(hero)

let scrollFrame = 0
function renderStory() {
  scrollFrame = 0
  const screen = storyScreen.clientHeight
  const first = about.getBoundingClientRect().top
  const second = archive.getBoundingClientRect().top
  const coverToProfile = clamp((screen * .71 - first) / (screen * .56))
  const profileToLocker = clamp((screen * .69 - second) / (screen * .54))
  const phase = profileToLocker > 0 ? 2 + profileToLocker * 2 : coverToProfile * 2
  const leftPose = Math.floor(phase)
  const opacity = clamp((phase % 1 - .16) / .68)
  const blend = opacity * opacity * (3 - 2 * opacity)
  const restingPose = phase > 3 ? 4 : phase > 1 ? 2 : 0

  for (const [index, pose] of poses.entries()) {
    const alpha = motion.matches
      ? Number(index === restingPose)
      : index === leftPose ? 1 - blend : index === leftPose + 1 ? blend : 0
    pose.style.setProperty('--weight', alpha.toFixed(3))
    const shift = motion.matches ? 0 : clamp(index - phase, -1, 1)
    pose.style.setProperty('--pose-x', (shift * 31).toFixed(1) + 'px')
    pose.style.setProperty('--pose-y', (shift * 19).toFixed(1) + 'px')
  }
  storyScreen.style.setProperty('--scene-turn', motion.matches ? '0' : (phase / 4).toFixed(3))

  for (const scene of [hero, about, archive]) {
    const bounds = scene.getBoundingClientRect()
    const enter = clamp((innerHeight * .88 - bounds.top) / (innerHeight * .54))
    const exit = clamp((bounds.bottom - innerHeight * .10) / (innerHeight * .57))
    const alpha = motion.matches ? 1 : scene === hero ? exit : enter * exit
    scene.style.setProperty('--copy-opacity', alpha.toFixed(3))
    scene.style.setProperty('--copy-y', motion.matches ? '0px' : ((1 - enter) * 18 - (1 - exit) * 13).toFixed(1) + 'px')
  }
  const outroBounds = outro.getBoundingClientRect()
  const drift = motion.matches ? 0 : 1 - clamp((innerHeight * .84 - outroBounds.top) / (innerHeight * .62))
  outro.style.setProperty('--outro-y', (-63 * drift).toFixed(1) + 'px')
  outro.style.setProperty('--outro-angle', (-9 * drift).toFixed(1) + 'deg')

  const visible = chapters.findLast((chapter) => {
    const bounds = chapter.getBoundingClientRect()
    return !chapter.hidden && bounds.top < innerHeight * .48 && bounds.bottom >= innerHeight * .48
  })
  for (const link of nav) {
    if (visible?.id && link.hash === '#' + visible.id) link.setAttribute('aria-current', 'location')
    else link.removeAttribute('aria-current')
  }
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight)
  topbar.classList.toggle('scrolled', scrollY > 35)
  topbar.style.setProperty('--read', clamp(scrollY / maxScroll).toFixed(3))
}

function queueStory() {
  if (!scrollFrame) scrollFrame = requestAnimationFrame(renderStory)
}
addEventListener('scroll', queueStory, { passive: true })
addEventListener('resize', queueStory)
motion.addEventListener('change', queueStory)
renderStory()

function mountRipples(section) {
  const canvas = section.querySelector('.water')
  const context = canvas.getContext('2d')
  if (!context) return
  let frame = 0
  let oldX = -100
  let oldY = -100
  const rings = []

  new ResizeObserver(() => {
    const ratio = Math.min(2, devicePixelRatio || 1)
    canvas.width = Math.round(section.clientWidth * ratio)
    canvas.height = Math.round(section.clientHeight * ratio)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
  }).observe(section)

  function render(now) {
    frame = 0
    context.clearRect(0, 0, section.clientWidth, section.clientHeight)
    for (let i = rings.length - 1; i >= 0; i--) {
      const ring = rings[i]
      const t = clamp((now - ring.started) / ring.duration)
      if (t >= 1) {
        rings.splice(i, 1)
        continue
      }
      const radius = mix(4, ring.radius, 1 - (1 - t) ** 2)
      const fade = (1 - t) ** 2 * (ring.large ? .54 : .28)
      context.lineWidth = ring.large ? 1.05 : .65
      context.strokeStyle = 'rgba(255, 218, 153,' + fade + ')'
      context.beginPath()
      context.ellipse(ring.x, ring.y, radius, radius * .93, -.2, 0, Math.PI * 2)
      context.stroke()
    }
    if (rings.length) frame = requestAnimationFrame(render)
  }

  function kick(event, large) {
    if (motion.matches || event.target.closest('a,button') || (!large && event.pointerType !== 'mouse')) return
    const bounds = section.getBoundingClientRect()
    if (bounds.top < -innerHeight * .14) return
    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top
    if (!large && Math.hypot(x - oldX, y - oldY) < 26) return
    oldX = x
    oldY = y
    if (rings.length >= 12) rings.shift()
    rings.push({ x, y, large, started: performance.now(), radius: large ? 57 : 22, duration: large ? 620 : 370 })
    if (!frame) frame = requestAnimationFrame(render)
  }
  section.addEventListener('pointermove', (event) => kick(event, false), { passive: true })
  section.addEventListener('pointerdown', (event) => kick(event, true), { passive: true })
}

const marks = [
  { key: 'smoke', workId: 'round-01', start: 4.4, title: '烟封小道', text: '小道被烟封住，先把高爆手雷拿在手里。' },
  { key: 'last-shot', workId: 'round-01', start: 14.5, title: '最后一发', text: '剩 4 点血，AK 弹匣里最后一发收下第四杀。' },
  { key: 'reload', workId: 'round-02', start: 14.167, title: '贴箱换弹', text: '弹匣还剩 9 发，先退到木箱旁换弹，再探出去。' },
  { key: 'ace', workId: 'round-02', start: 17.6, title: '五杀以后', text: '最后一个人倒下，切刀。那一把可以回看了。' },
]
const frameUrl = (mark) => '/media/notes-' + mark.key + '.webp'
function timestamp(seconds) {
  const whole = Math.floor(seconds)
  return String(Math.floor(whole / 60)).padStart(2, '0') + ':' + String(whole % 60).padStart(2, '0')
}
function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    const url = new URL(value, location.origin)
    return url.origin === location.origin || url.protocol === 'https:' ? url.href : ''
  } catch { return '' }
}
function element(name, className, text = '') {
  const node = document.createElement(name)
  node.className = className
  node.textContent = text
  return node
}
function poster(source) {
  const image = document.createElement('img')
  const url = safeUrl(source)
  image.alt = ''
  image.decoding = 'async'
  image.loading = 'lazy'
  if (url) image.src = url
  return image
}

const noteSection = document.querySelector('#notes')
const noteOptions = document.querySelector('#note-options')
const noteImage = document.querySelector('#note-image')
const notePlay = document.querySelector('#note-play')
const archiveTrigger = document.querySelector('#open-archive')
const archiveDialog = document.querySelector('#archive-dialog')
const archiveCards = document.querySelector('#archive-cards')
const openCase = archiveDialog.querySelector('.open-case')
const replayDialog = document.querySelector('#replay-dialog')
const replayVideo = document.querySelector('#replay-video')
const replayError = document.querySelector('#replay-error')
const jumpList = document.querySelector('#jump-list')
const gallery = mountGallery(document.querySelector('#gallery-root'), { openReplay })
const arena = mountArena(document.querySelector('#arena-root'), { openReplay })
const loadout = mountLoadout(document.querySelector('#loadout-root'), { openReplay })

let works = []
let shownMarks = []
let activeMark = null
let lastPayload = ''
let worksRequest = null
let videoListeners = null
let replayReturn = null

function showMark(mark) {
  activeMark = mark
  noteImage.src = frameUrl(mark)
  document.querySelector('#note-title').textContent = mark.title
  document.querySelector('#note-text').textContent = mark.text
  document.querySelector('#note-play-text').textContent = '从 ' + timestamp(mark.start) + ' 播放'
  notePlay.setAttribute('aria-label', mark.title + '，从 ' + timestamp(mark.start) + ' 播放')
  for (const button of noteOptions.children) {
    button.setAttribute('aria-pressed', String(button.dataset.mark === mark.key))
  }
}

function makeMarkButton(mark) {
  const button = element('button', 'note-option')
  button.type = 'button'
  button.dataset.mark = mark.key
  const label = element('span', '')
  const time = element('time', '', timestamp(mark.start))
  time.dateTime = 'PT' + mark.start + 'S'
  label.append(element('strong', '', mark.title), time)
  const arrow = element('span', 'chevron', '→')
  arrow.setAttribute('aria-hidden', 'true')
  button.append(poster(frameUrl(mark)), label, arrow)
  button.addEventListener('click', () => showMark(mark))
  return button
}

function refreshMarks() {
  shownMarks = marks.filter((mark) => works.some((work) => {
    if (work.id !== mark.workId) return false
    const video = new URL(safeUrl(work.video))
    return video.origin === location.origin && video.pathname === '/media/' + mark.workId + '.mp4'
  }))
  noteSection.hidden = !shownMarks.length
  for (const link of document.querySelectorAll('a[href="#notes"]')) link.hidden = noteSection.hidden
  noteOptions.replaceChildren(...shownMarks.map(makeMarkButton))
  if (shownMarks.length) showMark(shownMarks.find((mark) => mark.key === activeMark?.key) ?? shownMarks[0])
  else activeMark = null
  queueStory()
}
notePlay.addEventListener('click', () => {
  const work = works.find((entry) => entry.id === activeMark?.workId)
  if (work && activeMark) openReplay(work, notePlay, activeMark.start)
})

function makeArchiveCard(title, image, action, index) {
  const button = element('button', 'archive-card')
  button.type = 'button'
  button.style.setProperty('--tilt', (index % 3 - 1) * 6 + 'deg')
  button.style.setProperty('--card-delay', String(Math.min(index, 7)))
  const label = element('strong', '', title)
  const arrow = element('span', '', '↗')
  arrow.setAttribute('aria-hidden', 'true')
  label.append(arrow)
  button.append(poster(image), label)
  button.addEventListener('click', () => {
    archiveDialog.close()
    action()
  })
  return button
}
function refreshArchive() {
  function chapter(id) {
    location.hash = id
    const firstAction = document.querySelector('#' + id + ' button, #' + id + ' a')
    firstAction?.focus({ preventScroll: true })
  }
  const cards = []
  if (works.length) cards.push(makeArchiveCard('回放合集', works[0].poster, () => chapter('replays'), cards.length))
  if (!document.querySelector('#arena').hidden && shownMarks.length) {
    cards.push(makeArchiveCard('A 小道现场', frameUrl(shownMarks[0]), () => chapter('arena'), cards.length))
  }
  cards.push(makeArchiveCard('这一局的装备', '/art/kit-table.webp', () => chapter('loadout'), cards.length))
  archiveCards.replaceChildren(...cards)
  archiveCards.toggleAttribute('data-scroll', cards.length > 3)
  archiveCards.scrollLeft = 0
}
archiveTrigger.addEventListener('click', () => {
  refreshArchive()
  const source = archiveTrigger.querySelector('img').getBoundingClientRect()
  archiveDialog.showModal()
  const target = openCase.getBoundingClientRect()
  if (!motion.matches && target.width && openCase.animate) {
    const x = source.left + source.width / 2 - (target.left + target.width / 2)
    const y = source.top + source.height / 2 - (target.top + target.height / 2)
    const scale = clamp(source.width / target.width, .5, 1.28)
    openCase.animate([
      { transform: 'translate(' + x + 'px,' + y + 'px) rotate(-5deg) scale(' + scale + ')', opacity: .49 },
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
    ], { duration: 475, easing: 'cubic-bezier(.18,.84,.28,1)' })
  }
})

function openReplay(work, trigger, startAt = 0) {
  const source = safeUrl(work.video)
  if (!source) return
  const url = new URL(source)
  const example = url.origin === location.origin && /^\/media\/(round-0[12]\.mp4)$/.exec(url.pathname)
  if (example) url.pathname = '/api/replay/' + example[1]
  videoListeners?.abort()
  videoListeners = new AbortController()
  const signal = videoListeners.signal
  replayReturn = trigger
  document.querySelector('#replay-title').textContent = work.title
  document.querySelector('#replay-description').textContent = work.description || ''
  replayError.hidden = true
  replayVideo.poster = safeUrl(work.poster)
  replayVideo.setAttribute('aria-label', work.title)
  replayVideo.addEventListener('error', () => { replayError.hidden = false }, { signal })
  const move = (seconds) => {
    if (Number.isFinite(replayVideo.duration)) replayVideo.currentTime = Math.min(seconds, Math.max(0, replayVideo.duration - .05))
  }
  if (startAt > 0) replayVideo.addEventListener('loadedmetadata', () => move(startAt), { signal, once: true })
  jumpList.replaceChildren(...shownMarks.filter((mark) => mark.workId === work.id).map((mark) => {
    const button = element('button', '')
    button.type = 'button'
    const time = element('time', '', timestamp(mark.start))
    time.dateTime = 'PT' + mark.start + 'S'
    button.append(time, element('span', '', mark.title))
    button.addEventListener('click', () => {
      move(mark.start)
      replayVideo.play().catch(() => {})
    })
    return button
  }))
  replayVideo.src = url.href
  if (!replayDialog.open) replayDialog.showModal()
  replayVideo.play().catch(() => {})
}
replayDialog.addEventListener('close', () => {
  videoListeners?.abort()
  replayVideo.pause()
  replayVideo.removeAttribute('src')
  replayVideo.load()
  if (replayReturn?.isConnected) replayReturn.focus({ preventScroll: true })
  replayReturn = null
})
for (const dialog of [archiveDialog, replayDialog]) {
  dialog.querySelector('.close-dialog').addEventListener('click', () => dialog.close())
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
}

function showGalleryError() {
  const status = document.querySelector('.clip-gallery-status')
  if (!status) return
  const retry = element('button', 'line-link', '重试')
  retry.type = 'button'
  retry.addEventListener('click', fetchWorks)
  status.replaceChildren('暂时读不到回放。 ', retry)
  status.hidden = false
}

async function fetchWorks() {
  if (worksRequest) return worksRequest
  worksRequest = (async () => {
    try {
      const response = await fetch('/api/works', { cache: 'no-store' })
      if (!response.ok) throw new Error('回放读取失败')
      const payload = await response.json()
      if (!Array.isArray(payload.works)) throw new Error('回放格式错误')
      const state = JSON.stringify(payload.works)
      if (state === lastPayload) return
      works = payload.works.filter((work) => work.title && safeUrl(work.video))
      lastPayload = state
      gallery.setWorks(works)
      arena.setWorks(works)
      loadout.setWorks(works)
      refreshMarks()
      document.querySelector('nav a[href="#arena"]').hidden = document.querySelector('#arena').hidden
      const aboutRoute = document.querySelector('.about-copy a[href="#arena"]')
      aboutRoute.hidden = document.querySelector('#arena').hidden
      if (archiveDialog.open) refreshArchive()
    } catch {
      if (!works.length) showGalleryError()
    }
  })()
  try { await worksRequest } finally { worksRequest = null }
}
addEventListener('focus', fetchWorks)
setInterval(() => { if (!document.hidden) fetchWorks() }, 30_000)
fetchWorks()
