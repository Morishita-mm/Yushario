# デモ素材の記録・再生・撮影（S8.7 PV v3 / S8.6 PV v2 / S8.5 PV / S8.1 v2）

開発用だけの道具。追加依存なし。npmパッケージには含めない。

## S8.7：あなたのエージェント・町の作り込み・魔王魂の音

完成物：`.art-work/s87/`。39秒、日英×16:9/1:1の音付き4本。
大きな「あなたのエージェントが」、5つの実すがた変更、実compactの祈り、実10分待機の居眠りを追加。
BGMは魔王魂ファンタジー11、剣・Lv・閃光・題字も魔王魂。動画の最後にクレジット。
**音源は無視対象`.art-work/s87/audio/maoudamashii-*`だけに置き、Git/npmに入れない。**

```sh
npm run build
node_modules/.bin/tsx tools/demo/pv3-verify.mjs .art-work/s87
node tools/demo/pv3-audio-study.mjs .art-work/s87
node tools/demo/pv3-film.mjs .art-work/s87
node tools/demo/pv3-mix.mjs .art-work/s87
node tools/demo/pv3-qa.mjs .art-work/s87
node tools/demo/pv3-sync.mjs .art-work/s87
swift tools/demo/pv3-boards.swift .art-work/s87
swift tools/demo/pv3-audio-board.swift .art-work/s87
```

- `pv3-film/stage/shots`：8868、一時home、専用Orcaページ。実描画30fps/1170フレーム。PTY・API書込みなしの記録再生。元順/prefix/結果はv2と同じ。終わったら自分のページ・relay・homeを削除。
- `pv3-mix`：180 BPM/四分=10フレーム、八分=5フレーム。付点四分の0.5秒が編集パルス。BGMの速度・音程は変更なし。音量編集・効果音の頭出し・2-pass loudnorm、完成AACを-14〜-16 LUFS/true peak≤-1dBTPで再検証。
- `pv3-audio-study`：音源3曲をPCMで波形/テンポ候補/音圧区間比較（学習・生成なし）。`maoudamashii-audition{06,11,13}.wav`は40秒の利用者向け聴き比べ。聴覚入力のない制作環境のため、最終聴感レビューは利用者にお願いする。
- `pv3-verify`：元パケット/実PreCompact〜PostCompact/633秒の実無操作/5すがた変更/実Lv3/仲間3人/本体Stop前の範囲/接触を純粋coreで検証。
- `pv3-sync/audio-board`：完成AACの4版同一ハッシュ・冒頭接触0.5秒・八分音符グリッドを検証し、完成MP4の全体/28–34秒の波形＋同期図を作る。
- `pv3-qa/boards`：完成音付きmp4から244枚を再抽出。全カット・接触前後・紹介中の全員・祈り/居眠り・引き・閃光・最後を目視。録画中の静止画だけでQAとはしない。
- 新規記録は`pv3-record/live/biomes/doze`。8867、`/tmp/agent-quest-s87-*`、一時認証（Claudeの`.credentials.json`のみ）、無害な会話1回とcompact。manual mode。入力は確認した自分のアプリPTYかDOM evalのみ。記録終了で全CLI/relay/home/認証/デモrepoを片付ける。通常は完成記録を使い、新しいCLIを起動しない。
- ライブ宿屋写真はcompact-list更新待ちの競合で得られなかったため、イベントが途切れず記録された633秒の無操作と純粋coreのdozingを証拠にし、実アプリの再生撮影で寝姿を確認。詳細は`report.md`。通常待機やcompactを宿屋に偽装しない。


## S8.6：30秒・120 BPMのゲームトレーラー型PV v2

確定脚本・絵コンテ・完成物・報告：`.art-work/s86/`。日英 × 16:9/1:1、4本、無音。
22カット、1拍15フレーム、全900フレーム。1920×1080 / 1080×1080、実描画も30fps。

