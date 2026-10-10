# Agent Character (PoC)

AIエージェントの状態イベントを受け、キャラクターの表情・姿勢を表示し、埋め込みターミナルの勇者と会話するローカルアプリです。
トップページは **エージェントの町**（RPG 風のドット表示）で、フックを設定した複数の Claude Code セッションが勇者として町にやってきて、
作業はモンスターとの戦い、休みは宿屋、サブエージェントは仲間として、何を・どう・どれくらいやっているかを見せます（仕様は `docs/OBSERVATION.md`）。
埋め込みターミナルだけの画面は `/terminal.html`、1体を大きく表示する Live2D 版（ターミナル付き）は `/live2d.html` に残しています。
server側のJev（APIキー未設定・失敗時は `MockDecider`）が判断し、Cubism 4のLive2DモデルまたはCanvasの簡易顔で表示します。
Cubism Core・モデルは利用者が配置します。未配置・読込失敗時は簡易顔へフォールバックし、画面隅に理由を表示します。
Core・モデルをこのリポジトリには含めません。

## 使い方

Node.js 22.12以上とnpmが必要です。Claude Code / pi / Codex は使いたいCLIだけ別途インストールし、PATHに追加してください。

```sh
npm install
npm run build
npm start
```

### エージェントの町（トップページ）

1. serverが表示する `http://127.0.0.1:8790/?token=...` のURLをブラウザで開きます。
2. 上部の「しゅつじん」を押し、勇者の種類（既定 Claude Code）と行き先を選んで「しゅつじん！」を押します。行き先は台帳のしまっていない町から選べ、町にいる時はその町が初期選択されます。「ほかの フォルダ」なら存在する絶対パスを入力します。起動後にターミナル窓が開くので、そのまま最初の依頼を打てます。フックは自動設定され、個人の設定ファイルの編集は不要です。
   Claude Code のセッションごとに1人の勇者が現れます（名前は作業ディレクトリ名）。同じプロジェクトの同名の勇者は来た順に `main-2`・`main-2 (2)` のように区別し、旅立っても残った勇者の番号は変わりません。外のターミナルから来る場合だけ、下の「フック連携 → Claude Code」の設定が必要です。
3. まずワールドマップからプロジェクトの町を選びます。ワークツリーは同じリポジトリの町にまとまり、町の印には人数と戦闘中の数が出ます。同じ地方に5つ以上なら1つの印から一覧を開けます。このアプリから起動した勇者の町は台帳に残り、勇者がいなくなると「ねむっている町」に入ります（shell は台帳に載せません）。外から来た勇者だけの町は、全員が旅立つと消えます。
   初めて入る町は5種類のすがたから選び、「町のすがたを かえる」で変更できます。台帳の町のすがたはサーバーに保存します。外から来た勇者だけの町のすがたは、画面を開いている間だけ覚えます。
4. 町では待機・考え中・読む・調べる等の勇者が通りを歩きます。10分以上イベントが来ない勇者は宿屋のベッドで居眠りします。宿屋をクリックで中へ、南の門からフィールドへ、フィールドの立て札から町や別のフィールドへ移れます。ワールドマップに戻るボタンも使えます。
   - そうげん：ファイル編集＝スライム、任せた仕事＝仲間とドラゴン
   - どうくつ：テスト・型検査＝しれんのゴーレム
   - よるのもり：コマンド実行＝おばけ
   フィールドにはその町の戦闘だけを出し、入りきらない勇者は「ほか N人」と表示します。勇者をクリックするとコマンド窓が開き、先頭の「たたかいを みる」で戦闘にフォーカスできます。フォーカス画面はクリックで戻ります。活動による居場所の移動は瞬間移動です。
5. 町・宿屋・フィールドの勇者をクリックすると、「はなす／ようすを みる／ターミナル」のコマンド窓が開きます。町の勇者は立ち止まってこちらを向き、窓の外・Esc・「とじる」で閉じると歩き出します。「ようすを みる」は右の「つよさ」でその勇者を選びます。
   「はなす」はマップを覆う大きな「会話と報告」の窓です。直近30件をスクロールで読み返せます。あなたの依頼は吹き出し、勇者の返事は報告の札になり、編集は宝箱、編集なしの調査・テスト・コマンドは巻物、ツールなしの会話は吹き出しの印で表示します。札には時刻・かかった時間・ファイル名・テスト ○×・しっぱい・ツール数・わかればMPの増減が付きます。長い返事は「▼ つづき」で開き、最新の返事だけ1文字ずつ表示（クリック・Enterで省略）、コードは等幅です。入力欄から「つたえる」（Ctrl+Enterでも可）で返事を送り、作業中なら「たたかいが おわったら つたえる」と預かり中の本文を表示して、次の Stop / SessionStart で送信します。外から来た勇者は読むだけです。「とじる」・Esc・窓の外で閉じ、「ターミナルで みる」から元のターミナルへ戻れます。入力中のキーは町の操作に使われません。
   窓を閉じている間に届いた返事は未読となり、勇者の頭上に揺れる「！」、町とワールドマップの札に 📜N を表示します。札が窓に表示されると既読になり、「！」は消え、次の依頼までは小さな報告の印が残ります。既読は勇者IDと時刻だけをブラウザのlocalStorageに最近200件まで記録し、本文や集計は保存しません。右端の「でんれい」は許可待ち → 呼び出し → 新しい町（すがた未選択）→ 苦戦中 → 未読の報告の順です。クリックでその町・勇者へ移り、報告なら会話窓のその札を開きます。
