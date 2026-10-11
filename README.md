# Agent Quest (PoC)

## One-line launch / 1行で起動

**English:** Run `npx agent-quest` to open your agents' RPG town in a browser.
**日本語:** `npx agent-quest` の1行で起動し、ブラウザで勇者の町を開きます。

```sh
npx agent-quest
```

Node.js **22.12+** / npm required. macOS and Linux supported; Windows **untested / 未検証**.
現在は npm 公開前です。手元では `npm pack` の後、作業したいフォルダから次のコマンドで試せます（作成した tgz の絶対パスを指定。パッケージからの起動を確認済み）。

```sh
npx --yes --package=/absolute/path/agent-quest-0.1.0.tgz agent-quest
```
`npx agent-quest --no-open --port 8801` ならブラウザを自動で開かず、8801 以降の空きポートを使います。
`npx agent-quest --help`（ソースでは `npm start -- --help`）で起動オプションと環境変数を確認できます。

AIエージェントの状態イベントをRPG風の町と勇者で表示し、埋め込みターミナルの勇者と会話するローカルアプリです。
トップページは **エージェントの町**（RPG 風のドット表示）で、フック・拡張を設定した Claude Code / pi のセッションが勇者として町にやってきて、
作業はモンスターとの戦い、居眠りは宿屋、会話の整理はきょうかい、サブエージェントは仲間として、何を・どう・どれくらいやっているかを見せます（仕様は `docs/OBSERVATION.md`）。
埋め込みターミナルだけの画面は `/terminal.html`、偽データで町を見る画面は `/mock.html`、絵のギャラリーは `/art.html` です。
活動・様子・報告はイベントからローカルで計算します。アプリ自身は外部の判断APIを呼びません。

## 使い方

Node.js 22.12以上とnpmが必要です。Claude Code / pi / Codex は使いたいCLIだけ別途インストールし、PATHに追加してください。
通常は上の1行で起動できます。ソースから起動する場合は次の手順です（起動にはビルド済みJSだけを使います）。

```sh
npm install
npm run build
npm start
```

### Troubleshooting / 困った時

- Node.js: update to **22.12+** / **22.12 以上**に更新してください。
- Data folder: start with `AGENT_CHARACTER_HOME=/writable/folder` / 書けるフォルダを指定してください。
- node-pty: on macOS/Linux with Node.js 22.12+, run `npm cache clean --force`, then reinstall / キャッシュを消してから入れ直してください（ソースなら `npm install`、npx ならもう一度起動）。
- No CLI: install Claude Code / pi / Codex on PATH, **stop agent-quest (Ctrl+C), then start again** / CLI を入れる → agent-quest を止める → 起動し直す。
- Hero ends immediately: check its terminal output; if equipped, update the CLI or launch without equipment / ターミナルの出力を確認し、装備付きなら CLI を更新するか「そうびなし」でしゅつじんし直してください。
- Unexpected startup error: retry with `AGENT_QUEST_DEBUG=1` for a stack trace / 想定外の起動エラーの詳細を表示します（例: `AGENT_QUEST_DEBUG=1 npx agent-quest`）。

### エージェントの町（トップページ）

1. 起動するとブラウザが自動で開きます（`--no-open` で無効）。開かない場合は server が表示する `http://127.0.0.1:<port>/?token=...` のURLを開きます。既定ポートは8790で、使用中なら次の空きポートを表示して使います。
2. 上部の「しゅつじん」を押し、勇者の種類（既定 Claude Code）と行き先を選んで「しゅつじん！」を押します。行き先には起動したフォルダが最初から入り、台帳のしまっていない町からも選べます。町にいる時はその町が初期選択されます。「ほかの フォルダ」なら存在する絶対パスを入力します。種類と対応範囲は `GET /api/agents` の表を表示します。「町・会話に対応」の種類は起動後その町へ移り「会話と報告」の窓が開き、「ターミナルのみ」の種類（shell など）はターミナルを開きます。しゅつじん直後はターミナルを主ボタンにして、Claude の初回設定（テーマ・ログイン・フォルダの信頼など）が必要な場合を案内します。アプリが接続済みでも、CLI の準備が済んだとは限りません。まずターミナルで案内を確かめ、設定を終えてから依頼してください。先に書いた最初の依頼は準備ができてから伝わります。フォルダの信頼確認を検出した時も、会話窓に案内を出します。フックは自動設定され、個人の設定ファイルの編集は不要です。
   Claude Code / pi のセッションごとに1人の勇者が現れます（名前は作業ディレクトリ名）。同じプロジェクトの同名の勇者は来た順に `main-2`・`main-2 (2)` のように区別し、旅立っても残った勇者の番号は変わりません。外のターミナルから来る場合だけ、下の「フック連携」の各エージェントの設定が必要です。