```sh
npm run build
node_modules/.bin/tsx tools/demo/pv2-verify.mjs .art-work/s86
node tools/demo/pv2-film.mjs .art-work/s86
# 1版だけ、または動画なしの構図確認
node tools/demo/pv2-film.mjs .art-work/s86 pv2-ja-1x1 --stills-only
# 完成mp4から再抽出し、一覧・原寸の両方を目視する
node tools/demo/pv2-qa.mjs .art-work/s86
swift tools/demo/pv2-boards.swift .art-work/s86
```

- `pv2-film.mjs`：**8856**、ランダムトークン、`/tmp/agent-quest-pv2-*`の一時home、現在のworktreeのOrca内蔵ブラウザ専用ページ。既存`pv-stage.mjs`の読取専用bootを再利用。外部ブラウザ・CLIエージェント・PTY・API書込みは使わず、終了/例外時に自分のページ・relay・homeを片付ける。
- `pv2-shots.mjs`：確定22カット・拍境界・出典・元記録のprefixと保持/スローの時計。M#39の同じ一撃、P1#6→7の実結果、M#69の本当のLv3、C#27–32の本体＋仲間3人。
- `pv2-stage.mjs`：**1枚の実アプリcanvasを背景ごと切り抜く**カメラ。地図も実アプリの3勇者・1町。別比率の寄り、町のパン、背中→全景の引き、文字カード、題字の単発3フレーム閃光のみ。Lv通知は実DOMを撮った画素（翻訳/再入力なし）。名前・コピーは太く大きく一括表示する。
- 本体の接触は0.5 / 20.5 / 22.5秒、仲間の既存攻撃は21.5秒。C#26の同じ本体成功窓であり、成功3回/3連撃とは扱わない。C#33のStop直前1182msで実状態の範囲を終え、撃破・宝箱・勝利を出さず題字へ。
- `pv2-verify.mjs`：元パケット一致・純粋coreの3仲間/ドラゴン/Lv/実結果・実Stop境界・装備由来windupと接触拍を検証。`capture-source-check.json`に証拠を書く。
- `pv2-qa.mjs`：完成4本の30秒/900フレーム/30fps/音声なしをffprobe検査。全22カット＋接触の前/当たり/後＋引き/実pi結果/閃光/CTAを**176枚再抽出**。`pv2-boards.swift`は完成動画からの一覧12枚を作る。
- 納品は`pv2-*.mp4`、`stills/pv2-*/s01..s22.png`、`qa/pv2-*/`、`qa-boards-*`、`qa-action-*`、`pv2-*.proof.json`、`video-info.json`。従来の`frames/`・`boards-*`は撮影前のラフとして残す。
- 元イベントのID・source・project・ts・本文・成功/失敗・prefix内受信間隔は変えない。状態時計の原点と見せ尺、アニメーション時計だけ編集。実UI・Lv通知は英語版でも日本語。新しい成功・キャラ・武器・数値・端末・音は足さない。


## S8.5：パーティー入りPV（端末枠なし・Orca内蔵ブラウザ）

脚本・絵コンテ・完成物・報告：`.art-work/s85/`。24秒、日英 × 16:9/1:1、4本、無音。
前回v2の外部Chrome用の撮影道具はこのPVには使わない。**Orca内では`orca-cli`の現行ガイドを読み、内蔵ブラウザだけを使う。**

```sh
npm run build
node_modules/.bin/tsx tools/demo/pv-verify.mjs
node tools/demo/pv-film.mjs .art-work/s85
# 1版だけ、または動画なしの静止画確認
node tools/demo/pv-film.mjs .art-work/s85 pv-ja-1x1 --stills-only
# 必ず完成mp4から再抽出して目視する
node tools/demo/pv-qa.mjs .art-work/s85
swift .art-work/s85/render-boards.swift
```

