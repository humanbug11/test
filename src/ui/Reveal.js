import { clamp } from '../utils/math.js'

/**
 * テキストの分割とスクロール連動の出現演出。
 * - [data-split]       : 行をマスクして下からせり上げる
 * - [data-split-words] : 単語単位でスクロールに応じて点灯させる
 * - [data-reveal]      : 交差したらフェードアップ
 */
export class Reveal {
  constructor() {
    this.wordBlocks = []
  }

  init() {
    this._splitLines()
    this._splitWords()
    this._observe()
    return this
  }

  _splitLines() {
    document.querySelectorAll('[data-split]').forEach((el) => {
      const inner = document.createElement('span')
      inner.className = 'split__inner'
      inner.innerHTML = el.innerHTML
      el.innerHTML = ''
      el.classList.add('split')
      el.appendChild(inner)
    })
  }

  _splitWords() {
    document.querySelectorAll('[data-split-words]').forEach((el) => {
      const words = el.textContent.trim().split(/\s+/)
      el.innerHTML = words
        .map((w) => `<span class="word">${w}</span>`)
        .join(' ')
      this.wordBlocks.push({ el, words: [...el.querySelectorAll('.word')] })
    })
  }

  _observe() {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('is-in')
          io.unobserve(entry.target)
        })
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
    )

    document.querySelectorAll('[data-reveal], .split').forEach((el, i) => {
      // 兄弟要素どうしを少しずらして連鎖させる
      const siblings = [...(el.parentElement?.children || [])]
      const index = siblings.indexOf(el)
      el.style.transitionDelay = `${Math.min(index, 6) * 90}ms`
      io.observe(el)
    })
    this.io = io
  }

  /** 単語の点灯はスクロール位置から毎フレーム算出する */
  update() {
    const vh = window.innerHeight
    for (const block of this.wordBlocks) {
      const rect = block.el.getBoundingClientRect()
      if (rect.bottom < 0 || rect.top > vh) continue
      const progress = clamp((vh * 0.82 - rect.top) / (rect.height + vh * 0.25), 0, 1)
      const lit = Math.round(progress * block.words.length)
      for (let i = 0; i < block.words.length; i++) {
        block.words[i].classList.toggle('is-lit', i < lit)
      }
    }
  }

  dispose() {
    this.io?.disconnect()
  }
}