3. まずワールドマップからプロジェクトの町を選びます。ワークツリーは同じリポジトリの町にまとまり、町の印には人数と戦闘中の数が出ます。同じ地方に5つ以上なら1つの印から一覧を開けます。このアプリから起動した勇者の町は台帳に残り、勇者がいなくなると「ねむっている町」に入ります（Codex・shell は台帳に載せません）。外から来た勇者だけの町は、全員が旅立つと消えます。
   初めて入る町は5種類のすがたから選び、「町のすがたを かえる」で変更できます。台帳の町のすがたはサーバーに保存します。外から来た勇者だけの町のすがたは、画面を開いている間だけ覚えます。
4. 町では待機・考え中・読む・調べる等の勇者が通りを歩きます。10分以上イベントが来ない勇者は宿屋のベッドで居眠りします。宿屋をクリックで中へ、南の門からフィールドへ、フィールドの立て札から町や別のフィールドへ移れます。ワールドマップに戻るボタンも使えます。
   - そうげん：ファイル編集＝スライム、任せた仕事＝仲間とドラゴン
   - どうくつ：テスト・型検査＝しれんのゴーレム
   - よるのもり：コマンド実行＝おばけ
   フィールドにはその町の戦闘だけを出し、入りきらない勇者は「ほか N人」と表示します。勇者をクリックするとコマンド窓が開き、先頭の「たたかいを みる」で戦闘にフォーカスできます。フォーカス画面はクリックで戻ります。活動による居場所の移動は瞬間移動です。
5. 町・宿屋・フィールドの勇者をクリックすると、コマンド窓が開きます。町の勇者は立ち止まってこちらを向き、窓の外・Esc・「とじる」で閉じると歩き出します。矢印キーで選び、Enter・Spaceで決定できます。「ようすを みる」はその勇者のつよさ窓を開き、「ついていく」は居場所や戦闘フォーカスを自動で追いかけます（帯の「やめる」や手動の地図移動で解除）。
   - 「さくせん」は3つの定型の依頼から選ぶとその依頼を伝え、「はなす」と同じく待機中はすぐ、作業中は預かって送ります。
   - 「にげる」は作業中だけ中断します。預かり中の依頼がある場合だけ、その件数と捨てたことを知らせます。
   - 「やすむ」は待機中だけ `/compact` できょうかいで会話をまとめて軽くします。確認窓に対象名と実行内容、ターミナルの書きかけが消える注意を表示します。MPが少ない時もこの操作を案内し、表示の数字が実際に増えた時だけ回復を知らせます。
   - 「みおくる」は「はい／いいえ」（最初は「いいえ」）の確認後にセッションを終え、町の門まで歩いて手を振る演出を出します。作業中は「中断して たびだたせますか？」と確認します。会話窓・つよさ窓・ついていくは閉じます。
   外から来た勇者のさくせん・にげる・やすむ・みおくる・ターミナルは、使えない理由を表示して押せません。
   「はなす」はマップを覆う大きな「会話と報告」の窓です。余白は半透明で、会話本文の札はほぼ不透明にして読みやすくしています。直近30件をスクロールで読み返せます。あなたの依頼は吹き出し、勇者の返事は報告の札になり、編集は宝箱、編集なしの調査・テスト・コマンドは巻物、ツールなしの会話は吹き出しの印で表示します。札には時刻・許可待ちを除いた時間（待ち時間も明記）・ファイル名・テスト ○×・しっぱい・ツール数・わかればMPの増減が付きます。長い返事は「▼ つづき」で開き、未読の最新の返事だけ1文字ずつ表示（クリック・Enterで省略、既読の読み返しはすぐ表示）、コードは等幅です。書きかけは勇者ごとにページ内で残り、ターミナルとの行き来や窓を閉じても消えません（ページの再読み込みでは消えます）。入力欄から「つたえる」（Ctrl+Enterでも可）で返事を送り、作業中なら「たたかいが おわったら つたえる」と預かり中の本文を表示して、次の Stop / SessionStart で送信します。外から来た勇者は読むだけです。「とじる」・Esc・窓の外で閉じ、「ターミナルで みる」から元のターミナルへ戻れます。入力中のキーは町の操作に使われません。
   窓を閉じている間に届いた返事は未読となり、勇者の頭上に揺れる「！」、町とワールドマップの札に 📜N を表示します。札が窓に表示されると既読になり、「！」は消え、次の依頼までは小さな報告の印が残ります。既読は勇者IDと時刻だけをブラウザのlocalStorageに最近200件まで記録し、本文や集計は保存しません。右端の「でんれい」は許可待ち → 呼び出し → 新しい町（すがた未選択）→ 苦戦中 → 未読の報告の順です。クリックでその町・勇者へ移り、報告なら会話窓のその札を開きます。
