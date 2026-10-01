import * as THREE from 'three'
import { state } from '../core/state.js'
import { damp, clamp, randomRange } from '../utils/math.js'

const SHAPES = [
  () => new THREE.TorusKnotGeometry(0.62, 0.2, 180, 32),
  () => new THREE.IcosahedronGeometry(0.85, 1),
  () => new THREE.SphereGeometry(0.72, 64, 64),
  () => new THREE.TorusGeometry(0.6, 0.24, 64, 128),
  () => new THREE.CapsuleGeometry(0.35, 0.7, 16, 32),
  () => new THREE.IcosahedronGeometry(0.78, 2),
  () => new THREE.TorusKnotGeometry(0.5, 0.16, 160, 32, 3, 4)
]

const GRAVITY = 0       // 無重力空間
const STEP = 1 / 60
const WALL = 2          // 壁の半厚み（貫通防止のため厚めに取る）
const DRIFT_MIN = 0.6   // これより遅くなったら、漂い続けるよう軽く押す
const SPEED_MAX = 12    // カーソルやクリックで加速しすぎないための上限
const POINTER_R = 0.42  // カーソルの当たり半径（ワールド単位）

/**
 * ヒーローの屈折オブジェクト群。Rapier（WASM）の剛体物理で動かす無重力空間。
 *
 * - 重力は0。物体は画面内を漂い、ブラウザ画面の四辺（壁）で跳ね返る。
 * - 物理は z を固定した平面（画面と同じ面）で解き、描画だけ3Dで回転させる。
 *   これにより壁の位置が画面の端と厳密に一致する。
 * - 当たり判定は各メッシュの外接球に近い球。球どうしの衝突、摩擦による回転が連鎖する。
 * - 減衰をほぼ0にして運動を保ち、遅くなりすぎたら軽く押して漂い続けさせる。
 * - カーソルは運動学ボディとして物体を突き飛ばし、クリックは放射状の衝撃を与える。
 * - Rapierは動的importで別チャンクにし、初回描画をブロックしない。
 */