- `pv-film.mjs`：**8846**、ランダムトークン、`/tmp/agent-quest-pv-*`の一時homeを自分で用意。ポート使用中なら中止。終了・例外時に自分のページ・サーバー・homeを片付ける。CLIエージェントは起動しない。外部ブラウザへフォールバックしない。
- `pv-shots.mjs`：承認済み24秒の8カットと出典。S1–S3はv3、S4/S6/S7は許可された旧M、S5は本物のpi。別テイクの編集は末尾に開示。
- `pv-stage.mjs`：Orcaで作った専用ページに実アプリのiframeを読み込み、記録済みパケットだけを渡す。PTY・API書込みを禁止。元イベントのID・source・project・ts・本文・成功/失敗を変更しない。prefix内の元受信間隔は保持し、報告の所要時間も本物のまま。
- 描画は実アプリのcanvas＋編集字幕。既存のアニメーション時計と結果の提示間隔だけを選ぶ。新しいキャラクター・ダメージ・Lvを作らない。S7は実DOMのOrcaスクリーンショット。**`#movie-terminal`も端末の差し込みも使わない。**
- ドットは元の1ピクセルの整数倍。1:1の町は別の寄り、戦闘は4人と敵を残す。`title.png`は既存の4倍PNGを4倍/6倍の元ドットとして表示。
- 10fpsで実キャンバスを取得し、H.264/yuv420p・30fpsへ格納。音声なし。`stills/pv-*/`は撮影写真、`qa/pv-*/`は**完成mp4の再抽出**。`pv-*.proof.json`、`recording-proof.json`、`video-info.json`が根拠。
- `pv-verify.mjs`：元順を純粋coreへ渡し、同時仲間3人、旧M#69のLv3、6ファイルの宝箱、piの実テスト、7回の手動許可、結合後PTYの匿名化を確認。

### v3の本物の記録

`recordings-v3/main.jsonl`はClaude Code 2.1.296、legend/Opus 5.5、Explore3人の並列調査→6編集→npm test1回・6ケース成功。仲間は読み取り専用。maxHelpers=3、最終wins=37/Lv4（仲間の読取成功もcoreが数える）。`pi-1.jsonl`はREADME読取と別のnpm test1回・6ケース成功、`pi-2.jsonl`はREADME読取だけ。全員同じ実`tiny-quest`で、piは既定のまま装備を変えていない。

取得した時の手順：

1. 明示的な記録許可の範囲で**8845**と`/tmp/agent-quest-demo.*`を使う。小さなgitデモフォルダ、Node標準テスト、一時`AGENT_CHARACTER_HOME`と一時`CLAUDE_CONFIG_DIR`を作る。Claudeからコピーするのは認証`.credentials.json`だけ。利用者のsettings・履歴をコピー／変更しない。
2. 下のv2の3関数のデモを用意し、アプリAPIでClaudeをlegend、piを無装備で起動。Claudeの初期テーマ・対象フォルダの信頼を手で確認し、**manual mode**へ切り替える。auto modeにしない。
3. `record.mjs`で状態WS、`record-pty.mjs`で新しいデモPTYの出力だけを記録。Claudeには読むだけのExplore3人を並列に使って各関数を調査し、本体が3バグと境界テスト3件を直し、npm testを1回実行する依頼。piにはREADME読取、修正完了後に無害なnpm test1回と短い報告。デモの外・ネットワーク・依存追加・コミット禁止。
4. 許可は**対象ごとに出力を読み、手で回答**する。Orcaのnative type/keypress/inserttextと`orca terminal send`は使わない。必要な入力は`orca eval`内のDOM/KeyboardEventまたは、対象IDを確認したアプリのデモPTY WSのみ。
5. 保存前にPTYを全結合し、`redact.mjs`をもう一度適用する（チャンク境界をまたぐパス・メール対策）。v3のPTYは匿名化後の1チャンクであり、映像には使わない。`manifest.json`は実API応答、`demo-files.json`は機密なしのデモコード、`startup.txt`はトークンを伏せた起動記録。
6. 全CLIをfarewellで終了し、セッション一覧が空になったことを確認。記録プロセス・自分のサーバーを止め、認証コピー・一時home・デモフォルダを削除。8790・`~/.config/agent-character`・pi/Codexの設定は使わない。

以下は旧S8.1/v2の資料。外部Chrome使用の許可は旧タスクだけのもので、通常のOrca内操作に適用しない。

## 完成動画と撮り直し

絵コンテ：`.art-work/s8/demo2/storyboard.md`。完成物・目視QA・変更点：`.art-work/s8/demo2/report.md`。