6. 右の「ちいさく／くわしく」で表示を切り替えます（ブラウザに記憶）。「ちいさく」は今の町の勇者全員を名前・Lv・小さなHP/MP・行動の1行ずつで表示し、行を押すとその勇者のコマンド窓を開きます。ワールドマップでは全員を表示し、許可待ちはどちらの表示でも目立たせます。右の「つよさ」は選んだ勇者の Lv・HP（最近の失敗）・MP（コンテキストの残り）・様子・仲間・クエスト・最近の行動です。勇者は地図か右の選択欄で選べます。「ターミナル」で同じセッションの会話（直近256KBの出力）を開けます。外から来た勇者には説明文が出ます。上部の「ターミナル」は「動いている／終わった」を分けた一覧です。shell 等にも「開く」で接続でき、対象名付きの確認（最初は「いいえ」）で「終わらせて 消す」・終了済みの「消す」ができます。
   つよさ窓の「なまえを かえる」で1〜24文字の名前を付け、空にして保存すると自動の名前に戻せます。名前はサーバーに保存され、町・メッセージ・会話と報告・でんれい・めいぼに反映します。
   ターミナル窓の「▶ はなす」で、そのセッションの勇者の会話窓へ戻れます（勇者がいる時だけ表示）。ターミナル窓は「とじる」・Esc・窓の外のクリックで閉じます。閉じてもセッションは動き続け、町に戻れます（この窓の Esc は CLI には送りません）。町の勇者はコマンドの「みおくる」で終えられます。ターミナルで Claude Code は `/exit`、pi は `/quit`（shell は `exit`）を打っても終了します。独立した `/terminal.html` は起動・接続・終了に使え、「町へ もどる」で同じトークンの町へ戻れます。
   許可要求には「はい／いいえ／ターミナルで こたえる」で答えられます。「ターミナルで こたえる」はその勇者のターミナル窓を開きます。下のメッセージウィンドウには時刻付きで出来事を語ります。
7. 上部の「めいぼ」は旅立った Claude Code / pi の勇者の名前・プロジェクト・旅立った時刻を表示します。「よびもどす」で同じセッションを同じ作業ディレクトリで再開し、その町へ移って会話窓を開きます。勇者は門から戻ってきます。めいぼに会話本文は保存しません。会話窓にも「前の 会話と ほうこくは 画面には もどりません（勇者は おぼえています）」と知らせます。
8. 上部の「ヘルプ」で RPG の言葉と実際の操作・画面の見方を確認できます。HP・MP・Lv はマウスを乗せると短い説明も表示します。

`/mock.html` は偽データによる組み合わせ見本です。メイン画面と同じ `src/web/town/` の描画と既存の `public/art/manifest.json` の絵を使い、モックのタブ・報告・コマンド等はそのまま残しています。作業中のめいれい等の割り込みは本体では行いません。

文字は DotGothic16（`@fontsource/dotgothic16`、SIL Open Font License）を同梱して使います。

### プリセット／エージェント

起動・再開・コマンドの送り方は `src/server/agents.ts` の1つの表で定義します。公開部分は `GET /api/agents` から取得できます。

| id / 表示名 | 起動内容 | 対応範囲 | 再開 | やすむ | 終了 |
| --- | --- | --- | --- | --- | --- |
| claude / Claude Code | `claude --settings <一時JSON>` | 町・会話・コマンド | `--resume <ID>` | `/compact` | `/exit` |
| codex / Codex | `codex` | ターミナルのみ | アプリでは非対応 | 非対応 | `/quit` |
| pi / pi | `pi -e <アダプタの絶対パス>` | 町・会話・コマンド | `--session <ID>` | `/compact` | `/quit` |
| shell / shell | `$SHELL`（未設定なら `/bin/sh`） | ターミナルのみ（勇者は出ない） | 非対応 | 非対応 | `exit` |