6. 右の「つよさ」は選んだ勇者の Lv・HP（最近の失敗）・MP（コンテキストの残り）・様子・仲間・クエスト・最近の行動です。勇者は地図か右の選択欄で選べます。「ターミナル」で同じセッションの会話（直近256KBの出力）を開けます。外から来た勇者には説明文が出ます。「しゅつじん」の「ひらいている ターミナル」一覧からは shell 等にも接続でき、終了済みは「おわった」と表示します。
   ターミナル窓は「とじる」・Esc・窓の外のクリックで閉じます。閉じてもセッションは動き続け、町に戻れます（この窓の Esc は CLI には送りません）。町の画面に終了ボタンはありません。CLI を終える時はターミナルで `/exit`（shell は `exit`）を打ちます。独立した `/terminal.html` は従来どおり起動・接続・終了に使えます。
   許可要求には従来どおり「はい／いいえ／ターミナルで こたえる」で答えられます。下のメッセージウィンドウには時刻付きで出来事を語ります。

`/mock.html` は偽データによる組み合わせ見本です。メイン画面と同じ `src/web/town/` の描画と既存の `public/art/manifest.json` の絵を使い、モックのタブ・報告・コマンド等はそのまま残しています。メイン画面のめいれい等の割り込み・みおくるは未実装です。

文字は DotGothic16（`@fontsource/dotgothic16`、SIL Open Font License）を同梱して使います。

### Live2D 表示（`/live2d.html`）

1. serverが表示する `http://127.0.0.1:8790/live2d.html?token=...` のURLをブラウザで開きます。
2. 上部のプリセットと作業ディレクトリ（絶対パス・空欄なら既定）を指定し、「起動」で新しいセッションを作成します。左がキャラクター、右がターミナルです（狭い画面では縦積み）。既存セッションは一覧から選び「接続」、選んだセッションを終えて削除する時は「終了」を押します。「一覧を更新」で他の画面から作ったセッションも確認できます。
3. ターミナルで普段通りCLIを使います。Claude Codeの許可要求は頭上の吹き出しで「許可 / 拒否 / ターミナルで答える」を選べます。ページを閉じてもプロセスは動き続け、開き直すと同じセッションに再接続し、直近256KBの出力が表示されます（接続先はタブの `sessionStorage` に記憶）。同じセッションに複数画面から接続できます。プロセスが終了しても一覧と出力は「終了」で削除するまで残ります。
4. ページを隠すかウィンドウのフォーカスを外して60秒以上経つと、復帰時に受信できた完了・エラー・呼び出しの回数を吹き出しで報告します。7秒後またはクリックで閉じます（許可要求があればそちらを優先します）。

| プリセット | 起動内容 |
| --- | --- |
| shell | `$SHELL`（未設定なら `/bin/sh`） |
| claude | `claude --settings <一時JSON>`。状態フックに絶対パスのアダプタと1秒のtimeout、PermissionRequestにローカルHTTPフック（125秒）を設定。既存の設定ファイルは変更しません |
| pi | `pi -e <アダプタの絶対パス>` |
| codex | `codex`。フックは信頼登録が必要なので自動設定しません（下記の手動手順を参照） |

PATHにCLIが無ければ起動エラーを表示します。任意の起動コマンドは受け付けません。上限は終了済みを含め16セッションです。
作業ディレクトリは存在する絶対パスのディレクトリのみ。省略時は `AGENT_CHARACTER_CWD` → npmの `INIT_CWD` → serverの `process.cwd()` の順です。プロジェクト名はgitの本体リポジトリ名（ワークツリーも同じ）、gitでなければフォルダ名です。
子プロセスには `AGENT_CHARACTER_URL=http://127.0.0.1:<port>/event` と `AGENT_CHARACTER_SESSION=<セッションID>` を自動設定します。

1プロセスで `dist/` のweb、`models/` のモデル一式、`public/` のCore等を配信します。
`PORT=8791 AGENT_CHARACTER_CWD=/path/to/project npm start` でポートと作業ディレクトリを変更できます。`Ctrl+C` でPTY・serverを停止し、一時JSONを削除します。

PTYはMicrosoftの `node-pty` **1.2.0-beta.15** を使用します。Node 26.4/macOS arm64で入出力・リサイズを確認済みです。
安定版1.1.0はmacOSの配布済み `spawn-helper` に実行権限がなく `posix_spawnp failed` となったため、修正済みのこの版を固定しています。
新しいnpmでinstall scriptの承認を要求された場合は `npm approve-scripts node-pty` を実行してください。

