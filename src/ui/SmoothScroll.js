import { state, isTouch, prefersReducedMotion } from '../core/state.js'
import { damp, clamp } from '../utils/math.js'

/**
 * 慣性スクロール。
 * ネイティブスクロールは殺さず（スクロールバー・キーボード操作を維持）、
 * コンテナをtransformで遅延追従させる方式。
 * タッチ端末と prefers-reduced-motion では素のスクロールにフォールバックする。
 */
export class SmoothScroll {
  constructor(container) {
    this.el = container
    this.enabled = !isTouch() && !prefersReducedMotion()
    this.spacer = null
    this.height = 0
  }

  init() {
    if (this.enabled) {
      document.body.classList.add('has-smooth-scroll')
      this.spacer = document.createElement('div')
      this.spacer.className = 'scroll-spacer'
      this.spacer.setAttribute('aria-hidden', 'true')
      document.body.appendChild(this.spacer)

      this.observer = new ResizeObserver(() => this.refresh())
      this.observer.observe(this.el)
    }
    this._onResize = () => this.refresh()
    window.addEventListener('resize', this._onResize)
    this.refresh()
    this._bindAnchors()
    return this
  }

  refresh() {
    this.height = this.el.getBoundingClientRect().height
    if (this.spacer) this.spacer.style.height = `${this.height}px`
    state.scroll.limit = Math.max(1, this.height - window.innerHeight)
  }

  _bindAnchors() {
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href').slice(1)
        const target = document.getElementById(id)
        if (!target) return
        e.preventDefault()
        // fixedコンテナ内の要素なので、現在のスクロール量を足して絶対位置にする
        const top = target.getBoundingClientRect().top + (this.enabled ? state.scroll.current : window.scrollY)
        window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
      })
    })
  }

  update(dt) {
    const s = state.scroll
    s.target = window.scrollY
    const prev = s.current
    s.current = this.enabled ? damp(s.current, s.target, 0.12, dt) : s.target
    if (Math.abs(s.target - s.current) < 0.05) s.current = s.target

    s.velocity = s.current - prev
    s.progress = clamp(s.current / s.limit, 0, 1)

    if (this.enabled) {
      this.el.style.transform = `translate3d(0, ${-s.current.toFixed(2)}px, 0)`
    }
  }

  dispose() {
    window.removeEventListener('resize', this._onResize)
    this.observer?.disconnect()
    this.spacer?.remove()
    document.body.classList.remove('has-smooth-scroll')
  }
}
