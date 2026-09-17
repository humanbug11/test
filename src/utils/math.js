export const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v))

export const lerp = (a, b, t) => a + (b - a) * t

/** フレームレート非依存の補間（tは「1秒でどれだけ寄るか」） */
export const damp = (a, b, t, dt) => lerp(a, b, 1 - Math.pow(1 - t, dt * 60))

export const map = (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c)

export const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

export const randomRange = (min, max) => min + Math.random() * (max - min)
