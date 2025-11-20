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
+#### Edge Function のコードについて
+
+`supabase/edge-function.ts` に、上記 REST エンドポイントをラップするための Edge Function 実装を同梱しています。以下の点だけ確認しておけば、GitHub Pages などの公開オリジンからも安全に呼び出せます。
+
+1. **サービスロールキーの使用** — Edge Function では `SUPABASE_SERVICE_ROLE_KEY` を使って `createClient` し、`coin3_rooms` テーブルへの読み書きを行います。キーは Supabase 側の Secrets に保存され、クライアントには一切漏れません。
+2. **共有トークンの検証** — `COIN3_FUNCTION_TOKEN` を設定すると、`Authorization: Bearer ...` が一致したリクエストのみを許可します。`config file.tet` の `[remoteStorage].authToken` と同じ値にしておくと、ブラウザからの `GET/PUT` だけが通ります。
+3. **CORS / preflight 対応** — `supabase/edge-function.ts` の先頭で `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers` をまとめた `corsHeaders` を定義し、`OPTIONS` メソッドには `204` を返した上で `jsonResponse` でも常に同じヘッダーを付与しています。Supabase 側の Redirect URL や Allowed Headers を整備した状態でデプロイすれば、冒頭の CORS エラーは解消されます。
+4. **サニタイズ済みルーティング** — Edge Function 側では `/functions/v1/coin3` のプレフィックスを自動で取り除き、`/rooms/:roomCode/:resource`（resource は `state` / `archives` / `settings` のみ）にマッチした場合だけハンドラーへ流します。
+
+コードをカスタマイズしたい場合は `supabase/edge-function.ts` を編集し、`supabase functions deploy coin3 --no-verify-jwt` などで再デプロイしてください。
+
### GitHub Pages で通信状況を確認する手順

1. GitHub Pages にデプロイしたページを開き、ブラウザのデベロッパーツールを表示します（Chrome なら `F12` →「Network」タブ）。
2. 画面上でコインを追加したり記録を保存したりして、通信が発生するタイミングを作ります。
3. Network タブで `rooms` や `state` を検索ボックスに入力すると、`/rooms/<roomCode>/state` などの `GET` / `PUT` リクエストだけに絞り込めます。
4. 正常に通信できているリクエストは `Status` 列が `200`（GET）や `204`（PUT）になり、`Response` 欄に JSON データが表示されます。
5. `404 Not Found` が出ている場合は `baseUrl` や `roomCode` が誤っている可能性が高く、`401 Unauthorized` の場合は `authToken`（Supabase の anon key や `COIN3_FUNCTION_TOKEN` など）が一致していないことが原因です。`CORS error` が出るときは Supabase の Redirect/CORS 許可リストに GitHub Pages の URL を追加してください。
6. これらのエラーが無く数十秒ごとに `GET` / `PUT` が成功していれば、GitHub Pages 版から BaaS へ接続できています。

#### 「Response to preflight request doesn't pass access control check」エラーの対処

GitHub Pages などの公開オリジンから Supabase Edge Function を呼び出すとき、`Authorization` ヘッダーを付与した `GET/PUT` リクエストはブラウザによって事前確認（preflight）されます。preflight は `OPTIONS https://<project>.supabase.co/functions/v1/coin3/...` という形のリクエストで、ここが `200`/`204` 以外を返すと Chrome のコンソールに次のようなエラーが出続けます。

```
Access to fetch at 'https://<project>.supabase.co/functions/v1/coin3/rooms/<roomCode>/state' from origin 'https://<username>.github.io' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: It does not have HTTP ok status.
```

この場合は「Edge Function まで preflight が届かず、インフラ側で遮断されている」ことがほとんどです。以下を順に確認してください。

1. **Authentication > Policies > Redirect URLs** に `https://<username>.github.io` やカスタムドメインを追加し、`Save` 後に数分待つ。
2. Supabase プロジェクト設定の **API > Allowed Headers** に `authorization` が含まれているか確認し、無い場合は追加して保存する。
3. `supabase functions deploy coin3 --no-verify-jwt ...` を実行した際、ダッシュボードの **Edge Functions > Settings** で `No JWT verification` になっているか確認する。誤って JWT 検証を有効にすると preflight が 401 を返します。

いずれかを修正すると Network タブの `OPTIONS /rooms/...` が `204` で返るようになり、その後の `GET` / `PUT` も `200` / `204` で完了するようになります。

preflight が依然として `404` や `CORS error` で失敗する場合は、以下の切り分けを行ってください。

1. **Edge Function の動作確認** — ターミナルから次のように `OPTIONS` を叩き、`204` と `Access-Control-Allow-*` が返るか確認します。

   ```bash
   curl -i -X OPTIONS \
     -H "Origin: https://<username>.github.io" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: Authorization, Content-Type" \
     "https://<project>.supabase.co/functions/v1/coin3/rooms/<roomCode>/state"
   ```

   ここで `404` が返る場合は **Edge Function 未デプロイ/URL タイプミス**（`functions deploy coin3 --no-verify-jwt` の再実行や `baseUrl` のスペル確認）を疑います。`401` の場合は `COIN3_FUNCTION_TOKEN` と `Authorization: Bearer` の値が一致していない可能性が高いです。

2. **Dashboard での CORS 許可リスト確認** — Redirect URL と Allowed Headers が保存されているかを再確認し、数分経過して反映されたのちに再度 `curl` とブラウザの preflight を試します。

3. **`config file.tet` の `baseUrl` 再確認** — `https://<project>.supabase.co/functions/v1/coin3` に誤って末尾スラッシュや別のホスト名を付与していないか確認します。ここが一致していないと preflight も本体リクエストも 404 になります。

### その他の BaaS を使う場合

- Firebase Realtime Database や Appwrite などでも同様に、REST API URL とトークン、部屋コードに相当するキーを設定すれば共有できます。
- サービス固有の認証方法や CORS 設定が必要になることが多いため、公式ドキュメントも併せて参照してください。


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