Claude Code の一時JSONには状態フック（1秒）と PermissionRequest のローカルHTTPフック（125秒）を設定します。pi の拡張も起動時に読み込みます。個人の設定ファイルは変更しません。Codex はフックの信頼登録が必要なため自動設定しません（調査結果は下の「Codex」参照）。

起動時に PATH の `claude`・`pi`・`codex` を検出し、しゅつじん窓にはインストール済みの種類だけを出します。どれも無ければ入れ方を案内します（shell は常に選べます）。CLI を追加したら server を再起動してください。任意の起動コマンドは受け付けません。上限は終了済みを含め16セッションです。
作業ディレクトリは存在する絶対パスのディレクトリのみ。省略時は `AGENT_CHARACTER_CWD` → npmの `INIT_CWD` → serverの `process.cwd()` の順です。プロジェクト名はgitの本体リポジトリ名（ワークツリーも同じ）、gitでなければフォルダ名です。
子プロセスには `AGENT_CHARACTER_URL=http://127.0.0.1:<port>/event` と `AGENT_CHARACTER_SESSION=<セッションID>` を自動設定します。

1プロセスで `dist/` のwebと同梱した `dist/art/` の町の絵を配信します（ソース開発時は `public/art/` も使えます）。
`npm start -- --no-open --port 8791`、または `PORT=8791 AGENT_CHARACTER_CWD=/path/to/project npm start` でポートと作業ディレクトリを変更できます。`--port` は `PORT` より優先します。指定ポートも使用中なら次の空きポートを使います。`Ctrl+C` でPTY・serverを停止し、一時JSONを削除します。

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
画面上部に接続状態を表示します。

MP はコンテキスト使用率から求めます（1−使用率）。少なくなったら「やすむ」で会話を整理できます（自動実行はしません）。使用率として送るのは `context`（0〜1 の数値）のみです。Claude Code 2.1.295は通常フックに使用率・ウィンドウサイズがないため、ローカルの `transcript_path` の末尾最大256KBから最後のassistantの入力＋キャッシュ読取＋キャッシュ作成トークンを読み取ります（SessionStartのresume/forkでは直接の `context_tokens` を使用）。ウィンドウは `AGENT_CHARACTER_CONTEXT_WINDOW`（既定200000、1M等のモデルでは実際のサイズを指定）で割り、piは拡張API `ctx.getContextUsage().percent` を使用します。体調取得で読んだ本文・トークンの内訳・ファイルパスは外へ送らず、取得失敗・不明時は `context` を省略して最後の使用率を維持します（下記の会話用 `text` は別途ローカルに送ります）。

### 送信内容とプライバシー

Claude Code / pi の UserPromptSubmit の依頼本文と Stop の最終返答だけを `text`（最大8000文字）としてローカルの relay と画面へ送ります。アプリはイベント・会話・許可の要約を外部へ送りません。
会話と預かり中の本文はサーバーのメモリのみで扱い、ファイル・DB・デバッグログには保存しません（各CLI自身の履歴保存は別です）。ツール出力や途中の返答の本文は送りません。手動送信の `detail` も画面に表示されるため、画面共有時には機密情報に注意してください。

### ローカルトークン

起動ごとに暗号学的乱数でトークンを作り直し、ブラウザを正しいURLで自動で開きます（`--no-open` で無効）。トークンは保存せず、以前の `<データフォルダ>/token` が残っていても読み書きしません。再起動後は新しいURLを使ってください。データフォルダは `AGENT_CHARACTER_HOME`、既定は `~/.config/agent-character` です。URLは外部へ共有しないでください。
**serverは127.0.0.1限定で待ち受け、WS `/ws`・`/pty` と `/api/agents`・`/api/sessions`・`/api/roster`・`/api/names`・`/api/towns`・`/api/settings` はトークン必須です。URLを他人に共有しないでください。** ターミナルはローカル利用者と同じ権限で動きます。リバースプロキシ等で外部へ公開しないでください。
ターミナル内のプロセスには server トークン（`AGENT_CHARACTER_TOKEN`）を渡しません。
両WSは正しい `?token=` とserver自身のOriginが必要です（開発時のみlocalhost/127.0.0.1の任意ポートを許可）。セッション・町・設定APIも同じ検査を行いますが、Originが無い同一オリジンGETやcurlはトークンのみで許可します。
開発時は `AGENT_CHARACTER_TOKEN=local-dev npm run dev` で固定できます。本番起動はこの環境変数を無視し、保存した token を使います。
フック向け `POST /event` はトークン不要ですが、Origin付きのブラウザ発リクエストはローカル以外を拒否します。

## ターミナルのセッションAPI

すべて `?token=<起動URLのトークン>` を付けます。ブラウザからは同じオリジンで利用してください。

| 操作 | API |
| --- | --- |
| エージェント | `GET /api/agents` → `[{ id, label, hero, resume, compact, equipWeapon, equipAccessory }]`（対応能力は真偽値） |
| そうびマスタ | `GET /api/equipment` → 種類ごとの `{ weapons: [{ id, name, model }], accessories: [{ id, name, value }] }` |
| 一覧 | `GET /api/sessions` → セッションの配列 |
| 作成 | `POST /api/sessions`、JSON `{ "preset": "claude", "cwd": "/absolute/project", "weapon": "steel", "accessory": "low" }`（cwd・weapon・accessory省略可）→ 201と作成したセッション |
| そうび変更 | `POST /api/sessions/:id/equip`、JSON `{ "weapon": "steel", "accessory": "high" }` → 200 `{ "delivered": boolean }`、未対応は409 |
| 返事 | `POST /api/sessions/:id/say`、JSON `{ "text": "こんにちは" }`（1〜8000文字）→ 200 `{ "delivered": true }` または `{ "delivered": false }` |
| 勇者のコマンド | `POST /api/sessions/:id/action`、JSON `{ "action": "interrupt" }`（`interrupt` / `compact` / `farewell`）→ 200 `{ "ok": true }` |
| めいぼ | `GET /api/roster` → 旅立った Claude Code / pi の配列 |
| よびもどす | `POST /api/roster/:sessionId/recall` → 201と同じ種類の新しいターミナルセッション |
| 終了・削除 | `DELETE /api/sessions/:id` → 204。子プロセスとその子孫を終了し一覧から削除 |
| 接続 | `WS /pty?session=<id>&cols=80&rows=24&token=...` → 保持出力を先に送信し、その後はライブ出力 |

セッションは `{ id, preset, cwd, project, createdAt, weapon?, accessory?, exited?: { code, at } }`。`createdAt` と終了時刻 `exited.at` はUnixミリ秒です。
WSへの入力は `{ "type": "input", "data": "echo hello\r" }`、サイズ変更は `{ "type": "resize", "cols": 80, "rows": 24 }`。
不正な作成入力は400、トークン・Origin違反は403、17個目の作成は409、未知のセッションへのWSは1008で切断します。
返事はセッションの最後のイベントで待機を判断します。SessionStart / Stop / StopFailure / PostCompact の後は待機中で、本文をPTYへ書き、300ms後に Enter（`\r`）を送り `delivered: true` を返します。UserPromptSubmit・ツール・PreCompact の後やまだイベントが無い時は作業中です。通知やサブエージェントは待機判定を変えません。作業中は預かって `delivered: false` を返し、次の Stop / SessionStart で複数の本文を改行でつないで送ります（StopFailure では預かりを送信しません）。終了済み・旅立ち中は409、未知は404、不正な本文・JSONは400です。
`interrupt`（にげる）は Claude Code / pi に Esc を送り、預かりを空にして待機中に戻します。`compact`（やすむ）は待機中だけ `/compact` を実行し、作業中・非対応の種類は409です。`farewell`（みおくる）は作業中なら Esc の後に少し待ち、表の終了コマンドで終了して一覧から消します。5秒で終了しない時は DELETE と同じ終了処理を使います。CLIコマンドは下書きを Ctrl+C で全文消して通常の文字として送り、300ms後に Enter を送ります（Claude Code 2.1.296 と実際の pi で確認）。Claude Code の中断後の返事は、Escで復元される下書きも消してから送ります。ターミナルのみの種類への say / interrupt は409です。
状態WS `/ws` は預かりの変更時に `{ "type": "pending", "terminal": "セッションID", "texts": ["本文"] }` を送り、送信・終了・削除で空の `texts` を送ります。接続直後にも預かりのあるセッション分を送ります。
pi と Codex の武器は利用者のプロバイダ次第なので既定のマスタには入れていません。使う場合は `<データフォルダ>/equipment.json` に例えば `{ "pi": { "weapons": [{ "id": "steel", "name": "はがねの つるぎ", "model": "<provider/model>" }], "accessories": [...] } }` と書きます（エージェント単位の丸ごと上書きなので accessories も書く）。
そうびの既定は両方とも「そうびなし」（引数なしでCLI自身の設定）。`src/server/equipment.json` を起動時に読み、`<データフォルダ>/equipment.json` があればエージェント単位で丸ごと上書きします（個別の武器の継ぎ足しはしません）。壊れた上書きは `.broken` に退避して既定を使います。未知の装備ID・不正JSONは400、未知セッションは404、終了済みは409です。モデル名自体の有効性はCLIに任せます。
pi は `/model <値>` と `/thinking <値>` を貼り付け＋300ms後Enterで送り、作業中なら預かります。作業が終わった後（StopFailureも含む）は、預かった装備を先に持ちかえ、その後に次の依頼を送ります（StopFailureでは装備のみ、依頼は送りません）。モデル変更後はアクセサリも再適用します。未配送の装備は最後の選択が優先され、にげる・終了で捨てます。Claude Code 2.1.296 は途中コマンドが利用者の既定も保存するため、Codex・shell とともに途中変更は409、変更できるのは新しいしゅつじん時だけです。よびもどすと前の装備を引き継ぎます。途中で装備を外して起動前の既定に戻す操作も409です。装備の預かりは `pending` に任意の `equipment: { weapon?, accessory? }` を添え、変更コマンドを送ったら `{ type: "equipped", session }` を状態WSで通知します。これらもメモリのみです。
状態WSは初回のフォルダ信頼確認をPTY出力から検出すると `{ "type": "attention", "terminal": "セッションID", "reason": "trust" }` を同じセッションで1回送ります。勇者が着くまでは再接続時にも再送します。アプリ産の勇者は、CLI自身の終了イベントが来なくてもPTY終了時に SessionEnd を合成して町から退場します。
セッション・出力・会話・預かりはサーバーのメモリのみで、サーバー停止で消えます。依頼を送った Claude Code / pi の終了時に、めいぼへ `{ sessionId, name, project, cwd, leftAt, preset, weapon?, accessory? }` を保存します。装備IDも保存し、よびもどす時は同じ装備を起動引数で渡します。`sessionId` は `terminal` 付きの本体イベントの `agent` から覚え、本文・報告・返事は保存しません。最大50件で古いものから消します。
めいぼは `AGENT_CHARACTER_HOME`（未指定なら `~/.config/agent-character`）の `roster.json` に、台帳と同じ一時ファイルからの置き換えで保存します。読めない・壊れたファイルは `.broken` に退避し空で起動します。よびもどす時は同じ `cwd` と種類で、Claude Code は `--resume <sessionId>`、pi は `--session <sessionId>`（通常と同じフック・拡張設定）を起動し、めいぼから消します。旧めいぼの `preset` 省略は Claude Code として扱います。英数字とハイフンだけの1〜200文字の ID を受け付け、不正な ID は400、未知は404、同じ ID の同時よびもどしやセッション上限は409です。Codex の resume やワークツリー作成は行いません。めいぼAPIもセッションAPIと同じトークン・Origin検査です。

## 勇者の名前API

セッションAPIと同じ `?token=`・Origin検査です。勇者のIDは Claude Code / pi のセッションID（英数字とハイフン、先頭は英数字、1〜200文字）で、よびもどした後も同じIDです。

| 操作 | API |
| --- | --- |
| 名前の一覧 | `GET /api/names` → `{ "勇者ID": "付けた名前" }` |
| 名前の保存・解除 | `PUT /api/names/:id`、JSON `{ "name": "アルス" }` → 更新後の名前一覧 |

前後の空白を除いた1〜24文字を受け付け、空文字・空白だけならそのIDの名前を削除して自動の名前に戻します。不正な名前・ID・JSONは400、トークン・Origin違反は403です。
`AGENT_CHARACTER_HOME`（未指定なら `~/.config/agent-character`）の `names.json` にID→名前のマップを、一時ファイルからの置き換えで保存します。読めない・壊れたファイルは `.broken` に退避し空で起動します。
状態WS `/ws` は接続直後と名前の変更時に `{ "type": "names", "names": { "勇者ID": "付けた名前" } }` を送ります。表示名は付けた名前を優先し、Claude Code / pi が旅立つ時のめいぼにも付けた名前を載せます。

## 町の台帳・設定API

セッションAPIと同じトークン・Origin検査を行います。町の名前はURLエンコードしてください。

| 操作 | API |
| --- | --- |
| 町の一覧 | `GET /api/towns` → 台帳の全件（しまった町も含む） |
| 町を変更 | `PATCH /api/towns/:name`、JSON `{ "theme": "port", "pinned": true, "archived": false }`（各項目は省略可）→ 更新後の町 |
| 設定の取得 | `GET /api/settings` → `{ "archiveAfterDays": 30, "startupCwd": "/absolute/path/起動したフォルダ" }`（startupCwd は起動時の情報で保存しない） |
| 設定の保存 | `PUT /api/settings`、JSON `{ "archiveAfterDays": 7 }` → 保存した設定 |

町は `{ name, path, theme?, firstSeenAt, lastActiveAt, pinned, archivedAt? }`。時刻はUnixミリ秒です。
`theme` は `village` / `port` / `snow` / `desert` / `volcano`。`pinned` は真偽値、`archived` は `false`（もどす）だけ受け付けます。
`archiveAfterDays` は0〜365の整数（既定30、0はしまわない）。不正入力は400、未知の町は404、トークン・Origin違反は403です。

台帳に載るのは、このアプリの `POST /api/sessions` で起動した町対応の勇者（Claude Code / pi）のプロジェクトだけです。Codex・shell は台帳の登録・活動更新・活動中判定から除外します。最後の起動ディレクトリを `path` に保存します。
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
serverが検証し、`{"type":"event","event":...,"at":...}` を接続中の全WSクライアントへ配信します。
webはイベントからRoomを組み立て、coreの計算で活動・様子・町・報告を表示します。

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

`adapters/` は状態・取得可能な使用率・ローカル表示用メタデータを送ります。Claude Code / pi の UserPromptSubmit と Stop だけは依頼と最終返答の本文もローカルへ送り、本文の解析・LLM呼び出し・再送はしません。Claude Codeの許可要求だけは別のローカルHTTP経路で応答を待ちます。
送信先は `AGENT_CHARACTER_URL`（既定 `http://127.0.0.1:8790/event`）です。
変更する場合はClaude Code / piを起動するシェルで `export AGENT_CHARACTER_URL=http://127.0.0.1:8792/event` のように指定します。
送信は500msでタイムアウトし、relay不在や送信失敗は無視します。
`source` は `claude-code` / `pi`、`tool` はツール名（任意）で、どちらも最大200文字です。
Claude Code の `prompt`（UserPromptSubmit）と `last_assistant_message`（Stop）だけを `text` に最大8000文字で入れます。他のフックでは `text` を送らず、ツール出力・ファイルの中身・通知本文は送りません。`detail` は短い固定文言だけです。
部屋の表示用に、Claude Code アダプタは `agent`（session_id）・`name`（作業ディレクトリ名）・`hook`（フック名）・`subagent`・`task` と、
`target`（ファイルのベース名／コマンドの先頭のパスや値を含まない語を最大3語／WebFetch のホスト名／サブエージェント種別）、`terminal`（`AGENT_CHARACTER_SESSION` がある時）・`project`（cwdの本体リポジトリ名、gitでなければフォルダ名、各最大200文字）を送ります。
TaskCreated / TaskCompleted のタスク件名はホワイトボード用に送ります。これらはローカルの表示だけに使います。

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
serverはツール名と短い入力要約（Bashはコマンド先頭120文字、Edit/Writeはパス）だけをローカルWSに配信し、外部へ送りません。要約には機密情報が含まれうるため、画面共有時には注意してください。
応答JSONは `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}`、拒否は `behavior: "deny"` と固定の `message` です。ターミナルで答える・120秒の時間切れ・web未接続/全切断では `{}` を返してClaudeの通常プロンプトに戻します。autoモードや既存の許可ルールで自動許可されるツールは吹き出しが出ません。
同時に1つだけ表示し、新しい許可要求が来たら古い要求は通常プロンプトに戻します（複数セッションでも同様）。部屋ではそのセッションのカードに表示し、ターミナル側での回答は同じセッション・同じサブエージェントのツール完了か Stop で検知します。設定ファイルは書き換えず、一時settingsだけにフックを追加します。

埋め込みPTYには親の入れ子セッション判定用 `CLAUDE_CODE_CHILD_SESSION` / `CLAUDECODE` を渡しません。`CLAUDE_CODE_USE_BEDROCK` 等の利用者設定はそのまま渡します。

### pi

