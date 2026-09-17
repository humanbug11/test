import * as THREE from 'three'
import { state } from '../core/state.js'
import { damp, clamp } from '../utils/math.js'
import { simplex3d } from '../shaders/noise.glsl.js'

/**
 * Work一覧のホバーで出るプレビュー面。
 * カーソルを追い、カーソル速度に応じて面が「なびく」ように歪む。
 * 画像は持たず、プロジェクトごとの2色からプロシージャルに生成する。
 */
export class HoverPreview {
  constructor(stage) {
    this.stage = stage
    this.group = new THREE.Group()
    this.planeZ = 1.9
    this.active = false
    this._target = new THREE.Vector3()
    this._prevPointer = new THREE.Vector2()
    this._velocity = new THREE.Vector2()

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uHover: { value: 0 },
        uVelocity: { value: new THREE.Vector2() },
        uColorA: { value: new THREE.Color('#ff4d29') },
        uColorB: { value: new THREE.Color('#2b1055') },
        uRadius: { value: 0.12 }
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uHover;
        uniform vec2 uVelocity;
        varying vec2 vUv;
        varying float vWave;

        void main() {
          vUv = uv;
          vec3 pos = position;

          // カーソル速度で面をたわませる
          float bend = (uv.x - 0.5) * uVelocity.x + (uv.y - 0.5) * uVelocity.y;
          float wave = sin(uv.x * 4.0 + uTime * 1.6) * cos(uv.y * 3.0 - uTime * 1.1);
          pos.z += bend * 1.6 + wave * 0.06 * uHover;
          pos.xy *= mix(0.65, 1.0, uHover);
          vWave = wave;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uHover;
        uniform float uRadius;
        uniform vec2 uVelocity;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        varying vec2 vUv;
        varying float vWave;

        ${simplex3d}

        // 角丸長方形のマスク
        float roundedBox(vec2 uv, vec2 half_, float r) {
          vec2 q = abs(uv) - half_ + r;
          return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
        }

        void main() {
          vec2 uv = vUv;
          vec2 centered = (uv - 0.5) * 2.0;

          float n = snoise(vec3(uv * 2.4, uTime * 0.25));
          vec2 distorted = uv + vec2(n * 0.06, -n * 0.04) - uVelocity * 0.25;

          float grad = clamp(distorted.x * 0.6 + distorted.y * 0.7 + n * 0.25, 0.0, 1.0);
          vec3 col = mix(uColorB, uColorA, grad);
          col += pow(clamp(1.0 - length(centered) * 0.8, 0.0, 1.0), 3.0) * 0.25;
          col += vWave * 0.03;

          float sd = roundedBox(centered * vec2(1.0, 0.66), vec2(0.96, 0.62), uRadius);
          float mask = smoothstep(0.02, -0.02, sd);
          float alpha = mask * uHover * 0.94;
          if (alpha < 0.005) discard;

          gl_FragColor = vec4(col, alpha);
        }
      `
    })

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 1.35, 32, 24), this.material)
    this.mesh.position.z = this.planeZ
    this.mesh.renderOrder = 5
    this.group.add(this.mesh)
  }

  show(colorA, colorB) {
    this.active = true
    this.material.uniforms.uColorA.value.set(colorA)
    this.material.uniforms.uColorB.value.set(colorB)
  }

  hide() {
    this.active = false
  }

  update(dt) {
    const u = this.material.uniforms
    u.uTime.value = state.time.elapsed
    u.uHover.value = damp(u.uHover.value, this.active ? 1 : 0, 0.12, dt)

    if (u.uHover.value < 0.002 && !this.active) {
      this.mesh.visible = false
      return
    }
    this.mesh.visible = true

    // カーソル速度（正規化座標の差分）
    const vx = state.pointer.nx - this._prevPointer.x
    const vy = state.pointer.ny - this._prevPointer.y
    this._prevPointer.set(state.pointer.nx, state.pointer.ny)
    this._velocity.x = damp(this._velocity.x, clamp(vx * 6, -1, 1), 0.2, dt)
    this._velocity.y = damp(this._velocity.y, clamp(vy * 6, -1, 1), 0.2, dt)
    u.uVelocity.value.copy(this._velocity)

    // z=planeZ の平面上でカーソルに合わせる（透視のスケール補正込み）
    this.stage.pxToWorld(state.pointer.x, state.pointer.y, this._target)
    const k = (this.stage.camera.position.z - this.planeZ) / this.stage.camera.position.z
    this.mesh.position.x = damp(this.mesh.position.x, this._target.x * k, 0.12, dt)
    this.mesh.position.y = damp(this.mesh.position.y, this._target.y * k, 0.12, dt)
    this.mesh.rotation.z = damp(this.mesh.rotation.z, -this._velocity.x * 0.25, 0.1, dt)
    this.mesh.rotation.y = damp(this.mesh.rotation.y, this._velocity.x * 0.4, 0.1, dt)
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
