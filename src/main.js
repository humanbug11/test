import './styles/main.css'

import { Stage } from './core/Stage.js'
import { state } from './core/state.js'
import { SmoothScroll } from './ui/SmoothScroll.js'
import { Cursor } from './ui/Cursor.js'
import { Magnetic } from './ui/Magnetic.js'
import { Reveal } from './ui/Reveal.js'
import { Preloader } from './ui/Preloader.js'
import { WorkList } from './ui/WorkList.js'

const canvas = document.querySelector('#webgl')
const container = document.querySelector('[data-scroll-container]')
const preloader = new Preloader(document.querySelector('[data-preloader]'))

/** ポインタ座標の収集（マウス／タッチ共通） */
function bindPointer() {
  const set = (x, y) => {
    state.pointer.x = x
    state.pointer.y = y
    state.pointer.rawNx = (x / window.innerWidth) * 2 - 1
    state.pointer.rawNy = -((y / window.innerHeight) * 2 - 1)
  }
  window.addEventListener('pointermove', (e) => set(e.clientX, e.clientY), { passive: true })
  window.addEventListener('pointerdown', () => (state.pointer.down = true))
  window.addEventListener('pointerup', () => (state.pointer.down = false))
  window.addEventListener('pointerleave', () => {
    state.pointer.rawNx = 0
    state.pointer.rawNy = 0
  })
  set(window.innerWidth / 2, window.innerHeight / 2)
  state.pointer.nx = state.pointer.rawNx
  state.pointer.ny = state.pointer.rawNy
}

/** ナビの時計（JST） */
function bindClock() {
  const el = document.querySelector('[data-clock]')
  if (!el) return
  const tick = () => {
    const now = new Date().toLocaleTimeString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      hour12: false
    })
    el.textContent = `${now} JST`
  }
  tick()
  setInterval(tick, 1000)
}

async function boot() {
  bindPointer()
  bindClock()
  preloader.set(0.15)

  const reveal = new Reveal().init()
  const scroll = new SmoothScroll(container).init()
  const cursor = new Cursor(document.querySelector('[data-cursor]')).init()
  const magnetic = new Magnetic().init()
  preloader.set(0.35)

  const stage = new Stage(canvas)

  // プリローダのRAF（Stageの初期化中も数字を回し続ける）
  let bootLoop = true
  const preTick = () => {
    preloader.update()
    if (bootLoop) requestAnimationFrame(preTick)
  }
  requestAnimationFrame(preTick)

  try {
    await stage.init()
  } catch (err) {
    // WebGLが使えない環境でもDOMコンテンツは読めるようにする
    console.error('[webgl] initialisation failed', err)
    document.body.classList.remove('is-loading')
    document.querySelector('[data-preloader]')?.classList.add('is-done')
    canvas.style.display = 'none'
    bootLoop = false
    return
  }

  // プリローダが開いたら、ガラスの物体を画面上から降らせる
  preloader.onReveal = () => stage.glass.release()

  new WorkList(stage).init()
  preloader.set(0.85)

  // DOM側の毎フレーム更新をStageのループに相乗りさせる
  stage.onUpdate = (dt) => {
    scroll.update(dt)
    cursor.update(dt)
    magnetic.update(dt)
    reveal.update()
    preloader.update()
  }

  stage.start()
  bootLoop = false

  // 最初のフレームが描けてからプリローダを開ける
  requestAnimationFrame(() => {
    requestAnimationFrame(async () => {
      await preloader.finish()
      scroll.refresh()
    })
  })

  // フォント読み込み後にレイアウトが変わるので測り直す
  document.fonts?.ready.then(() => scroll.refresh())

  if (import.meta.env?.DEV) window.__stage = stage
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}