開発時は `npm run dev` でViteとrelayを同時起動し、スクリプトが表示するトークン付きVite URLを開きます。
`PORT=8791 VITE_PORT=5175 npm run dev` のように両ポートを変更できます。
`Ctrl+C` で両方のプロセスを停止します。
別々に起動する場合は、`PORT=8791 AGENT_CHARACTER_TOKEN=local-dev npm run dev:relay` と
`PORT=8791 npm run dev:web -- --port 5175` を実行し、`http://localhost:5175/?token=local-dev` を開きます。
**両方のターミナルに同じ `PORT`** を渡してください。
webは開発時のみViteの `/ws`・`/pty`・`/api` プロキシ経由でrelayへ接続します。
状態WSは切断時に3秒後に再接続し、直近2000イベントを再送します。ターミナルは一覧の「接続」またはページの再読込で再接続できます。
画面左下に現在のstateと接続状態を表示します。

体調はコンテキスト使用率に連動します。50%までは元気、50〜90%で徐々にまぶたが重く、呼吸が遅く深く、頭が少し下がり、揺れが控えめになります。80%を初めて超えると `/compact` による会話整理を一度だけ提案します（許可要求を優先し、自動実行はしません）。体調用に送るのは `context`（0〜1 の使用率の数値）のみです。Claude Code 2.1.295は通常フックに使用率・ウィンドウサイズがないため、ローカルの `transcript_path` の末尾最大256KBから最後のassistantの入力＋キャッシュ読取＋キャッシュ作成トークンを読み取ります（SessionStartのresume/forkでは直接の `context_tokens` を使用）。ウィンドウは `AGENT_CHARACTER_CONTEXT_WINDOW`（既定200000、1M等のモデルでは実際のサイズを指定）で割り、piは拡張API `ctx.getContextUsage().percent` を使用します。体調取得で読んだ本文・トークンの内訳・ファイルパスは外へ送らず、取得失敗・不明時は `context` を省略して最後の体調を維持します（下記の会話用 `text` は別途ローカルに送ります）。

### Jevと送信内容

`TYPESAFE_API_KEY` があれば起動時に `JevDecider`、なければ `MockDecider` を選び、ログに表示します。
キーはserverだけが持ち、ブラウザには渡しません。

```sh
TYPESAFE_API_KEY=your-key npm start
# JEV_MODEL=jev-latest が既定。別モデルを使う場合だけ設定します。
```

Jevには `{event, recent, previous}`（状態・ツール名等のイベントメタデータ、今回を含む直近10件の履歴、直前の表情・姿勢）だけを送ります。
Claude Code の UserPromptSubmit の依頼本文と Stop の最終返答だけを `text`（最大8000文字）としてローカルの relay と画面へ送ります。`text` は `deciderEvent` で除外し、今回・履歴とも Jev には送りません。会話と預かり中の本文はサーバーのメモリのみで扱い、ファイル・DB・デバッグログには保存しません（Claude Code 自身の履歴保存は別です）。ツール出力や途中の返答の本文は送りません。手動送信の `detail` は Jev に送られるため、機密情報は入れないでください。
表情・姿勢・ジェスチャーを1リクエストで判断し、confidenceが0.5未満の項目は直前の値を維持します。
同じstateの連続ではAPIを呼ばず、単発ジェスチャーを除いて維持します。
3秒タイムアウト、HTTPエラー（429含む）、不正な応答では1行警告してMockへフォールバックします。リトライはしません。

### ローカルトークン

起動ごとに暗号学的乱数でトークンを作り、表示URLに含めます。URLは外部へ共有しないでください。
**serverは127.0.0.1限定で待ち受け、WS `/ws`・`/pty` と `/api/sessions`・`/api/towns`・`/api/settings` はトークン必須です。URLを他人に共有しないでください。** ターミナルはローカル利用者と同じ権限で動きます。リバースプロキシ等で外部へ公開しないでください。
ターミナル内のプロセスには Jev の API キー（`TYPESAFE_API_KEY`）と server トークン（`AGENT_CHARACTER_TOKEN`）を渡しません。
両WSは正しい `?token=` とserver自身のOriginが必要です（開発時のみlocalhost/127.0.0.1の任意ポートを許可）。セッション・町・設定APIも同じ検査を行いますが、Originが無い同一オリジンGETやcurlはトークンのみで許可します。
開発時は `AGENT_CHARACTER_TOKEN=local-dev npm run dev` で固定できます。本番起動では固定値を使いません。
フック向け `POST /event` はトークン不要ですが、Origin付きのブラウザ発リクエストはローカル以外を拒否します。

## ターミナルのセッションAPI

すべて `?token=<起動URLのトークン>` を付けます。ブラウザからは同じオリジンで利用してください。

