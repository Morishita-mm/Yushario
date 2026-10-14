# Architecture (PoC)

CLI エージェントの仕事を **RPG 風の町と勇者** として見せ、埋め込みターミナルの勇者に依頼し、会話と報告を受け取るローカル Web アプリ。
ハーネスは作らない。Claude Code / pi / Codex / shell をそのまま PTY で動かし、対応するフック・拡張から届く状態イベントを町の表示に使う。

Node の1プロセスが `127.0.0.1` で build 済みの web と API・WebSocket を配信する。`yushario` の bin はビルド済み `lib/server/relay.js` を起動し、実行時に tsx・Vite は使わない。既存 Vite の SSR ビルドで server と pi 拡張の Node ESM を `lib/` に出し、web・絵は `dist/` に入れる。Vite のサーバーと tsx は開発時だけ使う。
状態の読み取りは `docs/OBSERVATION.md`（段階5対応）、勇者の操作と現在の対応範囲は `docs/PLATFORM.md` の最新段階、絵は `docs/ART.md` が正。過去段階の制限を現在の仕様として扱わない。

## データフロー

```text
[CLI エージェント] ◀── PTY 入出力 ──▶ [server] ◀── WS /pty ──▶ [web / xterm]
        │                               ▲                       │
        └─ [adapters / フック・拡張]      │                       │
                  │                     │                       │
                  └─ POST /event ──▶ 検証・イベント履歴 ── WS /ws ──▶ Room
                                        │                       │
                                        ├─ 待機判定・依頼の預かり  └─ core の計算 ──▶ 町・会話・報告
                                        └─ 台帳の活動更新

[Claude の許可フック] ── POST /hooks/permission ──▶ [server] ◀── WS /ws ──▶ [web]
[web] ── /api/agents・sessions・roster・names・towns・settings ──▶ [server]
```

- server はイベントを検証し、`event` と接続時の `replay` を配信する。活動・様子・語り・報告・勇者の居場所は core の決定的な処理で求める。
- web は replay とライブイベントから Room を組み立て、町と会話を更新する。サーバーの端末状態・台帳・名前は API と WS の通知から受け取る。
- 依頼は対応する PTY へ送る。作業中はサーバーで預かり、準備ができた時に送る。許可要求は利用者の判断をフックへ返し、自動承認しない。
- エージェントの応答を作るのは各 CLI。アプリ自身は LLM や外部の判断 API を呼ばない。

## モジュール境界

| モジュール | 責務 | 依存してよいもの |
|---|---|---|
| `src/core/events.ts` | `AgentEvent` 型と入力の検証 | なし |
| `src/core/activity.ts` | フック・ツール名・対象から活動を分類 | events |
| `src/core/room.ts` | 勇者・仲間・クエスト・行動ログ・会話の状態と、直近の流れから様子を計算 | events, activity, turns |
| `src/core/turns.ts` | 進行中の往復の累計、最後のテスト結果と異常終了、直近256イベント内の遅着補正、許可待ちを除いた所要時間、報告の付与 | events, activity |
| `src/core/event-history.ts` | 2000件の履歴から、勇者ごとの件数と保護するイベントに基づいて捨てる順を決める | events |
| `src/core/local-request.ts` | 実際の待受ポートに対する Host の判定 | なし |
| `src/core/story.ts` | 語り、Lv・HP・MP、仲間の職業、活動ごとのモンスター | events, activity, room |
| `src/core/town.ts` | Room をプロジェクト別の町・安定した表示名・勇者の居場所へ変換 | room, story |
| `src/core/town-ledger.ts` | 町・設定の型、町の登録・活動更新・自動でしまう判定 | なし |
| `src/core/names.ts`, `roster.ts` | 名前・めいぼの型と入力の判定、件数制限 | core の型・関数のみ |
| `src/core/session-actions.ts` | イベントによる待機判定、フォルダ信頼確認の検出 | events |
| `src/server/relay.ts` | HTTP/WS の入口、認可、イベント履歴と配信、許可・PTY・台帳の接続 | core, server, Node http, ws |
| `src/server/agents.ts` | 起動・再開・整理・終了の送り方と対応範囲を1つの表に定義、PATH の CLI 検出 | Node fs/path/url |
| `src/server/startup.ts` | 起動引数、空きポートへの bind、ブラウザを開く | Node http/child_process |
| `src/server/pty.ts`, `pty-session.ts` | 複数の端末セッション、セッション API、WS /pty と保持出力 | core, server, Node, node-pty, ws |
| `src/server/pty-launch.ts`, `pty-process.ts` | CLI の起動、フック設定、環境変数、子プロセスの終了 | agents, core, Node, node-pty |
| `src/server/pty-actions.ts` | 依頼の送信・預かり、にげる・やすむ・みおくる | core, agents, pty-session |
| `src/server/permissions.ts` | 許可要求の短い要約、利用者の回答・時間切れをフックへ返す | events |
| `src/server/project.ts`, `town-api.ts`, `town-data.ts` | プロジェクト名の取得、町・設定・名前・めいぼの API と JSON 保存 | core, agents, Node |
| `src/server/static.ts` | `dist/` と `public/` の静的配信、パスの検査 | Node |
| `src/server/http-body.ts` | HTTP JSON 本文のバイト上限と400／413の応答 | Node http |
| `src/web/rpg/*` | メインの町。Room と WS、移動・つよさ・許可・会話と報告・しゅつじん・コマンド・めいぼ・ヘルプ | core, web/town, terminal |
| `src/web/town/*` | データを引数で受け取る共有描画。ワールド・5種の町・宿屋・フィールド・戦闘、絵の読み込みと歩行 | core の型, DOM/Canvas, public/art |
| `src/web/art/*` | `/art.html` のギャラリー、`/mock.html` の入口・偽データ | web/town, DOM/Canvas |
| `src/web/terminal.ts`, `terminal-page.ts`, `style.css` | xterm の接続部品、`/terminal.html` の起動・接続・終了。町の端末窓も同じ接続部品を使う | xterm, DOM, HTTP/WS |
| `adapters/claude-code/*`, `adapters/pi/*` | ハーネスのフック・拡張をイベントに変換し、ローカルへ短時間で送る | ハーネス API, Node |

