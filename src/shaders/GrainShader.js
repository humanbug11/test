import * as THREE from 'three'

/**
 * 仕上げのパス：色収差（RGBずれ）＋フィルムグレイン＋ビネット。
 * スクロール速度で収差量を変えることで「動きの摩擦」を演出する。
 */
export const GrainShader = {
  name: 'GrainShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uAberration: { value: 0.0008 },
    uGrain: { value: 0.032 },
    uVignette: { value: 0.72 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAberration;
    uniform float uGrain;
    uniform float uVignette;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p.yx + 19.19);
      return fract((p.x + p.y) * p.x);
    }

    void main() {
      vec2 uv = vUv;
      vec2 dir = uv - 0.5;
      float dist = length(dir);

      // 画面端ほど強くRGBをずらす
      float amount = uAberration * (0.35 + dist * 2.0);
      vec3 color;
      color.r = texture2D(tDiffuse, uv - dir * amount).r;
      color.g = texture2D(tDiffuse, uv).g;
      color.b = texture2D(tDiffuse, uv + dir * amount).b;

      // グレイン
      float n = hash(uv * uResolution + fract(uTime) * 917.0);
      color += (n - 0.5) * uGrain;

      // ビネット
      float vig = smoothstep(0.95, uVignette * 0.35, dist);
      color *= mix(0.62, 1.0, vig);

      gl_FragColor = vec4(color, 1.0);
    }
  `
}