- デモ：`demo-{ja,en}-16x9.mp4`、80秒、1920×1080。
- プロモ：`promo-{ja,en}-{16x9,1x1}.mp4`、18秒、1920×1080 / 1080×1080。
- 日本語と英語は別ファイル。1:1は別構図。無音、H.264 / yuv420p、10fpsで撮影して30fpsで格納。
- `stills/<variant>/` はシーン写真。`qa/<variant>/` は**完成mp4から再抽出**した目視確認用フレーム。許可・「はい」フォーカス・同じEditの一撃はデモ40.5 / 43.6 / 44.5秒、プロモ11.5 / 12.8 / 13.4秒（全言語・比率）。
- `<variant>.proof.json` は画面のLv・許可要約・報告、元JSONL行、端末抜粋の元PTY行／テキスト行を記録。

```sh
npm run build
# 全6本。既に起動している専用ヘッドレスChromeのCDP 9333が必要。
node tools/demo/film.mjs .art-work/s8/demo2
# 1本だけ、または動画を作らずシーン写真のレイアウト確認。
node tools/demo/film.mjs .art-work/s8/demo2 promo-en-1x1
node tools/demo/film.mjs .art-work/s8/demo2 demo-ja-16x9 --stills-only
# 完成6本をffprobe検査し、許可→はい→一撃を含む各16枚 / 10枚をmp4から再抽出して目視する。
node tools/demo/extract-qa.mjs .art-work/s8/demo2
```

**外部Chromeの使用を明示的に指示されたS8.1-F / S8.1-R用。** 通常のOrca内のページ確認はorca-cliスキルに従う。この道具はブラウザを起動せず、既存の `127.0.0.1:9333` に自分専用Targetだけを作り、正常終了／例外時に閉じる。CDPがなければ失敗し、他のブラウザへ切り替えない。

`film.mjs` は8805のサーバー、ランダムな一時トークン、`/tmp/agent-quest-film-*` の `AGENT_CHARACTER_HOME` を用意する。8805が使用中なら中止する。終了時に自分のサーバーを止め、一時homeを消す。8790・利用者データ・設定・認証には触れない。

### 撮影の仕組みと限界

- `shots.mjs`：承認済みの固定編集点。デモはmainの元行を**0〜77の順序のまま**使う。両Stop・Exploreの内部完了通知を残し、SessionEndだけ省く。プロモは本物の記録のprefixをシーンごとに再生するモンタージュ。
- `capture.mjs`：専用Target内でアプリのWSメッセージ受信口へ記録済みevent/replay/permissionパケットを渡す。サーバーのPTY・`/event`・`/hooks/permission`は撮影に使わない。入力送信・PTY接続・API書き込みを止め、記録済みの手動回答だけ画面上で再生する。コマンドは実行しない。
- `stage.mjs`：専用Target内のCSS・撮影時計・DOM操作だけ。アプリ/coreは変更しない。`GET /api/sessions` は記録済み装備メタデータ、設定の初期フォルダは匿名化済みのデモフォルダにする。しゅつじんの起動ボタン、会話の送信ボタンは押さない。
- `terminal-excerpts.mjs`：既存xtermで**本物のmain-pty.jsonl**をANSI解釈し、該当行を抜粋する。最終テスト・報告は実端末を展開して保存した `main-terminal.txt`。ANSI色は除き、折り返し・長い区切り線の横方向クロップだけ行う。コード・結果・本文を作り直さない。
- 端末は読みやすい別枠に常時表示するデモと、短い挿入のプロモ。リアルタイムのPTYではなく、タイトルに「記録時の出力」と明記した元記録の抜粋。端末バッファ内の先行表示／一括ツール待機は元のまま。
- 時計と間隔を編集するだけで、ID・装備・結果・Lv式は変えない。デモは町1倍／戦闘2倍。プロモは町2倍（16:9）／3倍の寄り（1:1）、戦闘4倍でゲームが画面を埋める。下の開発用の勇者／Lv札は除く。切れる戦闘HUDと台詞は**同じ実キャンバスの画素**を3倍／2倍で安全な位置へ転写する（台詞の1:1外縁17pxだけクロップ）。数字・本文を描き直さない。レベルアップは実UIが生成した最後の通知行を表示する。
- S8.1-Rは修正済みcoreで、**許可後の実PostToolUseがEdit / Testのactivityと結果へ戻る**。デモ44秒のM#39とプロモ2秒 / 12.9秒のM#39は同じquest.mjs成功→Slimeのかいしん。デモの残り5編集とM#75のnpm test成功→Golemも戦闘に戻る。架空のイベントや結果は足さない。
- `shotMotion()` は編集時計とは別に既存の攻撃拍を選ぶ。実成功後2秒以内の結果表示に合わせ、カットの白い遷移が終わってから剣が当たる。かいしん判定・ダメージ・Lv・モンスターは既存アプリの計算だけ。許可への回答は本物のpermission-resolvedに合わせた「はい」のDOMクリックで、直前にそのボタンへフォーカスする。プロモの端末挿入は3.0–3.5秒（同じEdit差分）、5.6–6.1秒（Explore）、12.0–12.5秒（同じEdit確認）。
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