`src/core` は DOM・Node API・HTTP・WS に依存しない純粋 TypeScript。
時刻は引数で受け取り、活動・待機・集計・様子・居場所などの判断を単体テストする。
Room のようなイベントから状態を更新する処理もここに置くが、I/O や画面の状態は持たせない。

## インタフェース（今ある境界だけ）

### adapters → server: AgentEvent

`src/core/events.ts` の `AgentEvent` と `parseAgentEvent(input)` が契約。

- `state`: `idle | thinking | working | waiting_input | success | error`
- 状態のメタデータ: `detail?`, `ts?`, `source?`, `tool?`, `context?`（使用率 0〜1）。文字列は `text` 以外、入れ子のID・説明も含め最大200文字で切る
- 勇者と仕事: `agent?`, `name?`, `terminal?`, `project?`, `hook?`, `target?`, `subagent?`, `task?`
- 会話: `text?`（依頼・最終返答、最大8000文字）

アダプタは活動や物語を判断せず、安全な対象の短縮とイベントへの変換だけを行う。
Notification は実際の入力要求だけ waiting_input。pi の整理失敗・キャンセルは PostCompact/idle の detail（`Compaction failed` / `Compaction cancelled`）で成功と区別し、待機へ戻るが MP 回復とは語らない。
同じ PTY の SessionStart で ID が変わった時は、server が旧 ID の SessionEnd を **terminal 無し**で記録する。PTY は継続し、新 ID の依頼済み判定はリセットする。同じ ID の reload は退場ではない。
会話本文・対象・許可の要約はローカル表示だけで使う。ツール出力・途中の返答は送らない。

### core → server / web: 値と決定的な計算

新しい抽象インタフェースを挟まず、既存の型・関数を直接使う。

- `classifyActivity(event)`、`waitingAfterEvent(event)`、`hasTrustPrompt(output)` で入力を判定する。
- `Room.apply(event, at)` がイベントから `RoomAgent` を更新し、`moods(agent, now)` が様子を求める。
- `recordTurn(turns, event, at)` 等が会話と報告を集計する。
- `stats(agent, now)`、`narrate(event)`、`battleMonster(activity)` が RPG の見せ方を求める。
- `townView(room, now, previousNames)` が町・勇者と安定した表示名を返す。
- `registerTown` / `activateTown` / `archiveTowns` は入力の町一覧と時刻から新しい一覧を返す。

### server ↔ web: ローカル HTTP / WebSocket

詳細な入力・返却値は `docs/PLATFORM.md` と各経路の実装に記載する。

| 経路 | 契約 |
|---|---|
| `POST /event` | AgentEvent を検証して受付。正常時204、不正入力400 |
| `WS /ws` | `event` / `replay`、`towns`、`names`、`pending`、`equipped`、`attention`、`permission` / `permission-resolved`。web からは `permission-decision` |
| `/api/agents` | 起動時に PATH で検出した種類（shell は常に含む）と町・再開・整理・途中のそうび変更の対応範囲の公開部分 |
| `/api/equipment` | エージェントごとの武器（モデル）・アクセサリ（考える量）の読み込み済みマスタ |
| `/api/sessions` | 装備つき端末の一覧・作成・削除、`/:id/say` で依頼（`steer` で作業中にもすぐ伝える。答え待ちの間は断る）、`/:id/action` で中断・整理・終了、`/:id/equip` で装備の持ちかえ（作業中は預かる） |
| `WS /pty?session=<id>` | 同じ端末の保持出力とライブ出力。web からは `input` / `resize` |
| `/api/roster` | 旅立った勇者の一覧と `/:sessionId/recall` で再開 |
| `/api/names`, `/api/towns`, `/api/settings` | 名前、町の台帳・すがた、町をしまうまでの日数 |
| `POST /hooks/permission` | Claude Code の HTTP フック。許可・拒否を返すか、時間切れ等は通常の端末プロンプトに戻す |

