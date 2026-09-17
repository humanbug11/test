import * as THREE from 'three'
import { state } from '../core/state.js'
import { damp, randomRange, clamp } from '../utils/math.js'

const SHAPES = [
  { geo: () => new THREE.TorusKnotGeometry(0.62, 0.2, 180, 32), scale: 1.0 },
  { geo: () => new THREE.IcosahedronGeometry(0.85, 1), scale: 1.0 },
  { geo: () => new THREE.SphereGeometry(0.72, 64, 64), scale: 1.0 },
  { geo: () => new THREE.TorusGeometry(0.6, 0.24, 64, 128), scale: 1.0 },
  { geo: () => new THREE.CapsuleGeometry(0.35, 0.7, 16, 32), scale: 1.0 },
  { geo: () => new THREE.IcosahedronGeometry(0.78, 2), scale: 1.0 },
  { geo: () => new THREE.TorusKnotGeometry(0.5, 0.16, 160, 32, 3, 4), scale: 1.0 }
]

/**
 * ヒーローの屈折オブジェクト群。
 * 各メッシュは「基準位置へ戻るバネ」＋「カーソルからの斥力」で動く。
 * 物理エンジンは使わず、軽いスプリング積分だけで質量感を出す。
 */
export class GlassCluster {
  constructor(stage) {
    this.stage = stage
    this.group = new THREE.Group()
    this.items = []
    this._pointerWorld = new THREE.Vector3()
    this._tmp = new THREE.Vector3()

    const tier = state.quality.tier
    const count = tier === 'low' ? 4 : tier === 'medium' ? 6 : 7

    this.material = this._createMaterial()

    for (let i = 0; i < count; i++) {
      const shape = SHAPES[i % SHAPES.length]
      const geometry = shape.geo()
      const mesh = new THREE.Mesh(geometry, this.material)

      const angle = (i / count) * Math.PI * 2 + 0.35
      const radius = randomRange(1.7, 2.7)
      const base = new THREE.Vector3(
        Math.cos(angle) * radius * 1.25,
        Math.sin(angle) * radius * 0.62,
        randomRange(-1.6, 1.1)
      )

      mesh.position.copy(base)
      const s = randomRange(0.5, 0.92)
      mesh.scale.setScalar(s * shape.scale)

      this.items.push({
        mesh,
        base,
        velocity: new THREE.Vector3(),
        spin: new THREE.Vector3(randomRange(-0.3, 0.3), randomRange(-0.4, 0.4), randomRange(-0.2, 0.2)),
        phase: Math.random() * Math.PI * 2,
        floatAmp: randomRange(0.12, 0.34),
        mass: 1 / s
      })
      this.group.add(mesh)
    }
  }

  _createMaterial() {
    if (state.quality.tier === 'low') {
      // 透過は負荷が高いので、低品質では金属＋環境マップで代替
      return new THREE.MeshStandardMaterial({
        color: 0xdfe6ff,
        metalness: 0.95,
        roughness: 0.12,
        envMapIntensity: 1.4
      })
    }
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 1,
      thickness: 1.35,
      roughness: 0.06,
      metalness: 0,
      ior: 1.55,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      iridescence: 1,
      iridescenceIOR: 1.32,
      iridescenceThicknessRange: [120, 700],
      attenuationColor: new THREE.Color('#8ba4ff'),
      attenuationDistance: 3.4,
      envMapIntensity: 1.25,
      specularIntensity: 1
    })
  }

  resize() {
    // 画面が狭いほど群を小さくして、テキストと干渉させない
    const k = clamp(state.sizes.width / 1280, 0.62, 1)
    this.group.scale.setScalar(k)
  }

  update(dt) {
    const t = state.time.elapsed
    const reduced = state.quality.reducedMotion
    const speed = reduced ? 0.25 : 1

    // カーソル位置をワールド座標へ
    this.stage.pxToWorld(state.pointer.x, state.pointer.y, this._pointerWorld)

    for (const item of this.items) {
      const { mesh, base, velocity } = item

      // 1. 基準位置へ戻すバネ
      this._tmp.copy(base)
      this._tmp.y += Math.sin(t * 0.55 * speed + item.phase) * item.floatAmp
      this._tmp.x += Math.cos(t * 0.38 * speed + item.phase) * item.floatAmp * 0.6
      this._tmp.y -= state.scroll.progress * 2.2
      this._tmp.sub(mesh.position).multiplyScalar(3.4)
      velocity.addScaledVector(this._tmp, dt)

      // 2. カーソルからの斥力
      if (state.pointer.hasFinePointer && !reduced) {
        this._tmp.copy(mesh.position).sub(this._pointerWorld)
        this._tmp.z = 0
        const dist = this._tmp.length()
        const range = 2.6
        if (dist < range && dist > 0.0001) {
          const force = (1 - dist / range) ** 2 * 26 * item.mass
          velocity.addScaledVector(this._tmp.normalize(), force * dt)
        }
      }

      // 3. 減衰と積分
      velocity.multiplyScalar(Math.pow(0.02, dt))
      mesh.position.addScaledVector(velocity, dt)

      // 4. 自転（速度が乗るほど速く回す）
      const boost = 1 + clamp(velocity.length() * 0.25, 0, 3)
      mesh.rotation.x += item.spin.x * dt * boost * speed
      mesh.rotation.y += item.spin.y * dt * boost * speed
      mesh.rotation.z += item.spin.z * dt * boost * speed
    }

    // スクロールで群全体をゆっくり奥へ送る
    this.group.position.z = damp(this.group.position.z, -state.scroll.progress * 4.5, 0.08, dt)
    this.group.rotation.z = damp(this.group.rotation.z, state.scroll.progress * 0.5, 0.08, dt)
  }

  dispose() {
    this.items.forEach(({ mesh }) => mesh.geometry.dispose())
    this.material.dispose()
  }
}
