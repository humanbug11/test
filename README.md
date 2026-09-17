# NOCTURNE — Interactive WebGL Site

[lusion.co](https://lusion.co/) のようなクリエイティブスタジオ系サイトを、**Three.js + Vite（バニラJS）** で実装したものです。
外部の3Dモデル・HDRI・画像アセットを一切使わず、すべてプロシージャルに生成しています。

## 実装している表現

| 要素 | 実装 |
| --- | --- |
| 屈折するガラスオブジェクト | `MeshPhysicalMaterial`（transmission / iridescence / clearcoat）＋ `RoomEnvironment` から生成した環境マップ |
| オブジェクトの挙動 | 物理エンジンなし。基準位置へのバネ力＋カーソルからの斥力を毎フレーム積分（`src/world/GlassCluster.js`） |
| 背景グラデーション | fbm（simplex noise 4オクターブ）を流す全画面シェーダ。ホバー中のプロジェクト色へ補間 |
| GPUパーティクル | 7万点を頂点シェーダでモーフィング（球 → トーラスノット → 波）。スクロール量でブレンド、カーソルで斥力 |
| ホバープレビュー | Work一覧のホバーで、カーソル速度に応じてたわむ面を表示。角丸マスクはSDFで生成 |
| ポストプロセス | UnrealBloom → 色収差＋フィルムグレイン＋ビネット（`src/shaders/GrainShader.js`）。収差量はスクロール速度に連動 |
| 慣性スクロール | ネイティブスクロールを維持したままコンテナをtransformで遅延追従（`src/ui/SmoothScroll.js`） |
| UI | カスタムカーソル、マグネティックリンク、行マスクのテキスト出現、単語単位の点灯、進捗カウンタ付きプリローダ |

## セットアップ

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ に出力
npm run preview  # ビルド結果の確認
```

## 設計メモ

- **ステートの一元化**: スクロール量・カーソル・画面サイズ・品質ティアは `src/core/state.js` に集約。WebGL側とDOM側が互いにイベントを購読し合う構造を避けています。
- **ループはひとつ**: `Stage` の `requestAnimationFrame` に、DOM側の更新（スクロール／カーソル／テキスト）を `stage.onUpdate` で相乗りさせています。フレーム内の更新順が保証され、rAFの多重起動も起きません。
- **フレームレート非依存の補間**: すべての追従は `damp(a, b, t, dt)`（`src/utils/math.js`）で、低fpsでも動きの体感が変わらないようにしています。
- **品質ティア**: `deviceMemory` / タッチ / 画面幅から high / medium / low を判定し、パーティクル数・アンチエイリアス・ブルームの有無・マテリアル（透過 → 金属フォールバック）を切り替えます。
- **アクセシビリティ**: `prefers-reduced-motion` で慣性スクロールとアニメーションを停止。WebGL初期化に失敗した場合もDOMコンテンツは通常表示されます。

## ディレクトリ

```
src/
  core/     Stage（レンダラ・カメラ・ポストプロセス・ループ）, state
  world/    Backdrop / GlassCluster / Particles / HoverPreview
  shaders/  GrainShader, simplex noise
  ui/       SmoothScroll / Cursor / Magnetic / Reveal / Preloader / WorkList
  styles/   main.css
```

## 差し替えポイント

- 配色: `src/styles/main.css` の `:root` と、各モジュールの `uColorA` / `uColorB`
- プロジェクト一覧: `index.html` の `[data-project]`（`data-color` / `data-color-b` が背景とプレビューの色になります）
- 実サイトに使う場合は、`WorkList` のクリックハンドラをページ遷移演出に差し替えてください。
