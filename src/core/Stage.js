import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

import { state, isTouch, prefersReducedMotion } from './state.js'
import { damp, clamp } from '../utils/math.js'
import { GrainShader } from '../shaders/GrainShader.js'

import { Backdrop } from '../world/Backdrop.js'
import { GlassCluster } from '../world/GlassCluster.js'
import { Particles } from '../world/Particles.js'
import { HoverPreview } from '../world/HoverPreview.js'

/**
 * レンダラ・カメラ・ポストプロセス・ワールドを束ねる中枢。
 * 各ワールドモジュールは { update(dt), resize(), dispose() } を実装する。
 */
export class Stage {
  constructor(canvas) {
    this.canvas = canvas
    this.clock = new THREE.Clock()
    this.modules = []
    this.running = false
    this._raf = null
    /** 毎フレーム、ワールド更新の直前に呼ばれるフック（UI側の更新用） */
    this.onUpdate = null
  }

  async init() {
    this._detectQuality()
    this._createRenderer()
    this._createScene()
    this._createEnvironment()
    this._createWorld()
    this._createComposer()
    this.resize()
    this._bindEvents()
    // 初回フレームのシェーダコンパイルを先に済ませ、開幕のカクつきを防ぐ
    await this.renderer.compileAsync(this.scene, this.camera)
    return this
  }

  _detectQuality() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const mem = navigator.deviceMemory || 4
    const touch = isTouch()
    state.pointer.hasFinePointer = !touch
    state.quality.reducedMotion = prefersReducedMotion()

    if (touch || mem <= 3 || window.innerWidth < 720) state.quality.tier = 'low'
    else if (mem <= 6) state.quality.tier = 'medium'
    else state.quality.tier = 'high'

