import { damp } from '../utils/math.js'
import { state } from '../core/state.js'

/** マウスに吸い付くボタン／リンク。毎フレームまとめて更新する。 */
export class Magnetic {
  constructor(selector = '[data-magnetic]', strength = 0.35) {
    this.items = [...document.querySelectorAll(selector)].map((el) => ({
      el,
      current: { x: 0, y: 0 },
      target: { x: 0, y: 0 },
      hovering: false,
      rect: null
    }))
    this.strength = strength
    this.enabled = state.pointer.hasFinePointer && !state.quality.reducedMotion
  }

  init() {
    if (!this.enabled) return this
    this.items.forEach((item) => {
      item.el.addEventListener('mouseenter', () => {
        item.rect = item.el.getBoundingClientRect()
        item.hovering = true
      })
      item.el.addEventListener('mouseleave', () => {
        item.hovering = false
        item.target.x = 0
        item.target.y = 0
      })
    })
    return this
  }

  update(dt) {
    if (!this.enabled) return
    for (const item of this.items) {
      if (item.hovering && item.rect) {
        const cx = item.rect.left + item.rect.width / 2
        const cy = item.rect.top + item.rect.height / 2
        item.target.x = (state.pointer.x - cx) * this.strength
        item.target.y = (state.pointer.y - cy) * this.strength
      }
      item.current.x = damp(item.current.x, item.target.x, 0.18, dt)
      item.current.y = damp(item.current.y, item.target.y, 0.18, dt)
      if (Math.abs(item.current.x) < 0.01 && Math.abs(item.current.y) < 0.01) {
        item.el.style.transform = ''
      } else {
        item.el.style.transform = `translate3d(${item.current.x.toFixed(2)}px, ${item.current.y.toFixed(2)}px, 0)`
      }
    }
  }
}
