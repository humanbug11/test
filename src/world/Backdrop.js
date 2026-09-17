import * as THREE from 'three'
import { state } from '../core/state.js'
import { simplex3d } from '../shaders/noise.glsl.js'
import { damp } from '../utils/math.js'

/**
 * 背景のグラデーション面。fbmノイズをゆっくり流し、
 * 現在のセクションのアクセントカラーへ滑らかに寄せる。
 * 屈折マテリアルの「映り込み先」も兼ねるので、必ずシーン最奥に置く。
 */
export class Backdrop {
  constructor(stage) {
    this.stage = stage
    this.group = new THREE.Group()
    this.z = -9

    this.material = new THREE.ShaderMaterial({
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uPointer: { value: new THREE.Vector2() },
        uColorA: { value: new THREE.Color('#ff4d29') },
        uColorB: { value: new THREE.Color('#2b1055') },
        uBase: { value: new THREE.Color('#05060a') },
        uIntensity: { value: 0.75 },
        uAspect: { value: 1.6 }
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uIntensity;
        uniform float uAspect;
        uniform vec2 uPointer;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform vec3 uBase;
        varying vec2 vUv;

        ${simplex3d}

        float fbm(vec3 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * snoise(p);
            p *= 2.02;
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec2 uv = vUv;
          // 面のアスペクトを補正して、光の広がりが縦長に潰れないようにする
          vec2 p = (uv - 0.5) * vec2(max(uAspect, 0.6), 1.0);
          p -= uPointer * 0.12;

          float t = uTime * 0.05;
          float n = fbm(vec3(p * 1.7, t));
          float n2 = fbm(vec3(p * 3.1 + 12.4, t * 1.6));

          // 中央から広がる淡い光
          float glow = smoothstep(0.85, 0.0, length(p) * 1.6);
          float bands = smoothstep(-0.2, 0.9, n + n2 * 0.35);

          vec3 col = mix(uBase, uColorB, bands * 0.5 * uIntensity);
          col = mix(col, uColorA, pow(glow, 3.0) * (0.22 + n2 * 0.16) * uIntensity);
          col += pow(glow, 8.0) * 0.04;

          gl_FragColor = vec4(col, 1.0);
        }
      `
    })

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 1), this.material)
    this.mesh.position.z = this.z
    this.mesh.renderOrder = -1
    this.group.add(this.mesh)

    this.targetA = new THREE.Color('#ff4d29')
    this.targetB = new THREE.Color('#2b1055')
  }

  /** work項目のホバー等に合わせて背景色を差し替える */
  setColors(a, b) {
    this.targetA.set(a)
    this.targetB.set(b)
  }

  resize() {
    const camera = this.stage.camera
    const dist = camera.position.z - this.z
    const vFov = (camera.fov * Math.PI) / 180
    const height = 2 * Math.tan(vFov / 2) * dist
    // カメラのパララックス移動ぶんの余白を上乗せ
    const w = height * camera.aspect * 1.25
    const h = height * 1.25
    this.mesh.scale.set(w, h, 1)
    this.material.uniforms.uAspect.value = w / h
  }

  update(dt) {
    const u = this.material.uniforms
    u.uTime.value = state.time.elapsed
    u.uPointer.value.set(state.pointer.nx, state.pointer.ny)
    u.uColorA.value.lerp(this.targetA, 1 - Math.pow(0.001, dt))
    u.uColorB.value.lerp(this.targetB, 1 - Math.pow(0.001, dt))
    u.uIntensity.value = damp(u.uIntensity.value, 0.4 + state.scroll.progress * 0.28, 0.05, dt)
    state.accent.r = u.uColorA.value.r
    state.accent.g = u.uColorA.value.g
    state.accent.b = u.uColorA.value.b
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
