const ROUTES = [
  {
    id: 'round-01',
    title: '烟后四血',
    premise: '烟挡在前面，包已经落下。先走出这团烟，再接包点里的交火。',
    closing: '弹匣打空，血量剩 4 点。这段回放停在第四个击杀之后。',
    stops: [
      {
        name: '小道拐角',
        time: 1,
        image: '/media/arena-corner.webp',
        headline: '转过这个弯，前面就是 A。',
        description: 'AK 拿在手里，镜头沿着小道向前。右侧的 A 点路牌和木箱，是这条路线的起点。',
      },
      {
        name: '烟后包点',
        time: 7.1,
        image: '/media/arena-smoke-exit.webp',
        headline: '走出烟，包点露出来了。',
        description: '视线重新打开，AK 还是满弹匣。包已经落在 A 点，接下来的交火发生在箱子、矮墙和烟边。',
      },
      {
        name: '最后一发',
        time: 14.5,
        image: '/media/notes-last-shot.webp',
        headline: '血剩 4，弹匣归零。',
        description: '最后一发子弹之后，击杀记录添上第四个。镜头前的包点安静下来，这一段才终于能切刀。',
      },
    ],
  },
  {
    id: 'round-02',
    title: '小道五杀',
    premise: '从小道台阶起步，打到 A 平台。中间退回木箱旁，重新装满一只弹匣。',
    closing: '再次探出去，打完最后一个人。五个击杀，留下这段 A 小道。',
    stops: [
      {
        name: '台阶起步',
        time: .8,
        image: '/media/arena-stairs.webp',
        headline: '这次，从台阶上来。',
        description: '沿着左侧的台阶往上走，AK 指向前面的拐角。起点一样，之后的节奏换了。',
      },
      {
        name: '木箱换弹',
        time: 14.167,
        image: '/media/notes-reload.webp',
        headline: '先把这只弹匣装好。',
        description: '连续交火以后，退到木箱后换弹。镜头贴着掩体，下一次探头就在换弹之后。',
      },
      {
        name: '包点收尾',
        time: 17.6,
        image: '/media/notes-ace.webp',
        headline: '最后一个倒下，切刀。',
        description: '再回到包点前，五个击杀已经到手。把视角停在这里，可以看到完整的收尾记录。',
      },
    ],
  },
]

function clock(seconds) {
  const total = Math.floor(seconds)
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0')
}

function node(tag, className, text = '') {
  const element = document.createElement(tag)
  element.className = className
  element.textContent = text
  return element
}

function compatibleWork(work) {
  if (!work || work.published === false || !ROUTES.some((route) => route.id === work.id)) return false
  try {
    const url = new URL(work.video, location.origin)
    return url.origin === location.origin && url.pathname === '/media/' + work.id + '.mp4'
  } catch {
    return false
  }
}

