# NOCTURNE — Interactive WebGL Site

[lusion.co](https://lusion.co/) のようなクリエイティブスタジオ系サイトを、**Three.js + Vite（バニラJS）** で実装したものです。
外部の3Dモデル・HDRI・画像アセットを一切使わず、すべてプロシージャルに生成しています。

## 実装している表現

| 要素 | 実装 |
| --- | --- |
| 屈折するガラスオブジェクト | `MeshPhysicalMaterial`（transmission / iridescence / clearcoat）＋ `RoomEnvironment` から生成した環境マップ |
| 無重力の物理 | [Rapier](https://rapier.rs/)（WASM）。重力0の空間で、物体は画面内を漂い、**ブラウザ画面の四辺で跳ね返る**。球どうしの衝突・摩擦による回転の連鎖あり。**ドラッグで掴んで投げられる**。何もない所を押しながら動かすと掃く動作、短いクリックで放射状の衝撃（`src/world/GlassCluster.js`） |
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

## 物理（無重力）の仕様

- 重力は `GRAVITY = 0`。画面の四辺が壁（反発係数0.9）。ウィンドウをリサイズすると壁も追従します。
- 物理は z を固定した画面と同じ平面で解き、描画だけ3Dで回転させます。そのため壁の位置が画面の端と一致します。
- 当たり判定は各メッシュに近い**球**です。トーラスやカプセルは球近似なので、見た目に多少の余白・食い込みが出ます。
- 無重力で止まってしまわないよう、遅くなった物体を軽く押します（`DRIFT_MIN`）。逆にカーソルやクリックで加速しすぎないよう速度に上限があります（`SPEED_MAX`）。
- Rapier は動的importで別チャンクに分離しています。読み込みに失敗した場合は、静的配置にフォールバックします。
- **ドラッグして投げる**: ガラス球の上でボタンを押すと掴め、動かすとカーソルに追従します。掴んでいる間も他の球や壁とは普通に衝突します。離す直前の0.1秒間のカーソル速度が、そのまま投げる速さ（上限 `SPEED_MAX`）になります。止めたまま離すと、その場に落ち着きます。
- 球の上では、カスタムカーソルが「Drag」（掴んでいる間は「Drop」）に変わります。
- リンク・ボタン・Work一覧の上では掴みません。タッチ操作はスクロールと競合するため、ドラッグ対象外です（空き地のタップによる衝撃は有効）。
- 何もない所を押しながら動かすと、カーソルが球を掃きます。ホバーだけで球が逃げると掴めないため、この動作はボタンを押している間だけにしています。
- `prefers-reduced-motion` では漂う速度を大きく落とし、クリックの衝撃を無効にします。

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
