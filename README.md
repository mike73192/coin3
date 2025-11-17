diff --git a/README.md b/README.md
index 8d1f25298da61b266a1c9dc934281cc3bb098d59..a4cd3a40832daf6825c04d1fc3f9401fb70092c9 100644
--- a/README.md
+++ b/README.md
@@ -9,50 +9,103 @@ npm install
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

## 環境変数について

- Vite の設定 (`vite.config.ts`) では `loadEnv(..., "VITE_")` を呼んでいますが、現状のアプリでは `import.meta.env` を参照していません。そのため `.env.local` は必須ではなく、消しても動作に影響はありません。
- オンライン共有に必要な URL やトークンはすべて `config file.tet` の `[remoteStorage]` セクションで管理します。ブラウザに読み込ませたい値はそちらを書き換えてください。
- Supabase Edge Function 用の秘密情報 (`supabase/.env.coin3` など) は引き続き Supabase CLI で参照されるため、必要に応じてローカルに保持してください。

## 遊び方
 
 - Enter キーでコインを 1 枚落とせます。
 - 「記録」ボタンからタイトルとスライダーを設定すると、評価に応じたコインが追加されます（1 回につき最大 15 枚）。
 - コインが 100 枚に達すると瓶が満杯になり、成果が棚に保存されます。棚は 2 行 × 3 列でページ切り替えが可能です。
 - 成果はローカルストレージに保存され、次回アクセス時も表示されます。
 
+## オンライン共有（BaaS を使う場合）
+
+友達と成果を共有したい場合は、`config file.tet` の `[remoteStorage]` セクションでオンライン同期を有効化します。ここでは Firebase や Supabase などの BaaS（Backend as a Service）を利用する手順を初心者向けにまとめました。
+
+### 事前に理解しておくポイント
+
+- `enabled` を `true` にすると、ゲームは指定した REST API に対してデータの保存／取得を行います。
+- `baseUrl` は BaaS が用意する REST API のエンドポイント（例: `https://xxxx.supabase.co/rest/v1/coin3`）を指定します。末尾に `/` は不要です。
+- `roomCode` は共有したいグループの識別子です。同じコードを設定したプレイヤー同士でデータを共有できます。
+- `authToken` はサービスから発行される API キーや Bearer トークンを入力します。認証不要なサービスなら空欄で構いません。
+
+### Supabase を例にした設定手順
+
+1. **プロジェクトの作成**
+   1. [Supabase](https://supabase.com/) にサインアップし、新しいプロジェクトを作成します。無料プランで十分です。
+   2. プロジェクトを作成すると `Project URL`（例: `https://xxxx.supabase.co`）と `anon public` API キーが表示されます。これらを控えておきます。
+
+2. **テーブルの準備**
+   1. Supabase の「Table editor」で `coin3_rooms` のようなテーブルを作成し、以下のカラムを用意します。
+      - `room_code` (text, Primary key)
+      - `payload` (jsonb)
+      - `updated_at` (timestamp、デフォルト値に `now()` を設定)
+   2. RLS（Row Level Security）をオンにし、匿名ユーザーが自分の `room_code` に対して `select` と `upsert`（`insert` + `update`）できるようにポリシーを追加します。公式ドキュメントのサンプルポリシーをそのまま利用できます。
+
+3. **REST エンドポイントの確認**
+   - Supabase ではテーブル名がそのまま REST エンドポイントになります。例: `https://xxxx.supabase.co/rest/v1/coin3_rooms`
+   - `room_code` をクエリパラメーターで指定することで、対象レコードを取得できます。例: `...?room_code=eq.1122`
+
+4. **config file.tet の設定**
+
+   ```ini
+   [remoteStorage]
+   enabled = true
+   baseUrl = https://xxxx.supabase.co/rest/v1/coin3_rooms
+   roomCode = 1122          # 友達と共有したいコード
+   authToken = sbp_xxxxxxx  # Supabase の anon public キーをそのまま記入
+   pollIntervalMs = 15000   # 必要に応じてポーリング間隔を変更
+   ```
+
+   Supabase の REST API は `apikey` と `Authorization: Bearer` の両方に同じトークンを送る必要があります。本ゲームでは自動的に `Authorization` ヘッダーに設定されるため、同じ値を `authToken` に書くだけで利用できます。
+
+5. **CORS の許可**
+   - Supabase ダッシュボードの「Authentication > Policies > Redirect URLs」で、ゲームをホストするオリジン（例: `http://localhost:5173` やデプロイ先の URL）を追加します。
+
+6. **テスト**
+   - 双方が同じ設定ファイルを使ってゲームを起動し、片方がコインを追加したら数十秒以内にもう一方にも反映されることを確認します。
+
+### その他の BaaS を使う場合
+
+- Firebase Realtime Database や Appwrite などでも同様に、REST API URL とトークン、部屋コードに相当するキーを設定すれば共有できます。
+- サービス固有の認証方法や CORS 設定が必要になることが多いため、公式ドキュメントも併せて参照してください。
+
+
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