## S8.8 — PV v4（無音・連続歩行・実宝箱）

49.5秒 / 30fps / 1485frame、日英 × 16:9・1:1。音を付ける前の映像だけを作る。既存の `recordings-v2/`・`recordings-v3/` と `.art-work/s87/recordings/` が必要。新しいエージェントやPTYは起動しない。

```sh
npm run build
node tools/demo/pv4-film.mjs .art-work/s88/video
node_modules/.bin/tsx tools/demo/pv4-verify.mjs .art-work/s88/video
node tools/demo/pv4-qa.mjs .art-work/s88/video
swift tools/demo/pv4-boards.swift .art-work/s88/video
```

- 現在worktreeのOrca内蔵ブラウザだけ。専用 **8878**、`/tmp/agent-quest-pv4-*` の一時homeを使い、終了/失敗時に専用ページ・relay・homeを閉じる。外部ブラウザ、ネイティブ入力、`orca terminal send`、他ワーカーは使わない。
- `pv4-shots.mjs`：編集点と `cues.json`。秒はMP4の0起点PTS、終了はexclusive、30fpsの整数frame。BGM/SEは入れず、音声streamも作らない。
- `pv4-stage.mjs`：v3カメラを拡張。5バイオームは**1つの連続した自然歩行**、実「町のすがたを かえる」→テーマ選択→一時homeへのPATCH。共有の道/Walkerを変えず、切替前後の勇者座標を比較して飛んだら停止。6frameのクロスフェードは同時刻/同じ勇者座標の旧/新背景を使う。撮影だけの固定乱数で自然な巡回先を再現し、勇者の位置/道を手で上書きしない。
- 宝箱はv2/main#76の実Stop報告。23.5–25.5秒は未読の宝箱badge、**25.5秒に実map badgeをDOM MouseEventで押して**会話と報告を開く。実「まとめて表示」を押し、実DOMをCSSで拡大してnative screenshotの実画素を25.5–31.5秒保持（native撮影で左上1/4に縮む場合は、実描画範囲を測って余白だけを除去）。ファイル6つ・テスト○1×0（成功実行1回）・返事先頭（6ケースpass）を改変しない。架空の閉じた宝箱/開閉アニメは作らない。
- アプリ本体は変更不要。町の道は全themeで共通、theme chooserはWalkerを再生成しない。v3撮影では各biomeでreplay/navigationをやり直し、motion時計を前カット末尾から約1467ms巻き戻していた。実アプリの `performance.now()` は単調増加なので、v4は撮影の時計とカットを直す。
- `pv4-qa.mjs`：完成MP4を整数frameでselectして静止画を抜き、無音・尺・解像度・frame数と実報告窓の右端白枠を検証（native screenshotの縮み/余白も検出）。`pv4-boards.swift` はその完成静止画から4版の全カット・切替前後・報告・接触の一覧を作る。
- 成果物は `.art-work/s88/video/` のみ。S8.8-Aの音設計や利用者の8790/既定homeには触れない。静止画専用の `--stills-only` は構図の試写用で、連続性の受け入れ検証には必ず完成4本を使う。