| 操作 | API |
| --- | --- |
| 一覧 | `GET /api/sessions` → セッションの配列 |
| 作成 | `POST /api/sessions`、JSON `{ "preset": "shell", "cwd": "/absolute/project" }`（cwd省略可）→ 201と作成したセッション |
| 返事 | `POST /api/sessions/:id/say`、JSON `{ "text": "こんにちは" }`（1〜8000文字）→ 200 `{ "delivered": true }` または `{ "delivered": false }` |
| 終了・削除 | `DELETE /api/sessions/:id` → 204。子プロセスとその子孫を終了し一覧から削除 |
| 接続 | `WS /pty?session=<id>&cols=80&rows=24&token=...` → 保持出力を先に送信し、その後はライブ出力 |

セッションは `{ id, preset, cwd, project, createdAt, exited?: { code } }`。`createdAt` はUnixミリ秒です。
WSへの入力は `{ "type": "input", "data": "echo hello\r" }`、サイズ変更は `{ "type": "resize", "cols": 80, "rows": 24 }`。
不正な作成入力は400、トークン・Origin違反は403、17個目の作成は409、未知のセッションへのWSは1008で切断します。
返事はセッションの最後のイベントで待機を判断します。SessionStart / Stop / StopFailure の後は待機中で、本文をPTYへ書き、300ms後に Enter（`\r`）を送り `delivered: true` を返します。UserPromptSubmit・ツール等のイベントの後やまだイベントが無い時は作業中です。作業中は預かって `delivered: false` を返し、次の Stop / SessionStart で複数の本文を改行でつないで送ります（StopFailure では預かりを送信しません）。終了済みは409、未知は404、不正な本文・JSONは400です。
状態WS `/ws` は預かりの変更時に `{ "type": "pending", "terminal": "セッションID", "texts": ["本文"] }` を送り、送信・終了・削除で空の `texts` を送ります。接続直後にも預かりのあるセッション分を送ります。
セッション・出力・会話・預かりはサーバーのメモリのみで、サーバー停止で消えます。永続化・`--resume`・ワークツリー作成は行いません。

## 町の台帳・設定API

セッションAPIと同じトークン・Origin検査を行います。町の名前はURLエンコードしてください。

| 操作 | API |
| --- | --- |
| 町の一覧 | `GET /api/towns` → 台帳の全件（しまった町も含む） |
| 町を変更 | `PATCH /api/towns/:name`、JSON `{ "theme": "port", "pinned": true, "archived": false }`（各項目は省略可）→ 更新後の町 |
| 設定の取得 | `GET /api/settings` → `{ "archiveAfterDays": 30 }` |
| 設定の保存 | `PUT /api/settings`、JSON `{ "archiveAfterDays": 7 }` → 保存した設定 |

町は `{ name, path, theme?, firstSeenAt, lastActiveAt, pinned, archivedAt? }`。時刻はUnixミリ秒です。
`theme` は `village` / `port` / `snow` / `desert` / `volcano`。`pinned` は真偽値、`archived` は `false`（もどす）だけ受け付けます。
`archiveAfterDays` は0〜365の整数（既定30、0はしまわない）。不正入力は400、未知の町は404、トークン・Origin違反は403です。

台帳に載るのは、このアプリの `POST /api/sessions` で起動した shell 以外のプロジェクトだけです。shell セッションは台帳の登録・活動更新・活動中判定から除外します。最後の起動ディレクトリを `path` に保存します。
このサーバーのセッションに対応する `terminal` 付きイベントで `lastActiveAt` を更新し、しまっていた町を戻します。外からのイベントだけでは登録・更新しません。
サーバー起動時と24時間ごとに、勇者がいない・ピン留めでない・指定日数より古い町をしまいます。起動した勇者が戻ると、すがたを保ったまま自動でもどります。

保存先は `AGENT_CHARACTER_HOME`、未指定なら `~/.config/agent-character`（自動作成）の `towns.json` と `settings.json` です。
一時ファイルからの置き換えで保存し、読めない・壊れたファイルは `.broken` に退避して空の台帳・既定設定で起動します。セッション・出力・報告は保存しません。
状態WS `/ws` は接続直後の `replay` の後と、台帳または設定の変更時に `{ "type": "towns", "towns": [...] }` を送ります。

## イベントを送る

```sh
scripts/emit.sh thinking "コードを確認中"
scripts/emit.sh working "実装中"
scripts/emit.sh success "完了"
```

ポートを変えた場合は `PORT=8791 scripts/emit.sh thinking "確認中"` とします。
直接HTTPで送ることもできます。

```sh
curl -i -X POST http://localhost:8790/event \
  -H 'Content-Type: application/json' \
  -d '{"state":"thinking","detail":"コードを確認中"}'
```

イベントは `{ state, detail?, ts?, source?, tool?, context?, agent?, name?, terminal?, project?, hook?, target?, subagent?, task?, text? }` のJSONです。`text` は最大8000文字の文字列で、ローカル会話用です。Room は UserPromptSubmit を `you`、Stop を `hero` として時刻順の直近30件に組み立て、状態WSの replay とライブイベントから画面を復元します。
`state` は `idle` / `thinking` / `working` / `waiting_input` / `success` / `error`、
`detail` は任意の文字列、`ts` は任意の有限な数値、`context` は任意の0〜1の有限な数値です。
正常時は204、不正なJSONやイベントは400と `{"error":"理由"}` を返します。
serverが検証・判断・候補選択し、`{"type":"decision","event":...,"candidate":...}` を接続中の全WSクライアントへ配信します。
webはcandidateに従って描画するだけです。

