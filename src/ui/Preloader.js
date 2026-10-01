import { clamp } from '../utils/math.js'

/**
 * 進捗カウンタ付きのプリローダ。
 * 実際の初期化完了（Promise）を待ちつつ、数字はイージングで滑らかに進める。
 */
export class Preloader {
  constructor(root) {
    this.el = root
    this.count = root.querySelector('[data-preloader-count]')
    this.bar = root.querySelector('[data-preloader-bar]')
    this.value = 0
    this.target = 0
    this.done = false
    /** プリローダが開き始めた瞬間に呼ばれる（物体を降らせる合図など） */
    this.onReveal = null
    this._last = performance.now()
  }

  /** 0..1 */
  set(progress) {
    this.target = Math.max(this.target, clamp(progress))
  }

  /** 初期化完了後に呼ぶ。演出が終わるまで解決しないPromiseを返す */
  finish() {
    this.target = 1
    return new Promise((resolve) => {
      this._resolve = resolve
    })
  }

  update() {
    if (this.done) return
    // レンダリングが重い環境でも数字が固まらないよう、実時間で進める
    const now = performance.now()
    const dt = Math.min((now - this._last) / 1000, 0.1)
    this._last = now

    const ease = (this.target - this.value) * Math.min(1, dt * 4.5)
    const floor = this.target === 1 ? dt * 0.6 : 0
    this.value = Math.min(this.target, this.value + Math.max(ease, floor))
    const pct = Math.round(this.value * 100)
    this.count.textContent = String(pct).padStart(2, '0')
    this.bar.style.transform = `scaleX(${this.value.toFixed(3)})`

    if (this.target === 1 && pct >= 100) {
      this.done = true
      this.el.classList.add('is-done')
      document.body.classList.remove('is-loading')
      this.onReveal?.()
      // ヒーローの行送り演出を開始
      requestAnimationFrame(() => {
        document.querySelectorAll('.hero .split').forEach((el, i) => {
          el.style.transitionDelay = `${i * 110}ms`
          el.classList.add('is-in')
        })
        document.querySelectorAll('.hero [data-reveal]').forEach((el, i) => {
          el.style.transitionDelay = `${420 + i * 120}ms`
          el.classList.add('is-in')
        })
      })
      setTimeout(() => this._resolve?.(), 800)
    }
  }
}