埋め込みターミナルのpiプリセットは拡張を自動で読み込みます。npm パッケージではビルド済みの `lib/adapters/pi/agent-character.js` を使い、ソースや実行時の TypeScript コンパイラには依存しません。以下はソースを外部ターミナルで使う場合の手順です。

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
Claude Code と同じ `hook` を送ります。`session_start`→SessionStart、`before_agent_start`→UserPromptSubmit（依頼本文）、`tool_call`→PreToolUse、`tool_result`→PostToolUse / PostToolUseFailure、`agent_settled`→Stop（最終返答本文）、`session_shutdown`（quit）→SessionEnd です。返答は `agent_end.messages` の最後の assistant から取得し、回復や継続が終わる `agent_settled` まで入力待ちにしません。中断は Interrupt、モデルのエラーは StopFailure にします。
`agent` は `ctx.sessionManager.getSessionId()`、`name` は作業フォルダ名、`project` は本体リポジトリ名、`terminal` は環境変数です。組み込みツール名は Read / Edit / Write / Bash 等へ揃え、target はファイルのベース名かコマンドの安全な先頭だけです。整理は PreCompact / PostCompact、ブロッキングUIは Notification を送ります。
APIは同梱の `docs/extensions.md` / `dist/core/extensions/types.d.ts` に準拠します。通常は送信をawaitせず、終了時だけ最大500msの送信完了を待ちます。起動→会話→中断→整理→終了→めいぼから同じIDで再開を実機確認済みです。

### Codex（ターミナルのみ）

`codex --help` / `codex --version`（0.162.1）と[公式Hooks](https://developers.openai.com/codex/hooks)、[設定リファレンス](https://developers.openai.com/codex/config-reference)、[notifyの説明](https://developers.openai.com/codex/config-advanced#notifications)を確認しました。
`-c key=value` で起動時の設定を渡せ、`hooks.<Event>`（SessionStart / SessionEnd / UserPromptSubmit / PreToolUse / PostToolUse / Stop 等）の定義も存在します。ただし非managedフックは定義のハッシュごとの `/hooks` 信頼登録が必要で、未承認なら実行されません。
`--dangerously-bypass-hook-trust` は存在しますが、このアプリは信頼確認の迂回も個人設定の書き換えもしません。環境変数 `CODEX_HOME` を別の場所にする方法も、フックの信頼登録を不要にはしません。
`-c 'notify=["プログラム","引数"]'` の通知は現時点で `agent-turn-complete` だけなので、セッション開始・依頼・ツール進行を届ける契約を満たせません。このため表は `hero:false, resume:false, compact:false` とし、Codexはターミナルのみです。将来の自動連携用アダプタや設定項目は追加していません。

### サンプルで確認

relayを `PORT=8792 AGENT_CHARACTER_TOKEN=local-dev npm run dev:relay` で起動し、別ターミナルで `node --input-type=module -e 'import { WebSocket } from "ws"; const ws = new WebSocket("ws://127.0.0.1:8792/ws?token=local-dev", { origin: "http://127.0.0.1:8792" }); ws.on("message", data => console.log(String(data)));'` を先に接続します。
`printf '%s' '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"private"}}' | AGENT_CHARACTER_URL=http://127.0.0.1:8792/event node adapters/claude-code/hook.mjs` を実行し、WSに `working` / `claude-code` / `Bash` のみが届き入力本文がないことを確認します（終わったら両ターミナルをCtrl+Cで停止）。

## 検証

```sh
npm run typecheck
npm test
npm run build
```

ビルド出力は web・絵の `dist/` と server・pi拡張の `lib/` です。既存の Vite の SSR ビルドで Node ESM を出すため、ビルドの追加依存はありません。`npm start` はビルド済みJSからwebとWSを同じポートで配信します。
`npm pack --dry-run` で同梱一覧とサイズを確認でき、`npm pack` は先にビルドします。パッケージには `dist/`・`lib/`・Claudeフック・起動用bin・README・package.jsonだけが入り、テスト・ソース・デモ道具・`.art-work/`・利用者データは入りません。
コードと生成した絵のライセンスは npm 公開前に決定して明記します。現段階では公開・publish は行っていません。
静的ファイルだけを別配信する構成は本番のOrigin検査に合いません。通常は `npm start` の同一Origin配信を使ってください。

これはローカル用PoCです。serverは `127.0.0.1` のみで待ち受けます。
トークンはローカルWS・セッション（返事を含む）・町・設定APIの保護用で、ユーザー認証ではありません。状態の直近2000イベント（会話の本文を含む）・各ターミナルの直近256KBの出力・預かり中の返事はメモリ上のみで、永続化しません。画面共有時には会話の機密情報にも注意してください。
インターネットへ公開する用途は想定していません。
