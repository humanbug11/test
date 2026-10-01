/**
 * アプリ全体で共有する読み取り専用に近いステート。
 * WebGL側・DOM側の双方がここを見て動く（イベントの相互依存を避けるため）。
 */
export const state = {
  time: { elapsed: 0, delta: 1 / 60 },
  sizes: { width: 1, height: 1, dpr: 1, aspect: 1 },
  pointer: {
    x: 0, y: 0,            // px
    nx: 0, ny: 0,          // -1..1（スムージング済み）
    rawNx: 0, rawNy: 0,    // -1..1（生値）
    speed: 0,
    down: false,
    overObject: false,     // カーソルが掴めるガラス球の上にある
    grabbing: false,       // ガラス球を掴んでいる最中
    hasFinePointer: true
  },
  scroll: {
    target: 0,
    current: 0,
    velocity: 0,
    progress: 0,
    limit: 1
  },
  quality: {
    tier: 'high',          // 'high' | 'medium' | 'low'
    reducedMotion: false
  },
  accent: { r: 1, g: 0.3, b: 0.16 }
}

export const isTouch = () =>
  typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches
