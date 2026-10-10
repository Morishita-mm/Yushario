# Architecture (PoC)

コーディングエージェントに **Live2D の肉体と、活動する場所** を与えるアプリ。
ハーネスは作らない。利用者の好きな CLI エージェント（Claude Code / pi / Codex など）を埋め込みターミナルでそのまま動かし、
フックから届く「状態イベント」でキャラクターの表情・動きを制御する。

配布方針: フェーズ1は GitHub から clone / npx で動くローカル Web アプリ（1プロセス）。フェーズ2で同じ Web 画面を Tauri で包み、
透過・最前面のキャラクター窓と GitHub Releases 配布にする。Web 部分はフェーズ2でも共通に使う。

## データフロー

```
                 ┌──────────── server (Node, 127.0.0.1 の1プロセス) ────────────┐
[フック/拡張] ─POST /event─▶ AgentEvent ─▶ Decider ─▶ Selector ──WS /ws (decision)──▶ [web]
                 │                         (Jev / Mock)  (候補→1つ)                      │  MotionGenerator ─▶ Renderer
                 │                                                                        │
[CLI エージェント] ◀─PTY─ pty ◀──────────────WS /pty (入出力)────────────────────── [web] 埋め込みターミナル(xterm.js)
                 └────────────────────────────────────────────────────────────────┘
```

- 判断（Decider/Selector）は **server 側** で行う。Jev の API キーをブラウザに渡さないため。web は決定結果を受けて動かすだけ。
- server は本番では build 済みの web を自分で配信する（開発時は Vite）。

各段は **インタフェースだけで繋ぐ**。差し替え対象は主に Decider（Jev → 生体模倣アルゴリズム等）と Renderer。

## モジュール境界

| モジュール | 責務 | 依存してよいもの |
|---|---|---|
| `src/core/events.ts` | `AgentEvent` 型と実行時バリデーション | なし |
| `src/core/decider.ts` | `Decider` インタフェース、`Candidate` 型 | events |
| `src/core/mock-decider.ts` | ルール表で候補とスコアを返すモック（Jev 不在時のフォールバック） | decider |
| `src/core/selector.ts` | 候補リストから1つ選ぶ（最高スコア、同点・ゆらぎは seed 付き乱数） | decider |
| `src/core/activity.ts` | フック・ツール名・対象から活動（読む・書く・テスト…）を判定 | events |
| `src/core/room.ts` | 部屋の状態（エージェントごとの活動・助っ人・タスク・行動ログ）と、直近の流れから様子を算出 | activity, events |
| `src/core/story.ts` | RPG としての語り（ナレーション）、Lv・HP・MP、仲間の職業、活動ごとのモンスター | activity, events, room |
| `src/core/town.ts` | Room からプロジェクト別の町・安定した表示名・勇者の居場所・仲間の職業へ変換する純粋関数 | room, story |
| `src/core/motion.ts` | 目標（表情・姿勢）＋アイドル層（呼吸・瞬き・揺れ）から毎フレームの抽象パラメータを生成 | decider の型のみ |
| `src/server/relay.ts` | `POST /event` を受けて検証 → Decider → Selector → WS で決定を配信 | core |
| `src/server/jev-decider.ts` | Jev（TypeSafe System One API）を呼ぶ `Decider` 実装。キーが無ければ使わない | core |
| `src/server/pty.ts` | 埋め込みターミナル用の PTY と WS /pty の中継 | なし |
| `src/web/rpg/*` | メインの町のページ。WS で Room を組み立て、ワールド・町・宿屋・フィールドを地図上で移動。町のすがたは localStorage、右に選んだ勇者の「つよさ」・許可、下に時刻付きメッセージ | core, web/town |
| `src/web/town/*` | データを受け取る共有描画（ワールド・5種の町・宿屋・フィールド・戦闘フォーカス）、既存 manifest の絵の読み込み・色違い・環境の動き・通りの歩行 | core の型、既存 public/art の絵 |
| `src/web/art/*` | 絵のギャラリーと `/mock.html` の入口・偽データ。メインと同じ町の描画を使う | web/town |
| `src/web/*` | Live2D のページ（`/live2d.html`）。WS で決定を受信 → MotionGenerator → Renderer、埋め込みターミナル | core |
| `src/web/renderers/*` | `Renderer` 実装。抽象パラメータ → モデル固有パラメータの対応表で適用 | core の型のみ |

`src/core` は DOM・Node API に依存しない純粋 TypeScript とし、単体テストする。

## 主要な型（初期案。必要最小限から始める）

```ts
type AgentState = "idle" | "thinking" | "working" | "waiting_input" | "success" | "error";
interface AgentEvent {
  state: AgentState;
  detail?: string;
  ts?: number;
  source?: string;   // 送信元ハーネス（"claude-code" / "pi" など）
  tool?: string;     // 関係するツール名（"Bash", "Edit" など）
  context?: number;  // コンテキスト使用率 0〜1（分かる時だけ）
}

type Gesture = "nod" | "shake" | "wave" | "think" | "cheer" | "tremble";
interface Candidate { expression: Expression; posture: Posture; gesture?: Gesture; score: number }
interface DecisionContext {
  event: AgentEvent;
  recent: AgentEvent[];  // 直近のイベント（古い順、event を含む、最大10件）。感情の文脈はここから読む
  previous?: Candidate;
  elapsedMs: number;
}
interface Decider { decide(ctx: DecisionContext): Promise<Candidate[]> }
```

- 「エージェントの仕事」は重いモデル（Claude 等）、「肉体の制御」は軽量モデル（Jev 等）に分担させる。
  Decider は 表情・姿勢・ジェスチャー の選択だけを担い、エージェント本体には何も返さない。
