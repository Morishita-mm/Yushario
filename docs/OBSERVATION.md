# 観察の仕様（柱C：チームが部屋にいる → エージェントの町）

複数の Claude Code・pi・Codex エージェントを、RPG 風の町とフィールドにいるドットキャラクター（勇者）として表示する。
作業はモンスターとの戦い、完了後は町でひとやすみ、会話の整理は教会、居眠りは宿屋、サブエージェントは勇者パーティーの仲間、という **物語** として見せる。
売りは **エージェントの様子を細かく描写すること**。「作業中」の一言で済ませず、
**何を・どう・どれくらい** やっているかを、視界の端でも読み取れる形で見せる。

現在の対象は **Claude Code・pi・Codex 0.162.1**。shell はターミナルのみ（勇者は出ない）。Codex の制限は下記「Codex」の表、操作と対応範囲の最新仕様は `docs/PLATFORM.md` の最新段階、現在の構成は `docs/ARCHITECTURE.md` を参照。

## 方針の選択肢

| 案 | 内容 | 状態 |
|---|---|---|
| A. Live2D を続ける（廃止） | 1体に集中して、柱A/B（気配・呼ばれたら向き合う）を深める | 段階5で削除 |
| **B. ドットの部屋** | 複数エージェントをドットキャラで1部屋に表示する | **採用** |
| C. 両方（ハイブリッド）（廃止） | 部屋の全体はドット、1体を Live2D で大きく表示する | 段階5で廃止 |

AgentEvent から core で活動・様子・居場所を計算し、ドットの町を描画する。Decider / Renderer は廃止。

## 似たツールとの違い