    state.sizes.dpr = state.quality.tier === 'low' ? Math.min(dpr, 1.5) : dpr
  }

  _createRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: state.quality.tier === 'high',
      alpha: false,
      powerPreference: 'high-performance'
    })
    this.renderer.setClearColor(0x05060a, 1)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
  }

  _createScene() {
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(0x05060a, 9, 20)

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60)
    this.camera.position.set(0, 0, 6.5)
    this.scene.add(this.camera)

    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(3, 4, 5)
    const accent = new THREE.PointLight(0xff4d29, 24, 18, 2)
    accent.position.set(-3.2, -1.4, 2.4)
    const rim = new THREE.PointLight(0x5f6bff, 18, 18, 2)
    rim.position.set(3.4, 2.2, -1.5)
    this.scene.add(key, accent, rim)
    this.lights = { key, accent, rim }
  }

  _createEnvironment() {
    // 屈折マテリアルに映り込ませる環境マップ（外部HDRI不要）
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const env = new RoomEnvironment()
    this.envMap = pmrem.fromScene(env, 0.04).texture
    this.scene.environment = this.envMap
    this.scene.environmentIntensity = 0.65
    env.dispose?.()
    pmrem.dispose()
  }

  _createWorld() {
    this.backdrop = new Backdrop(this)
    this.glass = new GlassCluster(this)
    this.particles = new Particles(this)
    this.preview = new HoverPreview(this)
    this.modules = [this.backdrop, this.glass, this.particles, this.preview]
    this.modules.forEach((m) => this.scene.add(m.group))
  }

  _createComposer() {
    const { width, height, dpr } = state.sizes
    this.composer = new EffectComposer(this.renderer)
    this.composer.setPixelRatio(dpr)
    this.composer.setSize(width, height)
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    if (state.quality.tier !== 'low') {
      this.bloom = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        state.quality.tier === 'high' ? 0.62 : 0.42,
        0.7,
        0.82
      )
      this.composer.addPass(this.bloom)
    }

    this.grain = new ShaderPass(GrainShader)
    this.composer.addPass(this.grain)
    this.composer.addPass(new OutputPass())
  }

  /** z=0平面での可視領域（ワールド単位）。DOM座標との変換に使う */
  _computeViewport() {
    const dist = this.camera.position.z
    const vFov = (this.camera.fov * Math.PI) / 180
    const height = 2 * Math.tan(vFov / 2) * dist
    this.viewport = { height, width: height * this.camera.aspect }
  }

  /** 画面ピクセル座標 → z=0平面のワールド座標 */
  pxToWorld(px, py, target = new THREE.Vector3()) {
    const { width, height } = state.sizes
    return target.set(
      (px / width - 0.5) * this.viewport.width,
      -(py / height - 0.5) * this.viewport.height,
      0
    )
  }

  resize() {
    const width = window.innerWidth
    const height = window.innerHeight
    state.sizes.width = width
    state.sizes.height = height
    state.sizes.aspect = width / height

    // 縦長画面ではカメラを引いて、オブジェクトが画面を埋め尽くさないようにする
    this.camera.position.z = state.sizes.aspect < 0.85 ? 8.4 : 6.5
    this.camera.aspect = state.sizes.aspect
    this.camera.updateProjectionMatrix()
    this._computeViewport()

    this.renderer.setPixelRatio(state.sizes.dpr)
    this.renderer.setSize(width, height, false)
    this.composer?.setPixelRatio(state.sizes.dpr)
    this.composer?.setSize(width, height)
    this.bloom?.setSize(width, height)
    this.grain.uniforms.uResolution.value.set(width, height)

    this.modules.forEach((m) => m.resize?.())
  }

  _bindEvents() {
    this._onResize = () => this.resize()
    window.addEventListener('resize', this._onResize)
    window.addEventListener('orientationchange', this._onResize)

    this._onVisibility = () => (document.hidden ? this.stop() : this.start())
    document.addEventListener('visibilitychange', this._onVisibility)
  }

  start() {
    if (this.running) return
    this.running = true
    this.clock.getDelta() // 停止中に溜まった時間を捨てる
    const tick = () => {
      this._raf = requestAnimationFrame(tick)
      this.update()
    }
    this._raf = requestAnimationFrame(tick)
  }

  stop() {
    this.running = false
    if (this._raf) cancelAnimationFrame(this._raf)
    this._raf = null
  }

  update() {
    const delta = Math.min(this.clock.getDelta(), 1 / 30)
    state.time.delta = delta
    state.time.elapsed += delta

    // スクロールやカーソル等、DOM側のステートを先に確定させる
    this.onUpdate?.(delta)

    // ポインタのスムージング
    state.pointer.nx = damp(state.pointer.nx, state.pointer.rawNx, 0.12, delta)
    state.pointer.ny = damp(state.pointer.ny, state.pointer.rawNy, 0.12, delta)

    // カメラのパララックス＋スクロール追従
    const parallax = state.quality.reducedMotion ? 0 : 1
    this.camera.position.x = damp(this.camera.position.x, state.pointer.nx * 0.45 * parallax, 0.06, delta)
    this.camera.position.y = damp(
      this.camera.position.y,
      state.pointer.ny * 0.32 * parallax - state.scroll.progress * 0.5,
      0.06,
      delta
    )
    this.camera.lookAt(0, -state.scroll.progress * 0.35, 0)

    this.lights.accent.position.x = Math.sin(state.time.elapsed * 0.4) * 3.6
    this.lights.rim.position.y = Math.cos(state.time.elapsed * 0.32) * 2.6

    this.modules.forEach((m) => m.update(delta))

    // 粒状ノイズとRGBずれはスクロール速度に反応させる
    const v = clamp(Math.abs(state.scroll.velocity) / 60, 0, 1)
    const g = this.grain.uniforms
    g.uTime.value = state.time.elapsed
    g.uAberration.value = damp(g.uAberration.value, 0.0012 + v * 0.01, 0.15, delta)
    g.uGrain.value = state.quality.tier === 'low' ? 0.018 : 0.032

    this.composer.render(delta)
  }

  dispose() {
    this.stop()
    window.removeEventListener('resize', this._onResize)
    window.removeEventListener('orientationchange', this._onResize)
    document.removeEventListener('visibilitychange', this._onVisibility)
    this.modules.forEach((m) => m.dispose?.())
    this.envMap?.dispose()
    this.composer?.dispose()
    this.renderer.dispose()
  }
}