- gesture は「状態の変わり目」に一度だけ再生する単発の動き。継続的な動きは MotionGenerator が担う。

- `Expression` / `Posture` は少数の文字列ユニオン（例: neutral / focused / happy / troubled / surprised、
  upright / lean_forward / tilt / slump）。モデル依存のパラメータ名はここに出さない。
- Decider は非同期（将来 Jev がリモート推論になる想定）。モックも同じ形で返す。

```ts
interface Renderer {
  apply(params: MotionParams): void;              // 毎フレーム
  setExpression?(expression: Expression): void;   // 任意。モデル固有の表情（.exp3.json 等）を持つ実装だけが使う
  playGesture?(gesture: Gesture): void;           // 任意。モデル固有のモーション（.motion3.json 等）を持つ実装だけが使う
}
```

## 体験の柱（優先順）

キャラクターは「画面を読まなくても視界の端で状況がわかる」ための体。IDE 機能では競わない。

- **B. 呼ばれたら向き合う**（実装中）: エージェントが人間を必要とした時、キャラクターがこちらを向いて吹き出しで求め、その場で応えられる。
  - 許可要求: Claude Code の `PermissionRequest` フックを server が受け、WS で web に `{"type":"permission", id, tool, summary}` を送る。
    web の吹き出しで「許可 / 拒否 / ターミナルで答える」を選ぶと、WS で `{"type":"permission-decision", id, decision}` を返し、
    server がフックへ `{"behavior":"allow"}` / `{"behavior":"deny","message":...}` を返す（「ターミナルで答える」と時間切れは判断なしで返し、通常のプロンプトに任せる）。
  - 不在からの復帰: web がページの可視状態で不在を判定し、戻った時に不在中のイベントを集計して吹き出しで報告する（テンプレート文、LLM は使わない）。
  - 吹き出しの文面やツール入力はローカル（server と web）でのみ扱い、Jev には送らない。
- **A. 気配で状況がわかる**: 体調（コンテキスト使用率→疲労）、視線・指さし、確信度。
  - 体調（実装中）: アダプタがエージェントのコンテキスト使用率（0〜1 の数値のみ）を `AgentEvent.context` で送る。
    web は `MotionGenerator.setFatigue(f)` で継続的に体へ反映する（まぶたが重い・呼吸が遅い・頭が下がる）。Decider の判断とは独立した連続量。
    使用率が高い閾値を初めて超えた時に、吹き出しで整理（compact）を提案する。会話本文は読み取ってもアダプタの外へ出さない。
- **C. チームが部屋にいる**（実装中）: 複数エージェントを1部屋の複数キャラクターとして表示。
  RPG 風の町（作業＝戦闘、休み＝宿屋、サブエージェント＝仲間）で、エージェントの様子を細かく描写する（Live2D 継続案も保留として残す）。
  対象は当面 Claude Code のみ。観察の仕様は `docs/OBSERVATION.md`。

## ハーネス連携（アダプタ）

`adapters/<harness>/` に、各ハーネスのフック／拡張から `POST /event` するだけの薄いアダプタを置く。
アダプタはエージェントの動作を絶対に妨げない（短いタイムアウト、失敗しても黙って終了、標準出力に何も出さない）。

## Jev 連携

- `POST https://api.typesafe.ai/v1/systemone`、`Authorization: Bearer $TYPESAFE_API_KEY`、`model: "jev-latest"`。
- 1イベント1リクエスト。`state` に {event, recent, previous}、`questions` に expression / posture / gesture（"none" を含む）の choice を入れる。
- choice の `confidence` が閾値未満なら previous を維持する（confidence-gated）。直前と同じ state の繰り返しは API を呼ばずに previous を返す。
- `TYPESAFE_API_KEY` が無い、または API が失敗した場合は MockDecider にフォールバックする。
- プロンプト本文やツール入出力は送らない（アダプタが送らない）。発話内容を使う拡張は将来の opt-in。

## 埋め込みターミナルとセキュリティ

- server は 127.0.0.1 のみで待ち受ける。起動時にランダムなトークンを生成し、`http://127.0.0.1:<port>/?token=...` を表示する。
- WS /pty と WS /ws はトークン必須かつ Origin が自分自身の場合のみ許可する（他サイトのページからのシェル乗っ取りを防ぐ）。`POST /event` は従来通りローカルからの受付でよい。
- PTY の子プロセスには `AGENT_CHARACTER_URL` を環境変数で渡し、中で起動したエージェントのフックが自動で server に届くようにする。

## 動きの生成

- 目標値への遷移はばね（臨界減衰）で滑らかに補間する。
- アイドル層：呼吸（正弦）、瞬き（ランダム間隔）、頭の微小な揺れ（低周波ノイズ）。
- 出力は抽象パラメータ（`headX`, `headY`, `bodyX`, `eyeOpen`, `mouthSmile`, `brow` など）。
  Live2D の `ParamAngleX` 等への対応付けは Renderer 側の設定で行う（持ち込みモデルごとに名前が違うため）。

## Live2D とモデル

- Cubism Core（`live2dcubismcore.min.js`）とモデルは **リポジトリに含めない**。利用者が配置する。
- デフォルトキャラ：公式サンプルモデルの取得手順を README に書き、`models/` に置けば読み込む。規約確認は利用者責任。
- Core やモデルが無い場合でも動作確認できるよう `PlaceholderRenderer`（Canvas の簡易顔）を用意する。

## PoC でやらないこと

- ハーネス本体、エージェントのログ解析、LLM 呼び出し
- デスクトップ常駐（透過ウィンドウ、Tauri）— フェーズ2
- 音声・リップシンク、複数キャラ、設定 UI、ユーザー認証、永続化