### web 内: 描画データと端末の接続

町とモックは `src/web/town/*` の同じ描画関数にデータを渡す。モック用の偽データは `src/web/art/*` に閉じる。
町の端末窓と `/terminal.html` は `src/web/terminal.ts` の接続部品を共有する。
画面専用の選択・開閉・下書きは各画面の中に置き、汎用ストアやイベントバスは作らない。

## 寿命・保存・セキュリティ

- server は `127.0.0.1` のみ。起動ごとにランダムなトークンを作り、URL に表示する。token ファイルは読まず・書かず、残っていても使わない。開発時だけ明示的な `AGENT_CHARACTER_TOKEN` 指定を許す。ブラウザを自動で開く（`--no-open` で無効）。既定8790／`--port`／`PORT` から、使用中なら次の空きポートを実際に bind して使う。
- npm パッケージの allowlist は `dist/`・`lib/`・Claudeフック・bin・`LICENSE`・`NOTICE`。ライセンスと通知はブラウザ配布用の `dist/` にもコピーする。アダプタはパッケージの絶対パスから読み込み、ソース・テスト・作業用ファイル・利用者データを同梱しない。
- HTTP・WS Upgrade の入口で Host を `127.0.0.1:<実ポート>`／`localhost:<実ポート>` に限定する。Vite proxy は Host を転送先へ変更する。WS `/ws`・`/pty` と `/api/*` はトークンと自分自身の Origin を検査する。WS は Origin 必須、HTTP API の Origin 無しリクエストはトークンで許可する。開発時だけローカルの別ポートも許可する。
- フックの `POST /event`・`/hooks/permission` はトークン不要。ブラウザ由来の外部 Origin は拒否する。本文の上限は1MiB、端末作成・町の設定は4KiB、端末操作は64KiB（UTF-8バイト、超過は413）。Claude の command フック stdin も1MiBで、超過時は無言で正常終了する。
- PTY はブラウザ切断では止めない。明示的な終了・CLI の終了・server の停止で終わる。最大16セッション、各出力の直近256KBを保持する。
- 起動時に検査した CLI の絶対パスを保持し、別の作業ディレクトリでも同じパスを起動する。子プロセスに `AGENT_CHARACTER_URL`・`AGENT_CHARACTER_SESSION`・`AGENT_CHARACTER_PROJECT` を渡す。Claude フックは渡された project を使い、外部起動でその値が無い時だけ git から調べる。transcript_path が無い Stop は再試行しない。server のトークンや親の入れ子セッション判定用変数は渡さない。
- イベント全体2000件・会話・報告・預かり・端末出力はメモリのみ。履歴があふれた時は、最も多く持つ勇者の古いイベントから捨てる。活動中の勇者の最初のイベントと最後の本体の UserPromptSubmit は保護し、SessionEnd 済みの勇者は保護しない。サーバーを再起動すると消える。往復は進行中だけ累積し、遅着補正用のイベントは直近256件まで（それ以前への遅着は集計しない）。ファイル名は往復ごと最大256件、ツール・テスト・失敗の累計は切り捨てない。完了した札は通常の新イベントで数え直さず、直近範囲への遅着時だけ補正する。
- 町・設定・名前・再開用のめいぼは `AGENT_CHARACTER_HOME`（既定 `~/.config/agent-character`）の JSON に保存する。町の最終活動時刻はメモリで更新し5秒おきと終了時にまとめて保存、時刻だけの変更では台帳を配信しない。登録・すがた・ピン・しまう／戻すはすぐ保存・配信する。本文は保存せず、一時ファイルから置き換える。壊れたファイルは `.broken` に退避する。
- 許可は id ごとに最大16件、独立した120秒の期限で待つ。再接続では全件を再送し、画面がすべて切断したら全件を端末判断へ戻す。コマンド／パスの表示は待っている間だけ2000文字まで保持し、超過時は画面での許可を禁止する。履歴・ログには短い要約だけを渡す。
- 既読は勇者IDと時刻だけをブラウザに保存する。会話の下書きはページ内だけ。各 CLI 自身の履歴保存は別。

## PoC でやらないこと

- ハーネス本体、アプリ自身の LLM 呼び出し、ツール出力・会話本文の解析
- デスクトップ常駐・透過ウィンドウ、スマホ対応、インターネット経由の利用、ユーザー認証
- 任意の起動コマンド、許可の自動承認、作業中へのフック経由の割り込み
- 会話・報告・行動ログの永続化、過去のハーネス履歴の取り込み、ワークツリーの作成
- プラグイン機構・ファクトリ・DI コンテナ・汎用基底クラスなど、現在の境界にない拡張の基盤
