# コイン瓶ミニゲーム

Phaser 3 と TypeScript で作成した、コインを瓶に落として成果を保存するミニゲームです。

## セットアップ

```bash
npm install
```

## 開発サーバー

```bash
npm run dev
```

ブラウザで `http://localhost:5173` を開くとアプリが表示されます。

## ビルド

```bash
npm run build
```

`dist/` 配下に静的ファイルが生成されます。

## 遊び方

- Enter キーでコインを 1 枚落とせます。
- 「記録」ボタンからタイトルとスライダーを設定すると、評価に応じたコインが追加されます（1 回につき最大 15 枚）。
- コインが 100 枚に達すると瓶が満杯になり、成果が棚に保存されます。棚は 2 行 × 3 列でページ切り替えが可能です。
- 成果はローカルストレージに保存され、次回アクセス時も表示されます。

## ファイル構成と役割

| 主要ファイル | 役割 | 主な依存先 / イベント |
| --- | --- | --- |
| `index.html` | ゲームキャンバスとサイドパネル UI の静的な DOM を定義。`#game-container` が Phaser の描画先、`aside.panel` 以下が Home/Settings UI のマウント先です。 | `src/styles/main.css`, `src/main.ts` |
| `src/main.ts` | アプリのエントリーポイント。Phaser.Game の生成、Home UI の初期化、画面リサイズ対応、UI からのコイン追加要求の直列キュー管理を行います。 | `MainScene`, `HomeUI`, `gameState`, `debugLogger`, `appConfig` |
| `config file.tet` | 描画や物理、UI、ログのデフォルト値を定義する INI 形式の外部設定です。 | `AppConfig` |

### Phaser シーンと描画

- `src/scenes/MainScene.ts`
  - ゲームプレイのメインシーン。Matter.js ワールドと瓶の物理コリジョンを構築し、`CoinFactory` を介してコインを生成します。
  - `gameState` の `jarFilled` イベントを購読して、瓶が満杯になったときにコインをクリアしボトルのハイライト演出を行います。
  - ウィンドウリサイズに応じて瓶の当たり判定を再生成し、`enqueueCoins` 経由で渡されたコイン投入要求をバッチ処理します。

### サービスレイヤー

- `src/services/AppConfig.ts`
  - `config file.tet` を読み込み、数値や真偽値をバリデーションした `appConfig` オブジェクトを提供します。描画設定やコイン挙動、ログ設定など全体のデフォルト値を定義しています。
- `src/services/GameStateManager.ts`
  - 現在のコイン枚数・瓶容量・棚（アーカイブ）を管理し、`coinsChanged` / `jarFilled` などのイベントを発火します。ローカルストレージへの保存・復元、瓶容量変更時の正規化も担います。
- `src/services/CoinFactory.ts`
  - `MainScene` から呼ばれ、Matter.js のコイン画像ボディを生成・初期化します。ユーザー設定に基づいて摩擦係数や投入間隔を適用し、生成済みコインの破棄も管理します。
- `src/services/UserSettings.ts`
  - ユーザーが UI から変更した瓶容量やコイン物理パラメータを保持します。ローカルストレージに永続化し、変更イベントを他コンポーネントへ通知します。
- `src/services/DebugLogger.ts`
  - 開発用ログ出力とローカルストレージへの蓄積、テキストファイルとしてのダウンロードを提供します。`appConfig.logging` を参照して保存件数やコンソール出力可否を制御します。
- `src/services/SyncService.ts`
  - 将来の外部同期を見据えたスタブ。現在は `push` メソッドが即時解決するプレースホルダーです。

### UI コンポーネント

- `src/ui/HomeUI.ts`
  - サイドパネル全体を制御するクラス。ボタン・棚ページング・キーボードショートカットのイベントを束ね、`gameState` の更新を画面表示へ反映します。`RecordDialog` と `SettingsUI` を内部で初期化します。
  - 記録確定時は `GameStateManager` にタイトルを伝えた上で、`onRecord` / `onKeyboardCoin` コールバックを通じて `main.ts` の投入キューへ橋渡しします。
- `src/ui/RecordDialog.ts`
  - 記録ダイアログの開閉とフォーム入力、スライダーからコイン枚数を計算するロジックを担います。`gameState` を参照して投入可能枚数をプレビューに反映します。
- `src/ui/SettingsUI.ts`
  - 設定フォームの入力同期を行い、フォーム変更時に `userSettings` を更新します。数値入力のバリデーションとラベル表示の更新もここで行います。

### モデルとスタイル

- `src/models/archive.ts`
  - 棚に保存される成果エントリの型定義と 1 ページあたりの表示件数を提供します。`GameStateManager` と `HomeUI` が参照します。
- `src/styles/main.css`
  - 全体レイアウト、サイドパネル、棚、ダイアログなど UI のスタイルを定義します。Phaser キャンバスと瓶のオーバーレイキャンバス (`#bottle-canvas`) の重なり順もここで設定しています。

### アセット

- `art/` ディレクトリ
  - `MainScene` が読み込む瓶画像など、Phaser シーンの描画に利用する静的アセットを格納します。