### Claude Codeのフック例

たとえばプロジェクトの `.claude/settings.local.json` のフックに以下を追加すると、
プロンプト投入時に `thinking` を送れます（既存設定にマージし、パスを実際の絶対パスに置き換えてください）。

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/agent-character/scripts/emit.sh thinking 'Claude Code prompt received'"
          }
        ]
      }
    ]
  }
}
```

フックは状態イベントを送るだけで、ハーネス本体は変更しません。体調用アダプタは使用量の数値だけをローカルで読み取ります。
relayを起動してから利用してください。

## フック連携

`adapters/` は状態・取得可能な使用率・ローカル表示用メタデータを送ります。Claude Code の UserPromptSubmit と Stop だけは依頼と最終返答の本文もローカルへ送り、本文の解析・LLM呼び出し・再送はしません。Claude Codeの許可要求だけは別のローカルHTTP経路で応答を待ちます。
送信先は `AGENT_CHARACTER_URL`（既定 `http://127.0.0.1:8790/event`）です。
変更する場合はClaude Code / piを起動するシェルで `export AGENT_CHARACTER_URL=http://127.0.0.1:8792/event` のように指定します。
送信は500msでタイムアウトし、relay不在や送信失敗は無視します。
`source` は `claude-code` / `pi`、`tool` はツール名（任意）で、どちらも最大200文字です。
Claude Code の `prompt`（UserPromptSubmit）と `last_assistant_message`（Stop）だけを `text` に最大8000文字で入れます。他のフックでは `text` を送らず、ツール出力・ファイルの中身・通知本文は送りません。`detail` は短い固定文言だけです。
部屋の表示用に、Claude Code アダプタは `agent`（session_id）・`name`（作業ディレクトリ名）・`hook`（フック名）・`subagent`・`task` と、
`target`（ファイルのベース名／コマンドの先頭のパスや値を含まない語を最大3語／WebFetch のホスト名／サブエージェント種別）、`terminal`（`AGENT_CHARACTER_SESSION` がある時）・`project`（cwdの本体リポジトリ名、gitでなければフォルダ名、各最大200文字）を送ります。
TaskCreated / TaskCompleted のタスク件名はホワイトボード用に送ります。これらはローカルの表示だけに使い、Jev には送りません（Jev へは従来どおり state・tool・context 等のみ）。

### Claude Code

埋め込みターミナルのclaudeプリセットは自動で設定するため、以下の作業は不要です。**外部ターミナルで使う場合のみ**、上の単発の `emit.sh` 例の代わりに、`~/.claude/settings.json`（またはプロジェクトの `.claude/settings.json`）の既存設定に以下をマージしてください。
**全ての `/absolute/path/agent-character` を実際の絶対パスに置き換えます**。
`node` がフックのPATHで見つからない場合は、こちらもNodeの絶対パスに置き換えます。
`timeout` は秒単位で、スクリプトの送信タイムアウトとは別の安全策です。

```json
{
  "hooks": {
    "SessionStart": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"/absolute/path/agent-character/adapters/claude-code/hook.mjs\"", "timeout": 1 }] }],
    "SessionEnd": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"/absolute/path/agent-character/adapters/claude-code/hook.mjs\"", "timeout": 1 }] }],
    "UserPromptSubmit": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"/absolute/path/agent-character/adapters/claude-code/hook.mjs\"", "timeout": 1 }] }],
    "PreToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"/absolute/path/agent-character/adapters/claude-code/hook.mjs\"", "timeout": 1 }] }],
    "PostToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"/absolute/path/agent-character/adapters/claude-code/hook.mjs\"", "timeout": 1 }] }],
    "PostToolUseFailure": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"/absolute/path/agent-character/adapters/claude-code/hook.mjs\"", "timeout": 1 }] }],
    "Notification": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"/absolute/path/agent-character/adapters/claude-code/hook.mjs\"", "timeout": 1 }] }],
    "PermissionRequest": [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://127.0.0.1:8790/hooks/permission", "timeout": 125 }] }],
    "SubagentStart": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"/absolute/path/agent-character/adapters/claude-code/hook.mjs\"", "timeout": 1 }] }],
    "SubagentStop": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"/absolute/path/agent-character/adapters/claude-code/hook.mjs\"", "timeout": 1 }] }],
    "TaskCreated": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"/absolute/path/agent-character/adapters/claude-code/hook.mjs\"", "timeout": 1 }] }],
    "TaskCompleted": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"/absolute/path/agent-character/adapters/claude-code/hook.mjs\"", "timeout": 1 }] }],
    "PreCompact": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"/absolute/path/agent-character/adapters/claude-code/hook.mjs\"", "timeout": 1 }] }],
    "PostCompact": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"/absolute/path/agent-character/adapters/claude-code/hook.mjs\"", "timeout": 1 }] }],
    "Stop": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"/absolute/path/agent-character/adapters/claude-code/hook.mjs\"", "timeout": 1 }] }],
    "StopFailure": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"/absolute/path/agent-character/adapters/claude-code/hook.mjs\"", "timeout": 1 }] }]
  }
}
```