export class GlassCluster {
  constructor(stage) {
    this.stage = stage
    this.group = new THREE.Group()
    this.items = []

    this.RAPIER = null
    this.world = null
    this.walls = []
    this.pointerBody = null
    this.pointerActive = false
    this.released = false
    this.acc = 0
    this.frame = 0
    this._ptr = new THREE.Vector3(999, 999, 0)
    this._ptrTarget = new THREE.Vector3()

    const tier = state.quality.tier
    this.count = tier === 'low' ? 5 : tier === 'medium' ? 7 : 9

    this.material = this._createMaterial()

    for (let i = 0; i < this.count; i++) {
      const geometry = SHAPES[i % SHAPES.length]()
      geometry.computeBoundingSphere()
      const mesh = new THREE.Mesh(geometry, this.material)
      const baseScale = randomRange(0.45, 0.78)
      mesh.scale.setScalar(baseScale)
      mesh.position.set(0, 40, 0) // 解放されるまでは画面の遥か上
      this.items.push({
        mesh,
        baseScale,
        boundR: geometry.boundingSphere.radius,
        body: null,
        collider: null
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

  /** 画面幅に応じた物体のスケール（狭い画面ほど小さく） */
  _sizeFactor() {
    return clamp(state.sizes.width / 1280, 0.62, 1)
  }

  _radius(item) {
    // 外接球にほぼ合わせ、見た目の食い込みを抑える（トーラス等は球近似のため多少の余白が出る）
    return item.boundR * item.baseScale * this._sizeFactor() * 0.97
  }

  async initPhysics() {
    try {
      const mod = await import('@dimforge/rapier3d-compat')
      this.RAPIER = mod.default || mod
      await this.RAPIER.init()
    } catch (err) {
      console.warn('[physics] Rapier の読み込みに失敗。静的配置にフォールバックします', err)
      this._fallbackLayout()
      return
    }

    const R = this.RAPIER
    this.world = new R.World({ x: 0, y: GRAVITY, z: 0 })
    this.world.timestep = STEP

    this._buildWalls()

    const { width: W, height: H } = this.stage.viewport
    const k = this._sizeFactor()
    const reduced = state.quality.reducedMotion
    const n = this.items.length

    // 画面を格子に分け、ゆらぎを足して配置（初期の重なりを避ける）
    const cols = Math.max(1, Math.ceil(Math.sqrt((n * W) / H)))
    const rows = Math.ceil(n / cols)
    const cw = W / cols
    const ch = H / rows

    this.items.forEach((item, i) => {
      const r = this._radius(item)
      item.mesh.scale.setScalar(item.baseScale * k)

      const x = clamp(
        -W / 2 + ((i % cols) + 0.5) * cw + randomRange(-0.2, 0.2) * cw,
        -W / 2 + r,
        W / 2 - r
      )
      const y = clamp(
        H / 2 - (Math.floor(i / cols) + 0.5) * ch + randomRange(-0.2, 0.2) * ch,
        -H / 2 + r,
        H / 2 - r
      )

      const angle = Math.random() * Math.PI * 2
      const speed = randomRange(0.5, 1.2) * (reduced ? 0.25 : 1)

      const body = this.world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(x, y, 0)
          .enabledTranslations(true, true, false)
          .setLinvel(Math.cos(angle) * speed, Math.sin(angle) * speed, 0)
          .setLinearDamping(0.02)
          .setAngularDamping(0.15)
          .setCanSleep(false) // 無重力では低速でも眠らせない
          .setCcdEnabled(true)
          .setAngvel({ x: randomRange(-1, 1), y: randomRange(-1, 1), z: randomRange(-1, 1) })
      )
      const collider = this.world.createCollider(
        R.ColliderDesc.ball(r).setRestitution(0.9).setFriction(0.5).setDensity(1),
        body
      )
      item.body = body
      item.collider = collider
    })

    // カーソル用の運動学ボディ（動かすと接触した物体を押しのける）
    this.pointerBody = this.world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(999, 999, 0)
    )
    this.world.createCollider(R.ColliderDesc.ball(POINTER_R).setRestitution(0.2), this.pointerBody)

    this._onPointerDown = (e) => this._burst(e.clientX, e.clientY)
    window.addEventListener('pointerdown', this._onPointerDown)

    this._syncMeshes()
  }

  /** 画面の四辺に壁を作る（リサイズで作り直す） */
  _buildWalls() {
    if (!this.world) return
    const R = this.RAPIER
    this.walls.forEach((c) => this.world.removeCollider(c, true))
    this.walls = []

    const { width: W, height: H } = this.stage.viewport
    const make = (hx, hy, x, y) =>
      this.world.createCollider(
        R.ColliderDesc.cuboid(hx, hy, WALL).setTranslation(x, y, 0).setRestitution(0.9).setFriction(0.5)
      )

    this.walls.push(
      make(W, WALL, 0, -H / 2 - WALL),               // 下
      make(W, WALL, 0, H / 2 + WALL),                // 上
      make(WALL, H * 4, -W / 2 - WALL, 0),           // 左
      make(WALL, H * 4, W / 2 + WALL, 0)             // 右
    )
  }

  /** 物理が使えない場合：床に並べるだけ */
  _fallbackLayout() {
    const { width: W, height: H } = this.stage.viewport
    this.items.forEach((item, i) => {
      item.mesh.position.set(-W / 2 + ((i + 0.5) / this.items.length) * W, Math.sin(i * 1.7) * H * 0.25, 0)
      item.mesh.scale.setScalar(item.baseScale * this._sizeFactor())
    })
  }

  /** ページ表示（プリローダ終了）と同時に動き出す */
  release() {
    this.released = true
  }

  /** クリック位置から放射状の衝撃を与える */
  _burst(px, py) {
    if (!this.world || !this.released || state.quality.reducedMotion) return
    const p = this.stage.pxToWorld(px, py)
    const range = 3.4
    for (const item of this.items) {
      const t = item.body.translation()
      const dx = t.x - p.x
      const dy = t.y - p.y
      const d = Math.hypot(dx, dy)
      if (d > range) continue
      const nx = d > 1e-4 ? dx / d : 0
      const ny = d > 1e-4 ? dy / d : 1
      const f = (1 - d / range) * item.body.mass() * 5
      item.body.applyImpulse({ x: nx * f, y: ny * f, z: 0 }, true)
      item.body.applyTorqueImpulse({ x: 0, y: 0, z: -nx * f * 0.15 }, true)
    }
  }

  resize() {
    if (!this.world) return
    this._buildWalls()
    const { width: W, height: H } = this.stage.viewport
    const k = this._sizeFactor()
    for (const item of this.items) {
      const r = this._radius(item)
      item.collider.setRadius(r)
      item.mesh.scale.setScalar(item.baseScale * k)

      // ウィンドウが縮んだ時、画面外に取り残された物体を内側へ戻す
      const t = item.body.translation()
      const x = clamp(t.x, -W / 2 + r, W / 2 - r)
      const y = clamp(t.y, -H / 2 + r, H / 2 - r)
      if (x !== t.x || y !== t.y) item.body.setTranslation({ x, y, z: 0 }, true)
    }
  }

  _clampSpeed() {
    for (const { body } of this.items) {
      const v = body.linvel()
      const sp = Math.hypot(v.x, v.y)
      if (sp > SPEED_MAX) {
        const k = SPEED_MAX / sp
        body.setLinvel({ x: v.x * k, y: v.y * k, z: 0 }, true)
      }
    }
  }

  /** 無重力で止まってしまわないよう、遅くなった物体を軽く押す */
  _keepDrifting() {
    if (state.quality.reducedMotion) return
    for (const { body } of this.items) {
      const v = body.linvel()
      const sp = Math.hypot(v.x, v.y)
      if (sp >= DRIFT_MIN) continue
      const a = sp > 0.02 ? Math.atan2(v.y, v.x) : Math.random() * Math.PI * 2
      const f = body.mass() * 0.25
      body.applyImpulse({ x: Math.cos(a) * f, y: Math.sin(a) * f, z: 0 }, true)
    }
  }

  _syncMeshes() {
    for (const { mesh, body } of this.items) {
      const t = body.translation()
      const q = body.rotation()
      mesh.position.set(t.x, t.y, t.z)
      mesh.quaternion.set(q.x, q.y, q.z, q.w)
    }
  }

  _updatePointer(dt) {
    const active = state.pointer.hasFinePointer || state.pointer.down
    if (!active || state.quality.reducedMotion) {
      if (this.pointerActive) {
        this.pointerBody.setTranslation({ x: 999, y: 999, z: 0 }, true)
        this.pointerActive = false
      }
      return
    }
    this.stage.pxToWorld(state.pointer.x, state.pointer.y, this._ptrTarget)
    if (!this.pointerActive) {
      // 現れた瞬間に物体を弾き飛ばさないよう、位置を直接置く
      this._ptr.copy(this._ptrTarget)
      this.pointerBody.setTranslation({ x: this._ptr.x, y: this._ptr.y, z: 0 }, true)
      this.pointerActive = true
      return
    }
    this._ptr.x = damp(this._ptr.x, this._ptrTarget.x, 0.4, dt)
    this._ptr.y = damp(this._ptr.y, this._ptrTarget.y, 0.4, dt)
    this.pointerBody.setNextKinematicTranslation({ x: this._ptr.x, y: this._ptr.y, z: 0 })
  }

  update(dt) {
    // 物理ワールドは画面（カメラ）に固定する。視差やスクロールによるカメラ移動に追従させ、
    // 「床・壁 = 画面の端」を保つ
    const cam = this.stage.camera.position
    this.group.position.set(cam.x, cam.y, 0)

    if (!this.world || !this.released) return

    this._updatePointer(dt)

    // 固定タイムステップで安定させる（重いフレームでも最大4回まで）
    this.acc += dt
    let steps = 0
    while (this.acc >= STEP && steps < 4) {
      this.world.step()
      this.acc -= STEP
      steps++
    }
    if (steps === 4) this.acc = 0

    this._clampSpeed()
    this._syncMeshes()
    if (++this.frame % 15 === 0) this._keepDrifting()
  }

  dispose() {
    window.removeEventListener('pointerdown', this._onPointerDown)
    this.items.forEach(({ mesh }) => mesh.geometry.dispose())
    this.material.dispose()
    this.world?.free()
  }
}
