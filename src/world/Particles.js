import * as THREE from 'three'
import { state } from '../core/state.js'
import { simplex3d } from '../shaders/noise.glsl.js'
import { damp, clamp, smoothstep } from '../utils/math.js'

/**
 * GPUパーティクル。3つの形状（球 / トーラスノット / 波）を
 * スクロール量に応じて頂点シェーダ内でモーフィングさせる。
 * CPU側は毎フレーム uniform を更新するだけ。
 */
export class Particles {
  constructor(stage) {
    this.stage = stage
    this.group = new THREE.Group()
    this._pointer = new THREE.Vector3()

    const tier = state.quality.tier
    this.count = tier === 'low' ? 14000 : tier === 'medium' ? 36000 : 70000

    const geometry = new THREE.BufferGeometry()
    const posA = new Float32Array(this.count * 3)
    const posB = new Float32Array(this.count * 3)
    const posC = new Float32Array(this.count * 3)
    const seeds = new Float32Array(this.count)
    const scales = new Float32Array(this.count)

    const golden = Math.PI * (3 - Math.sqrt(5))

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3
      const t = i / this.count

      // A: フィボナッチ球
      const y = 1 - t * 2
      const r = Math.sqrt(Math.max(0, 1 - y * y))
      const theta = golden * i
      const radius = 2.5 + (Math.random() - 0.5) * 0.12
      posA[i3] = Math.cos(theta) * r * radius
      posA[i3 + 1] = y * radius
      posA[i3 + 2] = Math.sin(theta) * r * radius

      // B: トーラスノット (p=2, q=3)
      const u = t * Math.PI * 4
      const p = 2
      const q = 3
      const cr = 2.0 + Math.cos(q * u) * 0.55
      const tube = 0.42
      const cx = cr * Math.cos(p * u)
      const cy = cr * Math.sin(p * u)
      const cz = Math.sin(q * u) * 0.9
      const a1 = Math.random() * Math.PI * 2
      const a2 = Math.acos(2 * Math.random() - 1)
      posB[i3] = cx + Math.sin(a2) * Math.cos(a1) * tube
      posB[i3 + 1] = cy + Math.sin(a2) * Math.sin(a1) * tube
      posB[i3 + 2] = cz + Math.cos(a2) * tube

      // C: 波打つ格子
      const side = Math.ceil(Math.sqrt(this.count))
      const gx = (i % side) / side - 0.5
      const gz = Math.floor(i / side) / side - 0.5
      posC[i3] = gx * 9.5
      posC[i3 + 1] = Math.sin(gx * 7.0) * Math.cos(gz * 6.0) * 0.85
      posC[i3 + 2] = gz * 9.5

      seeds[i] = Math.random()
      scales[i] = 0.35 + Math.random() * 0.9
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(posA, 3))
    geometry.setAttribute('aPosB', new THREE.BufferAttribute(posB, 3))
    geometry.setAttribute('aPosC', new THREE.BufferAttribute(posC, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1))
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8)

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uMorph: { value: 0 },
        uOpacity: { value: 0 },
        uSize: { value: 26 * state.sizes.dpr },
        uPointer: { value: new THREE.Vector3(999, 999, 0) },
        uColorA: { value: new THREE.Color('#ff4d29') },
        uColorB: { value: new THREE.Color('#5f6bff') },
        uColorC: { value: new THREE.Color('#e9f0ff') }
      },
      vertexShader: /* glsl */ `
        attribute vec3 aPosB;
        attribute vec3 aPosC;
        attribute float aSeed;
        attribute float aScale;

        uniform float uTime;
        uniform float uMorph;
        uniform float uSize;
        uniform vec3 uPointer;

        varying float vSeed;
        varying float vDepth;

        ${simplex3d}

        void main() {
          // 0..1 で 球→ノット、1..2 で ノット→波
          vec3 pos = mix(position, aPosB, smoothstep(0.0, 1.0, clamp(uMorph, 0.0, 1.0)));
          pos = mix(pos, aPosC, smoothstep(0.0, 1.0, clamp(uMorph - 1.0, 0.0, 1.0)));

          // ゆらぎ（simplexでカール風の変位）
          float t = uTime * 0.18 + aSeed * 6.283;
          vec3 flow = vec3(
            snoise(pos * 0.28 + vec3(t, 0.0, 0.0)),
            snoise(pos * 0.28 + vec3(0.0, t, 12.0)),
            snoise(pos * 0.28 + vec3(5.0, 0.0, t))
          );
          pos += flow * (0.28 + aSeed * 0.3);

          // カーソルからの斥力
          vec3 toPointer = pos - uPointer;
          float d = length(toPointer);
          float influence = smoothstep(2.4, 0.0, d);
          pos += normalize(toPointer + 0.0001) * influence * 1.1;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = uSize * aScale * (1.0 / max(-mvPosition.z, 0.1));

          vSeed = aSeed + influence * 0.6;
          vDepth = clamp(-mvPosition.z / 14.0, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform vec3 uColorC;
        uniform float uOpacity;

        varying float vSeed;
        varying float vDepth;

        void main() {
          // 丸く柔らかい点に整形
          float d = length(gl_PointCoord - 0.5);
          float alpha = smoothstep(0.5, 0.05, d);
          if (alpha < 0.01) discard;

          vec3 col = mix(uColorA, uColorB, smoothstep(0.0, 0.7, vSeed));
          col = mix(col, uColorC, smoothstep(0.7, 1.4, vSeed));
          col *= 1.0 - vDepth * 0.55;

          gl_FragColor = vec4(col, alpha * uOpacity);
        }
      `
    })

    this.points = new THREE.Points(geometry, this.material)
    this.points.frustumCulled = false
    this.group.add(this.points)
    // テキストの可読性を確保するため、やや奥・やや右に寄せる
    this.group.position.set(state.sizes.width > 1024 ? 1.1 : 0, 0, -3.2)
    this.group.scale.setScalar(0.92)
  }

  resize() {
    this.group.position.x = state.sizes.width > 1024 ? 1.1 : 0
    this.material.uniforms.uSize.value = 26 * state.sizes.dpr * clamp(state.sizes.width / 1440, 0.6, 1.2)
  }

  update(dt) {
    const u = this.material.uniforms
    const p = state.scroll.progress

    u.uTime.value = state.time.elapsed

    // スクロール前半はヒーローのガラスが主役なので、粒子は後半で立ち上げる
    const morphTarget = clamp((p - 0.18) / 0.62, 0, 1) * 2
    u.uMorph.value = damp(u.uMorph.value, morphTarget, 0.05, dt)

    const visible = smoothstep(0.12, 0.42, p) * (1 - smoothstep(0.88, 1.0, p) * 0.35)
    u.uOpacity.value = damp(u.uOpacity.value, visible * 0.42, 0.06, dt)

    if (state.pointer.hasFinePointer) {
      this.stage.pxToWorld(state.pointer.x, state.pointer.y, this._pointer)
      this._pointer.sub(this.group.position)
      u.uPointer.value.lerp(this._pointer, 1 - Math.pow(0.005, dt))
    }

    const speed = state.quality.reducedMotion ? 0.15 : 1
    this.group.rotation.y += dt * 0.06 * speed
    this.group.rotation.x = damp(this.group.rotation.x, -0.25 + p * 0.85, 0.05, dt)
    this.group.position.y = damp(this.group.position.y, 1.0 - p * 1.4, 0.05, dt)
  }

  dispose() {
    this.points.geometry.dispose()
    this.material.dispose()
  }
}
