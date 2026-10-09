# Architecture (PoC)

開発用AIエージェントの状態を受け取り、Live2Dキャラクターの表情・動きとして表示する **表示専用レイヤー**。
ハーネスは作らない。どのエージェント／ハーネスからでも「状態イベント」を送れれば良い。

## データフロー

```
[任意のハーネス] --HTTP POST /event--> [relay (Node)] --WebSocket--> [web (ブラウザ)]
                                                                      |
                     AgentEvent ─▶ Decider ─▶ Selector ─▶ MotionGenerator ─▶ Renderer
                                  (Jev枠)    (候補→1つ)   (手続き的・毎フレーム)  (Live2D / Placeholder)
```

各段は **インタフェースだけで繋ぐ**。差し替え対象は主に Decider（Jev → 生体模倣アルゴリズム等）と Renderer。

## モジュール境界

| モジュール | 責務 | 依存してよいもの |
|---|---|---|
| `src/core/events.ts` | `AgentEvent` 型と実行時バリデーション | なし |
| `src/core/decider.ts` | `Decider` インタフェース、`Candidate` 型 | events |
| `src/core/mock-decider.ts` | ルール表で候補とスコアを返すモック | decider |
| `src/core/selector.ts` | 候補リストから1つ選ぶ（最高スコア、同点・ゆらぎは seed 付き乱数） | decider |
| `src/core/motion.ts` | 目標（表情・姿勢）＋アイドル層（呼吸・瞬き・揺れ）から毎フレームの抽象パラメータを生成 | decider の型のみ |
| `src/server/relay.ts` | `POST /event` を受けて検証し WS で配信 | events |
| `src/web/*` | WS受信 → core を回す → Renderer に流す | core |
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

## ハーネス連携（アダプタ）

`adapters/<harness>/` に、各ハーネスのフック／拡張から `POST /event` するだけの薄いアダプタを置く。
アダプタはエージェントの動作を絶対に妨げない（短いタイムアウト、失敗しても黙って終了、標準出力に何も出さない）。

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
- 本物の Jev 連携（モックのみ。API 確定後に `Decider` 実装を1つ足す）
- デスクトップ常駐（透過ウィンドウ、Electron/Tauri）
- 音声・リップシンク、複数キャラ、設定 UI、認証、永続化