SessionStart→`idle`、UserPromptSubmit→`thinking`、PreToolUse / PostToolUse→`working`（`tool_name` 付き）、PostToolUseFailure→`error`（`tool_name` 付き）、Notification→`waiting_input`、Stop→`success` です。
Claude Code 2.1.295の同梱フック説明では、PostToolUseは成功時、PostToolUseFailureは失敗時に発火します（存在しないファイルのReadでも実機確認済み）。
PostToolUseは `tool_response` に明示的なエラーフラグ・エラー値・非ゼロの終了コードがある場合だけ `error` にします（自由文からは推測しません）。
SessionEnd / SubagentStart / SubagentStop / TaskCreated / TaskCompleted / PreCompact / PostCompact / StopFailure は部屋の表示（退勤・助っ人・ホワイトボード・整理中・異常終了）に使います。ユーザーによる中断（PostToolUseFailure の `is_interrupt`）は失敗に数えません。未知のイベントは何もしません。スクリプトは失敗してもexit 0、stdout / stderrへの出力なしで終了します。
`AGENT_CHARACTER_DEBUG=1 npm start` でserverが受信したイベントの `state` / `source` / `tool` / `ts` / `context` / `hook` / `agent` / `target` / `terminal` / `project` だけを1行JSONで表示します（本文やツール出力は記録しません）。
許可要求はClaude Code **2.1.295** 同梱スキーマで確認した `http` 型を使用し、`POST /hooks/permission` の応答を待ちます。ポートを変える外部ターミナルでは上のHTTPフックURLも変更してください。
serverはツール名と短い入力要約（Bashはコマンド先頭120文字、Edit/Writeはパス）だけをローカルWSに配信し、Jevや外部へ送りません。要約には機密情報が含まれうるため、画面共有時には注意してください。
応答JSONは `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}`、拒否は `behavior: "deny"` と固定の `message` です。ターミナルで答える・120秒の時間切れ・web未接続/全切断では `{}` を返してClaudeの通常プロンプトに戻します。autoモードや既存の許可ルールで自動許可されるツールは吹き出しが出ません。
同時に1つだけ表示し、新しい許可要求が来たら古い要求は通常プロンプトに戻します（複数セッションでも同様）。部屋ではそのセッションのカードに表示し、ターミナル側での回答は同じセッション・同じサブエージェントのツール完了か Stop で検知します。設定ファイルは書き換えず、一時settingsだけにフックを追加します。

埋め込みPTYには親の入れ子セッション判定用 `CLAUDE_CODE_CHILD_SESSION` / `CLAUDECODE` を渡しません。`CLAUDE_CODE_USE_BEDROCK` 等の利用者設定はそのまま渡します。

### pi

埋め込みターミナルのpiプリセットは拡張を自動で読み込みます。以下は外部ターミナルで使う場合の手順です。

まず1回だけ読み込む場合:

```sh
pi --extension /absolute/path/agent-character/adapters/pi/agent-character.ts
```

継続して使う場合は、`~/.pi/agent/settings.json` の `extensions` に絶対パスを追加して再起動、または `/reload` してください（既存の項目は残します）。
プロジェクトだけで使うなら `.pi/settings.json` に同じ項目を置きます。プロジェクト設定はtrust承認後に読み込まれます。

```json
{
  "extensions": ["/absolute/path/agent-character/adapters/pi/agent-character.ts"]
}
```

代わりに `pi install /absolute/path/agent-character/adapters/pi/agent-character.ts` でも登録できます（プロジェクト限定は `--local`）。どちらか一方で登録してください。
piがTypeScript拡張を直接読み込み、拡張APIの型はpi自身が提供するので、このリポジトリへの依存追加は不要です。
登録方法はpi同梱の `docs/extensions.md` / `docs/settings.md` / `docs/packages.md` に準拠します。
`agent_start`→`thinking`、`tool_call`→`working`、`tool_result`の `isError`→`error`（正常結果は`working`）、`agent_end`→`success` を送ります。
ブロッキングUIの `ui_prompt_start`→`waiting_input`、`ui_prompt_end`→`thinking` です。
イベントとフィールドは同梱の `dist/core/extensions/types.d.ts` で確認しています。送信をawaitせず、piの処理を待たせません。

### Codex（手動の信頼登録）

