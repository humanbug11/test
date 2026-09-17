/**
 * Work一覧のホバーを、WebGL側（プレビュー面・背景色）へ橋渡しする。
 */
export class WorkList {
  constructor(stage) {
    this.stage = stage
    this.items = [...document.querySelectorAll('[data-project]')]
    this.defaultColors = ['#ff4d29', '#2b1055']
  }

  init() {
    this.items.forEach((el) => {
      const a = el.dataset.color
      const b = el.dataset.colorB
      el.addEventListener('mouseenter', () => {
        this.stage.preview.show(a, b)
        this.stage.backdrop.setColors(a, b)
      })
      el.addEventListener('mouseleave', () => {
        this.stage.preview.hide()
        this.stage.backdrop.setColors(...this.defaultColors)
      })
      el.addEventListener('click', () => {
        // デモのため遷移はしない。実案件ではここでページ遷移演出に繋ぐ。
        el.animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(12px)' }, { transform: 'translateX(0)' }],
          { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' }
        )
      })
    })
    return this
  }
}
