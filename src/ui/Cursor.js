import { state } from '../core/state.js'
import { damp } from '../utils/math.js'

/** リング＋ドットのカスタムカーソル。ドットは即応、リングは遅れて追う。 */
export class Cursor {
  constructor(root) {
    this.el = root
    this.dot = root.querySelector('.cursor__dot')
    this.ring = root.querySelector('.cursor__ring')
    this.label = root.querySelector('.cursor__label')
    this.pos = { x: 0, y: 0 }
    this.ringPos = { x: 0, y: 0 }
    this.enabled = state.pointer.hasFinePointer
    this._mode = ''
  }

  init() {
    if (!this.enabled) return this
    this.pos.x = this.ringPos.x = window.innerWidth / 2
    this.pos.y = this.ringPos.y = window.innerHeight / 2

    const hoverables = document.querySelectorAll('a, button, [data-magnetic], [data-project]')
    hoverables.forEach((el) => {
      el.addEventListener('mouseenter', () => {
        this.el.classList.add('is-active')
        this.label.textContent = el.dataset.cursorLabel || el.dataset.title || 'View'
      })
      el.addEventListener('mouseleave', () => this.el.classList.remove('is-active'))
    })
    return this
  }

  update(dt) {
    if (!this.enabled) return

    // ガラス球の上では「Drag」、掴んでいる間は「Drop」を表示
    const mode = state.pointer.grabbing ? 'Drop' : state.pointer.overObject ? 'Drag' : ''
    if (mode !== this._mode) {
      this._mode = mode
      this.el.classList.toggle('is-grab', !!mode)
      if (mode && !this.el.classList.contains('is-active')) this.label.textContent = mode
    }
    this.pos.x = damp(this.pos.x, state.pointer.x, 0.5, dt)
    this.pos.y = damp(this.pos.y, state.pointer.y, 0.5, dt)
    this.ringPos.x = damp(this.ringPos.x, state.pointer.x, 0.18, dt)
    this.ringPos.y = damp(this.ringPos.y, state.pointer.y, 0.18, dt)

    this.dot.style.transform = `translate3d(${this.pos.x}px, ${this.pos.y}px, 0) translate(-50%, -50%)`
    this.ring.style.transform = `translate3d(${this.ringPos.x}px, ${this.ringPos.y}px, 0) translate(-50%, -50%)`
  }
}
