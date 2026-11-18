const equipment = [
  {
    id: 'rifle',
    label: '步枪',
    title: 'AK-47',
    description: '烟里进 A 点，弹匣一路打到见底。最后一发，刚好收下第四个击杀。',
    workId: 'round-01',
    offset: 13.75,
    focus: ['45%', '43%'],
  },
  {
    id: 'knife',
    label: '近身',
    title: '红色刀刃',
    description: '枪声停了，切回刀。只剩 4 点血，终于能松一口气，绕着包点走两步。',
    workId: 'round-01',
    offset: 18.3,
    focus: ['72%', '75%'],
  },
  {
    id: 'grenade',
    label: '投掷物',
    title: '高爆手雷',
    description: 'A 小道被烟封住，手里切出高爆手雷。还没走出烟，这一局就已经开始紧张了。',
    workId: 'round-01',
    offset: 4.4,
    focus: ['86%', '35%'],
  },
]

function linkedWork(items, id) {
  return items.find((work) => {
    if (!work || work.id !== id || work.published === false || typeof work.video !== 'string') return false
    try {
      const url = new URL(work.video, location.origin)
      return url.origin === location.origin && url.pathname === '/media/' + id + '.mp4'
    } catch {
      return false
    }
  })
}

export function mountLoadout(root, { openReplay }) {
  if (!root) return { setWorks() {} }
  root.classList.add('equipment')
  root.dataset.equipment = 'rifle'
  root.innerHTML = `
    <div class="equipment-inner">
      <div class="equipment-heading">
        <h2>这一局带什么<span>。</span></h2>
        <p>从推进到收尾，回看它们上场的时刻。</p>
      </div>
      <div class="equipment-layout">
        <div class="equipment-visual">
          <img class="equipment-table" src="/art/kit-table.webp" alt="桌上放着一把 AK-47、一柄红色刀和一颗高爆手雷" loading="lazy" decoding="async" draggable="false">
          <div class="equipment-light" aria-hidden="true"></div>
          <div class="equipment-points" role="group" aria-label="查看桌上的装备"></div>
        </div>
        <div class="equipment-description">
          <div class="equipment-tabs" role="tablist" aria-label="选择装备"></div>
          <div class="equipment-panel" role="tabpanel" tabindex="0">
            <h3></h3>
            <p></p>
            <button class="equipment-replay" type="button" hidden>回到实战<span aria-hidden="true">↗</span></button>
          </div>
        </div>
      </div>
    </div>
  `

  const tablist = root.querySelector('.equipment-tabs')
  const points = root.querySelector('.equipment-points')
  const panel = root.querySelector('.equipment-panel')
  const title = panel.querySelector('h3')
  const description = panel.querySelector('p')
  const replay = panel.querySelector('.equipment-replay')
  const image = root.querySelector('.equipment-table')
  const prefix = root.id || 'loadout'
  panel.id = prefix + '-panel'

  let current = equipment[0]
  let works = []

  function render() {
    root.dataset.equipment = current.id
    root.style.setProperty('--equipment-x', current.focus[0])
    root.style.setProperty('--equipment-y', current.focus[1])
    title.textContent = current.title
    description.textContent = current.description
    panel.setAttribute('aria-labelledby', prefix + '-tab-' + current.id)
    replay.hidden = !linkedWork(works, current.workId)
    replay.setAttribute('aria-label', '回到实战，查看' + current.title)
    for (const button of tablist.children) {
      const selected = button.dataset.equipment === current.id
      button.setAttribute('aria-selected', String(selected))
      button.tabIndex = selected ? 0 : -1
    }
    for (const button of points.children) {
      button.setAttribute('aria-pressed', String(button.dataset.equipment === current.id))
    }
  }

  function select(id) {
    const next = equipment.find((item) => item.id === id)
    if (!next || next === current) return
    current = next
    render()
  }

  equipment.forEach((item) => {
    const tab = document.createElement('button')
    tab.type = 'button'
    tab.role = 'tab'
    tab.id = prefix + '-tab-' + item.id
    tab.dataset.equipment = item.id
    tab.setAttribute('aria-controls', panel.id)
    tab.textContent = item.label
    tab.addEventListener('click', () => select(item.id))
    tablist.append(tab)

    const point = document.createElement('button')
    point.type = 'button'
    point.className = 'equipment-point'
    point.dataset.equipment = item.id
    point.style.left = item.focus[0]
    point.style.top = item.focus[1]
    point.setAttribute('aria-label', '查看' + item.title)
    point.addEventListener('click', () => select(item.id))
    points.append(point)
  })

  tablist.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const index = equipment.indexOf(current)
    const step = event.key === 'ArrowLeft' ? -1 : 1
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? equipment.length - 1 : (index + step + equipment.length) % equipment.length
    select(equipment[nextIndex].id)
    tablist.children[nextIndex].focus({ preventScroll: true })
  })

  replay.addEventListener('click', () => {
    const work = linkedWork(works, current.workId)
    if (work) openReplay(work, replay, current.offset)
  })
  image.addEventListener('error', () => {
    root.classList.add('equipment-image-error')
    points.hidden = true
  }, { once: true })

  render()

  return {
    setWorks(items) {
      works = Array.isArray(items) ? items : []
      render()
    },
  }
}
