# デモ素材の記録・再生・撮影（S8.1 / v2）

開発用だけの道具。追加依存なし。npmパッケージには含めない。

## 完成動画と撮り直し

絵コンテ：`.art-work/s8/demo2/storyboard.md`。完成物・目視QA・変更点：`.art-work/s8/demo2/report.md`。

- デモ：`demo-{ja,en}-16x9.mp4`、80秒、1920×1080。
- プロモ：`promo-{ja,en}-{16x9,1x1}.mp4`、18秒、1920×1080 / 1080×1080。
- 日本語と英語は別ファイル。1:1は別構図。無音、H.264 / yuv420p、10fpsで撮影して30fpsで格納。
- `stills/<variant>/` はシーン写真。`qa/<variant>/` は**完成mp4から再抽出**した目視確認用フレーム。
- `<variant>.proof.json` は画面のLv・許可要約・報告、元JSONL行、端末抜粋の元PTY行／テキスト行を記録。

```sh
npm run build
# 全6本。既に起動している専用ヘッドレスChromeのCDP 9333が必要。
node tools/demo/film.mjs .art-work/s8/demo2
# 1本だけ、または動画を作らずシーン写真のレイアウト確認。
node tools/demo/film.mjs .art-work/s8/demo2 promo-en-1x1
node tools/demo/film.mjs .art-work/s8/demo2 demo-ja-16x9 --stills-only
# 完成6本をffprobe検査し、各7枚をmp4から再抽出して目視する。
node tools/demo/extract-qa.mjs .art-work/s8/demo2
```

**外部Chromeの使用を明示的に指示されたS8.1-F用。** 通常のOrca内のページ確認はorca-cliスキルに従う。この道具はブラウザを起動せず、既存の `127.0.0.1:9333` に自分専用Targetだけを作り、正常終了／例外時に閉じる。CDPがなければ失敗し、他のブラウザへ切り替えない。

`film.mjs` は8805のサーバー、ランダムな一時トークン、`/tmp/agent-quest-film-*` の `AGENT_CHARACTER_HOME` を用意する。8805が使用中なら中止する。終了時に自分のサーバーを止め、一時homeを消す。8790・利用者データ・設定・認証には触れない。

### 撮影の仕組みと限界

- `shots.mjs`：承認済みの固定編集点。デモはmainの元行を**0〜77の順序のまま**使う。両Stop・Exploreの内部完了通知を残し、SessionEndだけ省く。プロモは本物の記録のprefixをシーンごとに再生するモンタージュ。
- `capture.mjs`：専用Target内でアプリのWSメッセージ受信口へ記録済みevent/replay/permissionパケットを渡す。サーバーのPTY・`/event`・`/hooks/permission`は撮影に使わない。入力送信・PTY接続・API書き込みを止め、記録済みの手動回答だけ画面上で再生する。コマンドは実行しない。
- `stage.mjs`：専用Target内のCSS・撮影時計・DOM操作だけ。アプリ/coreは変更しない。`GET /api/sessions` は記録済み装備メタデータ、設定の初期フォルダは匿名化済みのデモフォルダにする。しゅつじんの起動ボタン、会話の送信ボタンは押さない。
- `terminal-excerpts.mjs`：既存xtermで**本物のmain-pty.jsonl**をANSI解釈し、該当行を抜粋する。最終テスト・報告は実端末を展開して保存した `main-terminal.txt`。ANSI色は除き、折り返し・長い区切り線の横方向クロップだけ行う。コード・結果・本文を作り直さない。
- 端末は読みやすい別枠に常時表示するデモと、短い挿入のプロモ。リアルタイムのPTYではなく、タイトルに「記録時の出力」と明記した元記録の抜粋。端末バッファ内の先行表示／一括ツール待機は元のまま。
- 時計と間隔を編集するだけで、ID・装備・結果・Lv式は変えない。デモは町1倍／戦闘2倍。プロモは町2倍（16:9）／3倍の寄り（1:1）、戦闘4倍でゲームが画面を埋める。下の開発用の勇者／Lv札は除く。切れる戦闘HUDと台詞は**同じ実キャンバスの画素**を3倍／2倍で安全な位置へ転写する（台詞の1:1外縁17pxだけクロップ）。数字・本文を描き直さない。レベルアップは実UIが生成した最後の通知行を表示する。
- **PermissionRequest後のPostToolUseはactivityを復元しない**ため、本物のEdit/Test成功後は町に残る。架空のPreToolUseを足さず、Slime/Golemは許可前の実PreToolUse、かいしんは実M#4 Agent成功のDragonで撮る。この絵コンテとの差分はreportに明記する。
- 冒頭の `npx agent-quest` は入口を示す編集タイトル。隣の起動ログは本物の開発起動ログであり、npxを実行した端末の捏造ではない。初回信頼確認も元の実CLI画面を使う。

v1の撮影コードはv2へ置き換えた。旧素材／検証記録は `.art-work/s8/demo/` と `recorded.jsonl`、`timeline.json` に残るが、旧 `film.mjs TIMELINE OUTPUT` の呼び方は使えない。

## 本物の素材と検証

`recordings-v2/`：