export function mountArena(root, { openReplay }) {
  if (!root || typeof openReplay !== 'function') return { setWorks() {} }

  const section = root.closest('section') || root
  const prefix = root.id || 'arena'
  const header = node('div', 'arena-heading')
  const heading = node('h2', 'arena-title')
  heading.id = prefix + '-title'
  heading.append(document.createTextNode('一条小道，'), document.createElement('br'), document.createTextNode('两种收尾'), node('span', '', '。'))
  const lede = node('p', 'arena-lede', '沿着实战镜头，走一遍 Dust II 的 A 小道。')
  header.append(heading, lede)
  section.setAttribute('aria-labelledby', heading.id)

  const choices = node('div', 'arena-choices')
  choices.setAttribute('role', 'tablist')
  choices.setAttribute('aria-label', '选择回放路线')

  const panel = node('div', 'arena-route')
  panel.id = prefix + '-panel'
  panel.setAttribute('role', 'tabpanel')

  const visual = node('div', 'arena-visual')
  const screen = node('button', 'arena-screen')
  screen.type = 'button'
  const image = document.createElement('img')
  image.className = 'arena-image'
  image.decoding = 'async'
  image.loading = 'lazy'
  image.width = 1144
  image.height = 708
  const play = node('span', 'arena-watch')
  const symbol = node('span', 'arena-play-symbol')
  symbol.setAttribute('aria-hidden', 'true')
  const time = node('span', 'arena-watch-text')
  play.append(symbol, time)
  screen.append(image, play)
  const steps = node('div', 'arena-stops')
  steps.setAttribute('role', 'group')
  steps.setAttribute('aria-label', '沿途视角')
  visual.append(screen, steps)

  const detail = node('div', 'arena-detail')
  detail.setAttribute('aria-live', 'polite')
  const routeIntro = node('p', 'arena-premise')
  const moment = node('div', 'arena-moment')
  const name = node('h3', 'arena-moment-title')
  const description = node('p', 'arena-description')
  moment.append(name, description)
  const ending = node('p', 'arena-ending')
  detail.append(routeIntro, moment, ending)
  panel.append(visual, detail)
  const wrap = node('div', 'arena-wrap')
  wrap.append(header, choices, panel)
  root.replaceChildren(wrap)

  let available = []
  let route = null
  let active = 0
  let version = 0
  const savedStops = new Map()
  const preload = new Map()
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')

  function loadImage(url) {
    if (!preload.has(url)) {
      const preview = new Image()
      preview.decoding = 'async'
      preview.src = url
      preload.set(url, preview.decode().then(() => preview).catch(() => null))
    }
    return preload.get(url)
  }

  function setMoment(index, { focus = false } = {}) {
    if (!route) return
    active = index
    savedStops.set(route.id, index)
    const stop = route.stops[active]
    const renderVersion = ++version
    for (const [position, button] of [...steps.children].entries()) {
      button.setAttribute('aria-pressed', String(position === index))
      button.tabIndex = position === index ? 0 : -1
      if (focus && position === index) button.focus({ preventScroll: true })
    }
    screen.setAttribute('aria-label', '播放' + route.work.title + '，从' + clock(stop.time) + '的' + stop.name + '开始')
    name.textContent = stop.headline
    description.textContent = stop.description
    time.textContent = '从 ' + clock(stop.time) + ' 播放'
    image.alt = 'Dust II A 区实战，' + stop.name
    image.src = stop.image

    loadImage(stop.image).then((loaded) => {
      if (!loaded || renderVersion !== version || reduced.matches || !image.animate) return
      image.animate([{ opacity: .78 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' })
    })
  }

  function renderRoute(next) {
    route = next
    routeIntro.textContent = route.premise
    ending.textContent = route.closing
    panel.setAttribute('aria-labelledby', prefix + '-tab-' + route.id)
    for (const button of choices.children) {
      const selected = button.dataset.route === route.id
      button.setAttribute('aria-selected', String(selected))
      button.tabIndex = selected ? 0 : -1
    }
    const buttons = route.stops.map((stop, index) => {
      const button = node('button', 'arena-stop')
      button.type = 'button'
      button.dataset.stop = String(index)
      const dot = node('i', 'arena-dot')
      dot.setAttribute('aria-hidden', 'true')
      const label = node('strong', '', stop.name)
      const timestamp = node('time', '', clock(stop.time))
      timestamp.dateTime = 'PT' + stop.time + 'S'
      button.append(dot, label, timestamp)
      button.addEventListener('click', () => setMoment(index))
      loadImage(stop.image)
      return button
    })
    steps.replaceChildren(...buttons)
    setMoment(savedStops.get(route.id) ?? 0)
  }

  function setWorks(items) {
    const valid = new Map((Array.isArray(items) ? items : []).filter(compatibleWork).map((work) => [work.id, work]))
    available = ROUTES.filter((item) => valid.has(item.id)).map((item) => ({ ...item, work: valid.get(item.id) }))
    available.sort((first, second) => (first.work.order ?? 0) - (second.work.order ?? 0))
    section.hidden = available.length === 0
    if (!available.length) {
      route = null
      version++
      image.removeAttribute('src')
      choices.replaceChildren()
      return
    }
    const next = available.find((item) => item.id === route?.id) ?? available[0]
    heading.replaceChildren(
      document.createTextNode('一条小道，'),
      document.createElement('br'),
      document.createTextNode(available.length > 1 ? '两种收尾' : '走到包点'),
      node('span', '', '。'),
    )
    choices.replaceChildren(...available.map((item) => {
      const button = node('button', 'arena-choice', item.work.title || item.title)
      button.id = prefix + '-tab-' + item.id
      button.type = 'button'
      button.dataset.route = item.id
      button.setAttribute('role', 'tab')
      button.setAttribute('aria-controls', panel.id)
      button.addEventListener('click', () => renderRoute(item))
      return button
    }))
    choices.hidden = available.length < 2
    renderRoute(next)
  }

  function moveInGroup(event, group, current, choose) {
    const children = [...group.children]
    const actions = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
    let index
    if (event.key === 'Home') index = 0
    else if (event.key === 'End') index = children.length - 1
    else if (event.key in actions) index = (current + actions[event.key] + children.length) % children.length
    else return
    event.preventDefault()
    choose(index)
    children[index].focus({ preventScroll: true })
  }

  choices.addEventListener('keydown', (event) => {
    const current = available.findIndex((item) => item.id === route?.id)
    if (current >= 0) moveInGroup(event, choices, current, (index) => renderRoute(available[index]))
  })
  steps.addEventListener('keydown', (event) => {
    if (route) moveInGroup(event, steps, active, (index) => setMoment(index))
  })
  screen.addEventListener('click', () => {
    if (route) openReplay(route.work, screen, route.stops[active].time)
  })
  section.hidden = true
  return { setWorks }
}