[Pixel Agents](https://github.com/pablodelucca/pixel-agents) は、Claude Code のターミナルごとにキャラが出て、
オフィスを歩き、机で作業し、入力待ちは吹き出しで示す。本アプリはこれに対して、次の4点で差をつける。

1. **活動の細かさ**: 読む・探す・直す・テスト・調べもの・計画・手分けを区別し、部屋の **場所** で表す。
2. **時間の流れから出る様子**: 長い待ち、失敗の連続、立ち直り、テンポ、疲れを、1つのイベントではなく直近の流れから出す。
3. **計画の見える化**: タスク（TaskCreate / TaskUpdate）の内容と進み具合をホワイトボードに出す。
4. **フックで出勤**: エージェントはアプリの中で起動しなくてよい。自分のターミナルや IDE のワークツリーで動かしている Claude Code が、フック経由で部屋に入ってくる。

## 観察の3層

| 層 | 問い | 見え方 | 読む距離 |
|---|---|---|---|
| 活動 | 何をしているか | 居場所と動作（本棚で本をめくる、机でタイピング…） | 視界の端 |
| 様子 | どうやっているか | 表情アイコン・動きの速さ・頭上の記号（💦 ⏳ 💤 ❗） | ちらっと見る |
| 詳細 | どれくらい・何について | 手元の紙のファイル名、ホワイトボードの TODO、クリックで最近の行動 | 目を向ける |

## 入力：Claude Code のフック

Claude Code 2.1.295 の実行ファイルで、以下のイベント名と入力フィールドがあることを確認した。
全イベントに共通して `session_id`、`transcript_path`、`cwd`、`hook_event_name` が入る。

| フック | 使う情報 | 用途 |
|---|---|---|
| SessionStart | `source`（startup / resume / clear / compact） | 出勤（clear / compact のときは同じキャラのまま） |
| SessionEnd | `reason` | 退勤 |
| UserPromptSubmit | `prompt`（ローカル会話用、最大8000文字） | 依頼を受けた → 考え始める |
| PreToolUse | `tool_name`、`tool_input`（下の「対象」の範囲のみ） | 活動の開始 |
| PostToolUse | `tool_name`、成否 | 活動の終了・成功 |
| PostToolUseFailure | `tool_name`、`is_interrupt` | 活動の失敗（中断は失敗に数えない） |
| PermissionRequest | `tool_name`、`agent_id` | 許可待ち（柱Bの許可要求と同じ HTTP フック） |
| TaskCreated / TaskCompleted | `task_id`、`task_subject` | ホワイトボード |
| Notification | `notification_type` | permission_prompt / elicitation_dialog だけ呼び出し。idle_prompt / auth_success 等は待機 |
| SubagentStart / SubagentStop | `agent_id`、`agent_type` | 助っ人の入退室 |
| PreCompact / PostCompact | `trigger` | 整理中（休憩） |
| Stop / StopFailure | `last_assistant_message`（Stop のみ、最大8000文字）、`error_type` | 手が空いた / 異常終了 |

コンテキスト使用率は、今と同じく transcript の末尾から読む（`context`、0〜1）。

pi は拡張で同じ AgentEvent に変換する。session_start / before_agent_start / tool_call / tool_result / agent_settled が開始・依頼・ツール・完了の境界。作業中に入力した指示（`input` の `streamingBehavior: "steer"`）も依頼（UserPromptSubmit）として送る。最終成否は agent_before_settle とキャンセル信号で判定する。中断が完了した agent_settled は InterruptConfirmed/idle を送り、停止要求の Interrupt と区別する（中断は失敗に数えない）。UI 入力の開始だけ waiting_input、終了は作業中なら thinking、待機中なら idle。整理失敗・キャンセルは PostCompact/idle の detail で成功と区別する。
`/new`・再開・fork で SessionStart の ID が変わった時は旧勇者だけ退場し、端末は継続する。reload は同じ勇者のまま。PTY 終了時も必ず退場する。

## Codex（段階20）

公式 [hooks](https://developers.openai.com/codex/hooks) と [0.162.1 の入力スキーマ](https://github.com/openai/codex/tree/rust-v0.162.1/codex-rs/hooks/schema/generated) を使う。`-c hooks.<Event>=[...]` と `features.hooks=true` を起動に付け、`--no-daemon` で端末専用の環境を保つ。Yushario は `~/.codex` を書き換えず、信頼の迂回もしない。Codex の `/hooks` で利用者がフックを確かめ、最初の依頼をターミナルから送る。管理者がユーザーフックを禁止している環境では観察できない。

| 公式フック | 変換・観察の範囲 |
|---|---|
| SessionStart / SessionEnd | 到着／退場。compact 後の SessionStart は往復を消さないため無視 |
| UserPromptSubmit / Stop | 依頼／最後の返事（最大8000文字）、クエストと報告 |
| PreToolUse / PostToolUse | 道具の開始／終了、Bash の安全な先頭3語。終了は「成否は ふめい」 |
| PermissionRequest | 判断待ち。アダプタは `{}` を返し、許可は元のターミナルで答える |
| Interrupt | Codex が知らせた中断の確認（画面の停止要求とは別） |
| PreCompact / PostCompact | manual だけ整理の開始／完了。auto は作業中なので待機へ戻さない |

`tool_response` は任意の JSON で、公式の unified-exec 例は標準出力の文字列だけ。終了コードの契約がないため、本文の成否や画面の文字を解析しない。成功・失敗、編集成功のファイル一覧、ためすことの証拠、MP は取れない。PostToolUse だけで成功数・合格印・勝利の語りを付けない。条件の追加・鑑定・会話・パーティーの受け手・再開（UUID）・`/compact` は共通の入口を使う。`apply_patch` は対象の本文を送らず汎用の道具として表示する。Hosted WebSearch などは公式のツールフック対象外。`notify` は往復の完了だけなので併用しない（返事の二重表示を防ぐ）。

変換は純粋な `src/core/codex.ts`、入出力は `adapters/codex/hook.ts`。stdin は1MiB、送信は端末専用 Bearer 付きの `/event`、700ms以内に終える。出力・transcript は読まず、通信失敗や不正入力で Codex の仕事を止めない。

## キャラクターの識別

- **1セッション = 1キャラ**。`session_id` をキーにする。
- 表示名は `cwd` の末尾（例：`project-feature`）。ワークツリーごとに自然に区別できる。
- 色・見た目のバリエーションは `session_id` から決定的に選ぶ（再読み込みしても同じ見た目）。
- サブエージェントは `agent_id` をキーにした **小さな助っ人** として、親キャラのそばに出す。
  親のキャラは「手分け中」として、助っ人の様子を見守る。
- server の起動より前から動いているセッションは、最初のイベントが届いた時点で部屋に入れる。

## 活動の分類

ツール名と入力から、活動を1つに決める。判定は `src/core` の純粋な関数にしてテストする。

| 活動 | 判定 | 部屋の場所・動作 | 対象（手元の表示） |
|---|---|---|---|
| `think` | UserPromptSubmit の後、最初のツールが来るまで | たき火の前で考え込む（…の吹き出し） | — |
| `read` | Read、NotebookRead | 図書館の前で本を開く | ファイル名 |
| `search` | Grep、Glob、LS 系 | 図書館の前で本と周りを見比べる | 検索パターンは出さない |
| `edit` | Edit、Write、NotebookEdit | フィールドでスライムに斬りかかる（ファイル名のスライム） | ファイル名 |
| `test` | Bash でコマンドの先頭がテスト・検証系（`npm test`、`npm run typecheck`、`vitest`、`jest`、`pytest`、`go test`、`cargo test`、`tsc`、`eslint` など） | フィールドで「しれんのゴーレム」と対峙し、結果を待つ | コマンドの先頭 |
| `git` | Bash で先頭が `git` / `gh` | 「ぼうけんのしょ」（セーブクリスタル）に祈って記録する | コマンドの先頭（`git commit -m` など） |
| `run` | 上以外の Bash | フィールドでおばけに呪文を唱える | コマンドの先頭 |
| `web` | WebSearch、WebFetch | 物見の塔の上から遠くを見る | ドメインのみ |
| `plan` | TaskCreate / TaskUpdate / TaskList / TaskGet（旧 TodoWrite も） | クエストボードに依頼書を貼る | タスクの一覧（ボードの依頼書） |
| `delegate` | Task / Agent（サブエージェント起動） | パーティーでドラゴンに挑む | `agent_type` |
| `ask` | AskUserQuestion、PermissionRequest、waiting_input の Notification のみ | 画面の手前（あなたの前）に来て手を振る（！の吹き出し） | ツール名 |
| `tool` | MCP ツール（`mcp__*`）など上以外 | 道具屋の前に立つ | サーバー名（`mcp__<server>__` の部分） |
| `rest` | PreCompact 〜 PostCompact | 教会で会話を整理する（成功時だけ MP 回復の語り） | — |
| `idle` | Stop / StopFailure / InterruptConfirmed の後、入力不要の通知 | 町でひとやすみ（居眠り時は宿屋）。通知だけでは停止確認にならない | — |

`Interrupt` は停止の要求だけ。確認待ちの間は次の依頼・装備・操作を受けず、本体の新しい SessionStart・Stop・StopFailure・PostCompact・SessionEnd・InterruptConfirmed で確認する。経過時間・古い知らせ・仲間やツールの終了・idle 通知だけでは確認しない。端末は直接操作でき、30秒後も未確認なら「まだ とまったか わからない」と出す。

分類に迷うものは `tool` にまとめる。種類を増やすのは、実際に使って見分けたくなってからにする。

## 様子：時間の流れから出すもの

1つのイベントではなく、キャラごとの **直近の流れ** から計算する（`src/core`、テスト対象）。
しきい値は初期値。実際に使って調整する。

| 様子 | 条件（初期値） | 描写 |
|---|---|---|
| 長い待ち | 同じ活動が 30 秒以上続く（特に `test` / `run`） | ⏳ の吹き出し |
| 苦戦 | 直近 5 分で失敗が 3 回以上 | 汗の吹き出し、HP が減る |
| 立ち直り | 苦戦の後に成功 | 武器を掲げて喜ぶ（ハートの吹き出し） |
| ノッている | 1 分間に `edit` が 5 回以上で、失敗なし | 剣を振る速さが上がる、♪ の吹き出し |
| 疲れ | `context` が 0.7 以上 | 剣を振るのが遅くなる、MP が少ない（MP 1 割以下でやすむ＝教会で /compact を提案） |
| 呼んでいる時間 | `ask` が 1 分以上放置 | 手を振る速さが上がる |
| 居眠り | イベントが 10 分以上届かない | 宿屋のベッドで寝る（Zz の吹き出し） |

Live2D の表情判断（Decider・Jev／モック）は廃止。ドットの町では表情を描き分けず、上の様子で表す。

## RPG としての見せ方（`src/core/story.ts`）

- **勇者と仲間**: セッション＝勇者（エージェントごとに髪・服・マントの色が違う）。サブエージェントは種別で職業が決まる仲間（Explore＝とうぞく、Plan＝そうりょ、general-purpose＝せんし、その他＝まほうつかい）。戦闘中は勇者の後ろに並んで一緒に戦い、町では後ろについて歩く。
- **ステータス**: Lv＝1＋（成功したツール数＋達成クエスト数×5）÷10、HP＝直近 5 分の失敗で減る、MP＝コンテキストの残り（1−使用率）。
- **戦闘**: ツールが成功するたびにモンスターへダメージ（数字が跳ねる、HP バーが減る）。テストが通る／仲間の仕事が終わるとモンスターを倒す。失敗すると勇者が赤く点滅してダメージを受ける。
- **ファンファーレ**: クエスト達成（TaskCompleted）とレベルアップで「クエストクリア！」「レベルアップ！」。
- **語り**: 出来事を古典的な RPG 風のメッセージウィンドウで1文字ずつ表示する（例：「t12-vitalsの こうげき！ 「room.ts」に きりかかった！」）。ツール出力や本文は使わず、上の「対象」の範囲だけで語る。
- **出入り**: セッション開始で町の入口（左端の道）から歩いて入り、終了で入口へ帰る。ページを開き直した時は歩かずにその場に現れる。

## 詳細

- モンスターの名札：戦っている相手（ファイル名・コマンドの先頭・サブエージェント種別）。
- クエストボード：計画中（またはタスクを持つ）エージェントの依頼書（最大 6 枚、進行中は黄色の印、達成は赤い判）と、完了数／全体数。
- つよさウィンドウ（右）：Lv・HP・MP・いまの行動・様子・なかま・クエスト一覧。許可要求には「はい／いいえ／ターミナルで こたえる」で答えられる。
- 勇者かウィンドウをクリックすると「ぼうけんの きろく」（最近の行動、○×つき）を表示する。

## 扱う情報の範囲（プライバシー）

- アダプタが送るのは上の表の「対象」まで。ただし **UserPromptSubmit の依頼本文と Stop の最後の返答だけ**、`text`（最大8000文字）としてローカルの relay と会話画面へ送る。ツールの出力・ファイルの中身は送らない。Bash の終了フックだけコマンドを最大8000文字まで照合用に送り、履歴・配信の前に外す。証拠に残るのは先頭200文字だけ。
  - ファイル名はベース名のみ（ディレクトリは送らない）。Web はドメインまで。
  - コマンドは先頭の `cd …` 区間と `FOO=bar` 形式の代入を飛ばし、最大3語まで。パス（`/` を含む語）・引用符・`=` などを含む語が出たらそこで打ち切る（例：`git commit -m "…"` → `git commit -m`、`ls /path` → `ls`）。
  - 例外として、タスクの件名はホワイトボード用に送る（各 200 文字、1 エージェント 50 件まで）。
- 対象・TODO・依頼本文・最後の返答はローカルの server と画面で使い、外部へ送らない（Jev 連携は廃止）。
- 会話窓と行動ログはメモリだけで、server の再起動で消える。仕事の台帳には題（依頼の1行目）・目的・状態・報告の要点・ためすことの証拠が残る。依頼と返事の本文は「かいわも のこす」を選んだ人だけ保存する（既定オフ）。許可の全文・端末やツールの出力は保存しない。町・設定・名前・再開用のめいぼの JSON に会話本文は含めない。各 CLI 自身の履歴保存はこのアプリとは別。

## AgentEvent の拡張

既存のフィールドはそのまま残し、以下を足した（`src/core/events.ts`）。

```ts
interface AgentEvent {
  // 既存: state, detail, ts, source, tool, context
  agent?: string;          // session_id。無い場合は従来どおり1体（"default"）として扱う
  name?: string;           // cwd の末尾
  terminal?: string;       // アプリの PTY ID（外から来た勇者は無し）
  project?: string;        // 表示名でない町の鍵（共通 git ディレクトリの実パス等）
  text?: string;           // 依頼・最後の返答、最大8000文字。本文保存は利用者の選択時だけ
  hook?: string;           // hook_event_name
  target?: string;         // 手元の表示（上の範囲に切り詰め済み）
  subagent?: { id: string; type?: string };
  task?: { id: string; subject?: string; status: "pending" | "in_progress" | "completed" | "deleted" };
}
```

- 活動の判定は **core 側**（`src/core/activity.ts`、`hook`・`tool`・`target` から判定）。アダプタは薄く保つ。
- 部屋の状態と様子は `src/core/room.ts`。web と同じものを server の再送（接続時の replay）から組み立てる。
- 出勤・退勤は SessionStart / SessionEnd の `hook` で表す（新しい state は増やさない）。
- フックは並行して動くので、到着順ではなくアダプタの時刻（`ts`）で前後を判断し、古いイベントで新しい活動を上書きしない。
- Decider 向けのイベント変換（`deciderEvent`）は廃止。表示の計算は core で行う。

## 実機での確認結果（Claude Code 2.1.295）

`claude -p` に記録用フックを付けて確認した。

1. サブエージェント内のツール実行では、PreToolUse / PostToolUse に `agent_id`・`agent_type` が入る。→ 助っ人の活動を親と区別できる。
2. サブエージェント起動のツール名は `Agent`、種別は `tool_input.subagent_type`。
3. PostToolUse / PostToolUseFailure に `duration_ms` が入る（今回は使わず、Pre からの経過で長い待ちを判定）。
4. このバージョンには **TodoWrite が無く**、TaskCreate / TaskUpdate と TaskCreated / TaskCompleted フックを使う。タスク件名は TaskCreated の `task_subject`、状態の変更は TaskUpdate の `tool_input.status`。
5. PostToolUseFailure に `is_interrupt` が入る。中断は失敗として数えない。
6. 当時は Notification の値が未確認（`-p` では発火しない）。段階5では idle_prompt を待機として扱い、permission_prompt / elicitation_dialog だけ呼び出す。複数セッション同時実行時の取りこぼしは未確認。

## やらないこと（この段階）

- Codex のツール出力・画面・transcript からの成否や MP の推測
- 町のレイアウト編集
- キャラ同士の会話・やりとりの演出、効果音・BGM
- 勇者の表情の描き分け（Live2D 表示・Decider は廃止）
- 行動ログ全体の保存（仕事の台帳と、選んだ人の会話本文は段階14以降の保存対象）