- `main.jsonl` / `main-pty.jsonl`：Claude Code 2.1.296、legend（Opus 5.5）。3関数修正、3テスト追加、実npm testは**6ケースpass・0fail**。Explore1人、内容を見て回答した許可7回。
- `main-terminal.txt`：実端末の展開済み最終画面。`manifest.json`：実セッションのAPI応答（パス匿名化）。`startup.txt`：トークンを伏せた開発起動ログ。
- `town-{1,2,3}.jsonl` / 対応するPTY：別のhero-townリポジトリでそれぞれRead2回と1文の報告。IDを複製せず、3人が同じ町にいる素材。
- **Lv2はmainの0始まり#25（wins=10）、Lv3は#69（wins=20）**。最終wins=21、quests=0、Lv3。宝箱までLv2を遅らせたり、成功／クエストを足したりしない。
- ClaudeはExploreを背景へ出していったんStopし、その実完了通知で続きを実行した。最終報告の集計は**6ファイル・成功テスト実行1回・ツール13回・失敗0**。端末の6ケースとは単位が違う。

```sh
# 元行の順序を保ち、長い間隔だけ最大1200msへ短縮する検証用プレビュー。
node tools/demo/prepare-sequence.mjs tools/demo/demo-v2.timeline.json tools/demo/recordings-v2/main.jsonl
node tools/demo/prepare-sequence.mjs tools/demo/town-v2.timeline.json tools/demo/recordings-v2/town-1.jsonl tools/demo/recordings-v2/town-2.jsonl tools/demo/recordings-v2/town-3.jsonl
node_modules/.bin/tsx tools/demo/verify-recording.ts tools/demo/demo-v2.timeline.json
```

`originFile` / `originIndex` が元行を指す。各記録を0秒から重ね、SessionEndだけ最後の画面を保持するため省く（元記録には残す）。この検証用短縮尺は完成動画の尺ではない。

履歴の空の8805サーバー・一時homeで `replay.mjs URL demo-v2.timeline.json`、続けて `town-v2.timeline.json` を再生できる。`record.mjs` でそのWSを/tmpへ記録し、対象勇者に絞ったJSONLを `verify-recording.ts TIMELINE LIVE_JSONL` に渡すと元行・core・実サーバーの一致を検証できる。

証拠：`.art-work/s8/demo2/{replay-proof,town-proof}.json`。実サーバー再生でもLv1→2→3・同じ町の3人を確認済み。再生APIは `POST /event` と `/ws`。許可UIは実要約を `/hooks/permission` で再現し、実PostToolUseでフォールバックとして閉じる。実コマンド／PTY／自動承認はない。`/api/events` は現行APIにない。

## 素材を再記録する場合（撮影には不要）

1. **別途、実CLI記録の許可がある時だけ**行う。8805、一時AGENT_CHARACTER_HOME、一時CLAUDE_CONFIG_DIRを使用する。認証 `.credentials.json` だけをコピーし、settings・履歴・利用者設定はコピー／変更しない。
2. `/tmp` に小さなgitリポジトリを作り、次の3関数と対応するNode組み込みテストを置く。デモ用ソースを本リポジトリに置かない（vitestが拾うため）。
3. `node_modules/.bin/tsx src/server/relay.ts --port 8805 --no-open` を起動し、しゅつじんでClaude、でんせつのつるぎ、デモフォルダを選ぶ。初回テーマ・信頼確認を依頼前に済ませ、Auto modeを選ばず**manual modeの表示**を確認する。一時settingsを作る場合もCLAUDE_CONFIG_DIR内だけ。

```js
// quest.mjs / pack.mjs / health.mjs（別ファイル）
export function reward(coins, bonus) { return coins - bonus; }
export function slots(items, extra) { return items - extra; }
export function heal(hp, potion) { return Math.min(100, hp - potion); }
// package.json: {"private":true,"scripts":{"test":"node --test *.test.mjs"}}
```

依頼：このフォルダだけで3つのバグを修正し、Exploreを1人だけ読み取り専用で使い、引き算を足し算へ直す。対応する3テストファイルへゼロ追加／100上限のテストを各1件追加し、npm testを1回実行。ネットワーク・コミット・他フォルダ・追加の仲間は禁止。短く日本語で報告。

```sh
node tools/demo/record.mjs 'http://127.0.0.1:8805/?token=TEMP_TOKEN' /tmp/events.jsonl
node tools/demo/record-pty.mjs 'http://127.0.0.1:8805/?token=TEMP_TOKEN' DEMO_SESSION_ID /tmp/terminal.jsonl
```

`record-pty.mjs` は出力だけを受け取り、入力・許可回答・CLIの過去履歴には触れない。`redact.mjs` でデモroot・利用者パス・メールを匿名化する。PTYチャンクを**全結合しても**元パス／メールが残らないことを確認し、保存前に本文も目視する。

許可は対象ごとに手で確認して回答する。Orcaネイティブtype / keypress / inserttextと `orca terminal send` は使わない。終了後はClaude・記録プロセス・自分のサーバーを止め、一時認証・データ・リポジトリを削除する。利用者データをコミットしない。