codexプリセットはフック設定や信頼登録を自動では変更しません。[公式Hooksドキュメント](https://developers.openai.com/codex/hooks) に対応したCodexで、利用者が次を行います。

1. `~/.codex/hooks.json`（または信頼済みプロジェクトの `.codex/hooks.json`）に以下をマージします。既存のフックは残してください。
2. codexプリセットを起動し、`/hooks` でコマンド内容を確認してこのフックを信頼登録します。定義を変更したら再承認が必要です。
3. 次のプロンプトからthinking、ターン終了時にsuccessが送られます。信頼チェックを迂回するオプションは使いません。

```json
{
  "hooks": {
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "curl --silent --max-time 0.5 -X POST \"$AGENT_CHARACTER_URL\" -H 'Content-Type: application/json' -d '{\"state\":\"thinking\",\"source\":\"codex\"}' >/dev/null 2>&1 || true", "timeout": 1 }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "curl --silent --max-time 0.5 -X POST \"$AGENT_CHARACTER_URL\" -H 'Content-Type: application/json' -d '{\"state\":\"success\",\"source\":\"codex\"}' >/dev/null 2>&1 || true", "timeout": 1 }] }]
  }
}
```

外部ターミナルからCodexを起動する場合は、先に `AGENT_CHARACTER_URL` をexportしてください。curlが必要です。プロンプトやツール内容は送信しません。

### サンプルで確認

relayを `PORT=8792 AGENT_CHARACTER_TOKEN=local-dev npm run dev:relay` で起動し、別ターミナルで `node --input-type=module -e 'import { WebSocket } from "ws"; const ws = new WebSocket("ws://127.0.0.1:8792/ws?token=local-dev", { origin: "http://127.0.0.1:8792" }); ws.on("message", data => console.log(String(data)));'` を先に接続します。
`printf '%s' '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"private"}}' | AGENT_CHARACTER_URL=http://127.0.0.1:8792/event node adapters/claude-code/hook.mjs` を実行し、WSに `working` / `claude-code` / `Bash` のみが届き入力本文がないことを確認します（終わったら両ターミナルをCtrl+Cで停止）。

## Live2Dを使う（任意）

描画依存は `pixi.js` **8.22.0** と `@jannchie/pixi-live2d-display` **1.4.0** を固定しています。
後者のnpm peerDependenciesが `pixi.js: ^8.0.0` であり、Cubism 4専用エントリ `/cubism4` を提供するための組み合わせです。
Core・モデルは自動取得せず、音声・リップシンク機能も使用しません。

### Cubism Core

1. [公式Cubism SDK for Web](https://www.live2d.com/sdk/download/web/) からSDKを利用者自身で入手し、利用条件を確認してください。
2. **Cubism Core は Cubism 5.2 系を使ってください**（[公式配布のCore](https://cubism.live2d.com/sdk-web/core/05/live2dcubismcore.min.js) 等。取得後にバージョンを確認）。**5.3 は現行の描画ライブラリと非互換**です（描画順APIが変わり、描画時に例外になります）。対応するSDKの `Core/live2dcubismcore.min.js` を、このプロジェクトの `public/live2dcubismcore.min.js` へコピーしてください（`public/` が無ければ作成）。
3. `index.html` がこのローカルファイルを読み込みます。外部CDNは使用しません。

**SDK・モデルの利用規約、再配布条件の確認は利用者の責任です。**
Coreと `models/` は `.gitignore` で除外済みです。追跡対象へ追加しないでください。

### 公式サンプルモデル（Hiyoriの例）

1. [公式Live2Dサンプルモデル](https://www.live2d.com/learn/sample/) または
   [公式CubismWebSamples](https://github.com/Live2D/CubismWebSamples) の `Samples/Resources/Hiyori` を利用者自身で入手してください。
2. `Hiyori` フォルダの**中身一式**を `models/default/` にコピーしてください。
   `.model3.json` だけでなく、`.moc3`、テクスチャ、物理・ポーズ等の関連ファイルと相対パスを保って配置します。
3. `npm run dev` を起動し直してページを開きます。`models/default/*.model3.json` をファイル名順で探し、最初の1つを使います。

```text
models/default/
  Hiyori.model3.json
  Hiyori.moc3
  Hiyori.2048/
    texture_00.png
  ...関連ファイル
```

持ち込みモデルは、たとえば `models/my-character/Character.model3.json` を配置し、
起動URLに `&model=/models/my-character/Character.model3.json` を足して指定できます
（Viteが別ポートを選んだ場合は実際のURLを使用）。
別オリジンのモデルを指定する場合、モデル配信側でCORS許可が必要です。
Core、モデル、関連ファイル、WebGL初期化のいずれかが読めなければ簡易顔を使います。

### パラメータ対応表

モデル設定と同じフォルダに `mapping.json` があれば、その表全体を使用します。
無ければ標準Cubism ID（`ParamAngleX/Y/Z`、`ParamBodyAngleX`、左右の目・眉、`ParamMouthForm`）の既定表を使います。
`parameters` 内の各キーはモデルのパラメータID、`source` は抽象パラメータ名です。
任意の `expressions` は抽象表情名から `.model3.json` の `FileReferences.Expressions[].Name` への対応表です。
表情が変わったときだけプラグインの表情機能で設定します。未指定の表情は何もしません。
任意の `gestures` は `nod` / `shake` / `wave` / `think` / `cheer` / `tremble` から
`.motion3.json` のファイル名（パスを除いた名前）への対応表です。
`.model3.json` の `FileReferences.Motions` から一致するファイルのgroup/indexを探し、状態の変わり目に一度だけ再生します。
未指定のジェスチャーは何もしません。再生中の新しいジェスチャーは前の動きを置き換えます。
直近10件（今回を含む）のイベントを判断に渡し、同じstateの連打では表情・姿勢を維持して再生しません。
errorへの遷移時に履歴中のerrorが1件ならshake、2件以上ならtremble、errorを含む履歴の後のsuccessはhappy + cheerです。
既定表には `expressions` / `gestures` はありません。
値は **`params[source] * scale + offset`**。`scale` の省略値は1、`offset` は0です。
それ以外の変換・設定はありません。Coreはモデル側のパラメータ範囲に値を収めます。

`models/my-character/mapping.json` の例（必要なIDをすべてこの1ファイルに記載）：

```json
{
  "parameters": {
    "ParamAngleX": { "source": "headX", "scale": 30, "offset": 0 },
    "ParamAngleY": { "source": "headY", "scale": 30 },
    "ParamAngleZ": { "source": "headX", "scale": 15 },
    "ParamBodyAngleX": { "source": "bodyX", "scale": 10 },
    "ParamEyeLOpen": { "source": "eyeOpen" },
    "ParamEyeROpen": { "source": "eyeOpen" },
    "ParamMouthForm": { "source": "mouthSmile" },
    "ParamBrowLY": { "source": "brow" },
    "ParamBrowRY": { "source": "brow" }
  },
  "expressions": {
    "happy": "モデル内の笑顔のName",
    "troubled": "モデル内の困り顔のName"
  },
  "gestures": {
    "think": "mtnBody_think.motion3.json",
    "cheer": "mtnBody_laugh.motion3.json"
  }
}
```

`source` は `headX` / `headY` / `bodyX` / `eyeOpen` / `mouthSmile` / `brow` のみです。
独自IDのモデルではキーをそのIDへ置き換え、必要に応じてスケールとオフセットを変更してください。
`eyeOpen` は `[0, 1]`、その他は `[-1, 1]` です。`mouthSmile` は正で笑顔、負でへの字口です。
`expressions` のキーは `neutral` / `focused` / `happy` / `troubled` / `surprised` のみです。
表が不正な場合も理由付きで簡易顔にフォールバックします。
プラグインの自動モーション・瞬き・追視は停止し、抽象パラメータとcore側の呼吸・瞬きを毎フレーム適用します。
抽象パラメータ → 指定された単発モーション → モデル表情 → `.physics3.json` の物理演算の順に手動更新します。
髪や小物は姿勢変化に追従して揺れます。アイドルモーションの自動再生は行いません。

ずんだもんを `models/default/` に配置した場合の対応表は同梱しています：

```sh
cp examples/mappings/zundamon.json models/default/mapping.json
```

ページを再読み込みすると、neutral→`exp_smile`、focused→`pose_Jaw`、happy→`exp_laugh`、
troubled→`exp_sad`、surprised→`exp_surprise` を使います。
ジェスチャーはnod→`mtnBody_yes`、shake→`mtnBody_no`、wave→`mtnBody_wave`、think→`mtnBody_think`、
cheer→`mtnBody_laugh`、tremble→`mtnBody_tremble`（すべて `.motion3.json`）です。
別バージョンのモデルでは実際の `Expressions[].Name` と `Motions` のファイル名を確認してください。
この対応表だけがコミット対象で、`models/default/mapping.json` を含むモデル一式・Coreは除外対象です。

## 検証

```sh
npm run typecheck
npm test
npm run build
```

ビルド出力は `dist/` です。`npm start` がwebとWSを同じポートで配信します。
モデルを使うビルドでは、ビルド前にモデルを配置してください。`models/` はserverが直接配信するため、`dist/` へのコピーは不要です。
既定モデルのファイル名一覧はビルド時に決まります。新しいモデルを追加したら再ビルドするか `?model=` で明示します。
Coreは `public/` からViteがコピーします。Core未配置のビルドで出る非moduleスクリプトの警告は、Coreをバンドルせず利用者配置のファイルとして読み込むためのものです。
静的ファイルだけを別配信する構成は本番のOrigin検査に合いません。通常は `npm start` の同一Origin配信を使ってください。

これはローカル用PoCです。serverは `127.0.0.1` のみで待ち受けます。
トークンはローカルWS・セッション（返事を含む）・町・設定APIの保護用で、ユーザー認証ではありません。状態の直近2000イベント（会話の本文を含む）・判断用の直近10件（本文を除く）・各ターミナルの直近256KBの出力・預かり中の返事はメモリ上のみで、永続化しません。画面共有時には会話の機密情報にも注意してください。
インターネットへ公開する用途は想定していません。
