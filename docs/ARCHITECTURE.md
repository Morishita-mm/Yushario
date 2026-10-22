# Architecture (PoC)

CLI エージェントの仕事を **RPG 風の町と勇者** として見せ、埋め込みターミナルの勇者に依頼し、会話と報告を受け取るローカル Web アプリ。
ハーネスは作らない。Claude Code / pi / Codex / shell をそのまま PTY で動かし、対応するフック・拡張から届く状態イベントを町の表示に使う。

Node 22.13.0 以上（組み込み `node:sqlite`）の1プロセスが `127.0.0.1` で build 済みの web と API・WebSocket を配信する。`yushario` の bin はビルド済み `lib/server/relay.js` を起動し、実行時に tsx・Vite は使わない。既存 Vite の SSR ビルドで server と pi 拡張の Node ESM を `lib/` に出し、web・絵は `dist/` に入れる。Vite のサーバーと tsx は開発時だけ使う。
状態の読み取りは `docs/OBSERVATION.md`（現在の観察契約）、勇者の操作と現在の対応範囲は `docs/PLATFORM.md` の最新段階、絵は `docs/ART.md` が正。過去段階の制限を現在の仕様として扱わない。
スマホの小さな別アプリと、本体側のモバイル窓口は `docs/MOBILE.md`、通信のバイト列は `docs/MOBILE-PROTOCOL.md` が正。

## 原則：ハーネスではなく ADE

Yushario は Agent Development Environment（エージェントに仕事を任せ、確かめ、成果を採るための作業の場）であり、エージェント本体（ハーネス）ではない。機能を足す時は次を守る。

1. Yushario は自分で LLM を呼ばない。応答・判断・要約を作るのは各 CLI。
2. ツールの実行や許可を、エージェントの代わりに行わない。許可は人の判断を伝えるだけ。
3. エージェントに送る文は、人が書いた物か、人が選んだ定型文だけ。送る前に中身が見える。
4. 仕事の分け方・割り当て・引き継ぎの中身は、人か、人が指揮役に任せた勇者（CLI）が決めて書く。Yushario はそれを保存し、届け、見せる。
5. CLI とは公式の差し込み口（フック・拡張・起動引数）だけでつなぐ。CLI の中身や文脈の管理には手を入れない。
6. 機能を特定の CLI に縛らない。仕事の台帳・確かめた結果・協調の仕組みは、どの CLI の勇者でも同じ物を使う（CLI の能力差で届かない所は画面に出す）。

### 原則5：表示だけの非保証の例外

- フォルダの信頼確認は、端末の英語の画面文字から見分けて案内する。CLI の文言・言語が変われば検出できない。信頼の自動承認や入力可能の判断には使わない。
- Claude Code の MP は、フックが渡す transcript の usage を読む推定。内部の形の安定は保証せず、読めなければ「？」のまま。CLI の文脈や実行・許可は変えない。

### 守る範囲

Yushario と勇者は同じ OS 利用者で動く。悪意ある同一利用者によるファイル・DB・他プロセスへの直接操作は隔離しない。
防ぐのは HTTP を1回送るだけで別の勇者や人を名乗ること。所属・証拠・許可はサーバーが起動した端末と専用の合言葉から決め、本文の端末 ID は信じない。

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
[web] ── /api/agents・sessions・roster・names・towns・settings・quests ──▶ [server]
```

- server はイベントを検証し、`event` と接続時の `replay` を配信する。活動・様子・語り・報告・勇者の居場所は core の決定的な処理で求める。
- web は replay とライブイベントから Room を組み立て、町と会話を更新する。サーバーの端末状態・台帳・名前は API と WS の通知から受け取る。
- 依頼は対応する PTY へ送る。作業中はサーバーで預かり、準備ができた時に送る。許可要求は利用者の判断をフックへ返し、自動承認しない。
- エージェントの応答を作るのは各 CLI。アプリ自身は LLM や外部の判断 API を呼ばない。

## モジュール境界

| モジュール | 責務 | 依存してよいもの |
|---|---|---|
| `src/core/events.ts` | `AgentEvent` 型と入力の検証 | なし |
| `src/core/codex.ts` | Codex 0.162.1 の公式フック JSON を AgentEvent へ変換。成否・MP を推測せず、本文・対象を制限 | events |
| `src/core/hook-trust.ts` | 合言葉なしの知らせから端末・証拠入力を外す処理、人が選んだ再開と旧端末終了の照合 | events |
| `src/core/activity.ts` | フック・ツール名・対象から活動を分類 | events |
| `src/core/room.ts` | 勇者・仲間・クエスト・行動ログ・会話の状態と、直近の流れから様子を計算 | events, activity, turns |
| `src/core/turns.ts` | 進行中の往復の累計、最後のテスト結果と異常終了、直近256イベント内の遅着補正、許可待ちを除いた所要時間、報告の付与 | events, activity |
| `src/core/event-history.ts` | 2000件の履歴から、勇者ごとの件数と保護するイベントに基づいて捨てる順を決める | events |
| `src/core/permissions.ts` | 許可の表示用要約・回答 JSON、期限と省略本文の回答可否、端末／仲間に限定した進行の判定 | events |
| `src/core/mobile-protocol.ts`, `mobile-display.ts`, `mobile-quests.ts`, `mobile-signing.ts`, `mobile-pairing.ts`, `mobile-push.ts` | モバイル v1 の本文・許可リスト・連番／時刻窓・署名／hash 入力・nonce・コードの遷移・SAS の桁・固定通知・receipt と安全な診断値の検査 | core の型・関数のみ |
| `src/core/terminal-session.ts` | 起動入力のフィールド検査、端末の行列数、保持出力の行・UTF-8 バイト境界 | なし |
| `src/core/terminal-modes.ts` | 端末の出力の切り捨てた部分で有効になったモード（別画面・マウス・貼り付け等）を覚え、開き直した時に先に送る | なし |
| `src/core/local-request.ts` | 実際の待受ポートに対する Host の判定 | なし |
| `src/core/preview.ts` | ローカル URL・ポート・通知 origin の検査、ANSI を除いた完結行からの候補抽出、短いエラーと下書き、生存中のプレビュー宛先の選択 | なし |
| `src/core/worktrees.ts` | worktree porcelain（NUL）の読み取り、branch・絶対パス・既存拠点内の置き場所の検査、題の短い名前 | なし |
| `src/core/review.ts`, `review-base.ts`, `file-path.ts` | git porcelain v2・name-status・numstat の NUL レコードと差分の行番号、比較元 branch の既定・名前の検査、保存拠点／最後の担当フォルダの選択、相対パスの判定、エディタ URL の組み立て | core の型・関数のみ |
| `src/core/markdown.ts`, `markdown-inline.ts`, `markdown-preview.ts` | 勇者の返事の限定マークダウン解釈、安全なリンクの判定、見える文字数とブロック単位のプレビュー | core の型・関数のみ |
| `src/core/story.ts` | 語り、Lv・HP・MP、仲間の職業、活動ごとのモンスター | events, activity, room |
| `src/core/battle-presentation.ts`, `equipment.ts`, `walking.ts`, `notification-sound.ts`, `notice-mark.ts` | 戦闘の数値・装備の型と検査・歩行・通知音の対象・でんれいの目印の純粋計算 | core の型・関数のみ |
| `src/core/town.ts`, `town-station.ts` | Room を町・安定した表示名・居場所へ変換。think/git/web の屋外停止点と read/search→library・tool→shop、共通の8秒猶予・図書館の姿勢、屋外3〜4枠と中立の散歩先 | room, story, activity, walking の型 |
| `src/core/town-ledger.ts` | 町の鍵・表示名・設定の型、町の登録・活動更新・自動でしまう判定 | なし |
| `src/core/checks.ts` | ためすこと・拠点つき証拠と指紋の型、保存拠点／書き換える役の選択、単純コマンド1つの照合と拠点での実行の確認、不明な試行、最新の証拠と今の指紋による5つの印、package.json の候補 | events, activity |
| `src/core/decisions.ts` | 鑑定の判断（OK／要修正。記録だけ）と うけとった記録の型と検査（PR は https だけ）、選んだ差分の行からの修正依頼の下書き | checks, review-base |
| `src/core/quest-stage.ts` | 保存した状態と担当から、人の流れの段階（任せる・指示を送る・作業中・返事待ち・報告を見る・おわり）、誰の番か、何回目か、前の担当を読む | quests |
| `src/core/tactics.ts` | パーティーの作戦（命令に従え・レビューし合え・調べてから・全部任せた）の編成の合否と作戦の中・外、レビューの判定の読み取り、作戦が送る文 | party |
| `src/core/hero-search.ts` | ゆうしゃタブの絞り込み（町の札・言葉・状態）と状態ごとの数。町の中とワールドマップで共通 | activity |
| `src/core/quests.ts` | 永続クエスト・出来事・結び付きの型、セッションごとの判断待ちを優先する状態の判定、依頼の題と保存する本文の選択、一覧の順、町の未着手クエストの有無（掲示板の貼り紙） | events, session-actions, turns, town-ledger |
| `src/core/party.ts`, `party-scroll.ts` | 役割・合言葉の形式・権限の純粋な判定、紹介文と台帳の事実だけの巻物 | core の型・関数のみ |
| `src/core/names.ts`, `roster.ts` | 名前・めいぼの型と入力の判定、件数制限 | core の型・関数のみ |
| `src/core/session-actions.ts` | イベントによる待機・停止要求の確認判定、古い SessionEnd の拒否、フォルダ信頼確認の検出 | events |
| `src/server/relay.ts`, `relay-hooks.ts` | 名前付き関数で HTTP の振り分け・WS 接続と受信・起動案内・停止、フックと許可の受信を分担。認可、イベントの記録順と配信、PTY・台帳の接続は同じ入口で保つ | core, server, Node http, ws |
| `src/server/hook-auth.ts` | 端末専用の合言葉の固定長比較から生存中の送り元を決める | core/party, pty-session, Node crypto |
| `src/server/git.ts` | Git の外部実行設定・継承環境を抑えた小さな execFile 関数、filter の列挙と無効化 | Node child_process |
| `src/server/agents.ts` | 起動・再開・整理・終了の送り方と対応範囲を1つの表に定義、PATH の CLI 検出 | Node fs/path/url |
| `src/server/startup.ts` | 起動引数、空きポートへの bind、ブラウザを開く | Node http/child_process |
| `src/server/pty.ts`, `pty-session.ts`, `pty-socket.ts` | 複数の端末セッションと API、起動・終了・停止、WS /pty の接続・受信と保持出力の配信 | core, server, Node, node-pty, ws |
| `src/server/pty-launch.ts`, `pty-process.ts` | CLI の起動、フック設定、環境変数、子プロセスの終了 | agents, core, Node, node-pty |
| `src/server/pty-actions.ts` | 依頼の送信・預かり、にげる・やすむ・みおくる | core, agents, pty-session |
| `src/server/permissions.ts` | core の許可判定を呼び、独立した Promise・タイマーで利用者の回答・時間切れをフックへ返す。モバイルの監査保存は判断の配送前に行う | core/permissions, language, Node timer |
| `src/server/mobile/*` | 別ポートの窓口、Node crypto、鍵・端末と連番の耐クラッシュ保存、保留ペアリング、固定 Expo 通知と receipt 確認・上限つき0600診断、画面用の登録／テスト通知 API、既存の状態／報告からの表示値 | core, permissions, Node crypto/http/fs、固定先への fetch |
| `src/server/project.ts`, `town-api.ts`, `town-data.ts` | git 共通ディレクトリの実パスによる町の鍵・短い名前の取得、旧 JSON の移行、町・設定・名前・めいぼの API と JSON 保存 | core, agents, Node |
| `src/server/quest-db.ts`, `quest-migrations.ts`, `quest-ledger.ts`, `quest-api.ts` | SQLite の1接続と全表の番号付き移行、クエスト・出来事・端末の結び付きの保存、依頼・報告の記録、クエスト API と WS の通知。party/checks/previews の保存クラスは表を作らない | core, Node sqlite/fs/crypto, server |
| `src/server/party.ts`, `party-db.ts`, `party-api.ts`, `party-agent-api.ts` | パーティーの保存・人の確認・巻物・会話対応の端末だけへの配送、現在の書き換える役の取得、セッション専用 API と一定時間の合言葉比較 | core, server, Node sqlite/crypto/http |
| `scripts/yushario.mjs` の `quest` | セッションの合言葉で限定 API を呼ぶだけの管理コマンド。サーバーの起動処理を通らない | Node 標準 API |
| `src/server/tactics.ts` | 作戦を進める。フックの知らせを見て、作戦どおりの文を仲間に送り、出来事に残し、確かでない時は止めて人に返す。作戦の選択は出来事 `tactic` に残す（進み具合はメモリだけ。再起動で止まる） | core, server |
| `src/server/checks.ts`, `checks-db.ts`, `checks-api.ts` | クエストの保存拠点（無ければ現在の書き換える役）の指紋、上限つき未追跡本文のハッシュ、拠点つき証拠・条件の保存、候補と印の API。コマンドは実行しない | core, server, Node fs/crypto/sqlite/http |
| `src/server/review.ts` | 既知の端末／クエストの保存拠点の git 状態・未コミット／merge-base からの差分、報告の branch・HEAD の読み取り、町・作業ツリー・フォルダ境界・サイズ・時間の検査 | core, server/git, Node fs/path/http |
| `src/server/worktrees.ts` | git worktree の一覧・作成・撤去、親の実パス・既存 branch／フォルダ・活動中の端末・残る変更の検査 | core, Node child_process/fs/path/http |
| `src/server/preview.ts`, `preview-db.ts`, `preview-output.ts` | クエスト／町のプレビュー URL の保存と API、PTY 保持出力と同じ場所での候補抽出 | core, server, Node http/sqlite/crypto |
| `src/server/static.ts` | `dist/` と `public/` の静的配信、パスの検査 | Node |
| `src/server/http-body.ts` | HTTP JSON 本文のバイト上限と400／413の応答 | Node http |
| `src/web/rpg/*` | メインの町。Room と WS、移動・つよさ・許可・会話と報告・しゅつじん・コマンド・めいぼ・ヘルプ。空状態とヘルプは仕事の流れ・実務との言葉の対応を日英で案内 | core, web/town, terminal |
| `src/web/rpg/main.ts`, `relay-message.ts` | ページの起動、名前付きの replay・ライブ更新・WS 受信。イベントと許可の受信値の読み取りを分ける。WS 切断時の読み取り API の403を通常の切断と区別し、新しい URL を案内 | core, web/rpg, DOM, WS |
| `src/web/rpg/report-links.ts` | 開いた会話の返事だけ報告の所属を遅延取得、最近200件のページ内保持。題は現在のクエスト一覧から読む | core の型, DOM, HTTP |
| `src/web/rpg/interrupt-status.ts` | RoomAgent.stopRequestedAt と現在時刻から、停止の確認待ち／30秒後の未確認案内を札と会話へ共通表示 | core の型, language |
| `src/web/town/side-tabs.ts` | 本体・モック共通のサイドバー。選択タブだけ Tab 順序に入れ、左右矢印・Home・End で選択とフォーカスを移す | DOM, language |
| `src/web/town/command.ts` | 本体・モック共通の勇者コマンド・確認 | DOM, language |
| `src/web/town/battle-commands.ts` | 本体・モック共通の戦闘コマンド。選択中の作戦の送信全文を常に表示し、focus・mouseenter・矢印カーソルから更新 | DOM, command, language |
| `src/web/town/herald.ts`, `src/web/rpg/scene.ts`, `scene-drawing.ts`, `map-hotspots.ts`, `navigation.ts` | Scene の入力・移動と、町／室内／フィールドの描画・地図の当たり判定を分担。既存の町一覧・設定の窓は native dialog でフォーカス移動・復帰。眠る町・しまった町は通常のボタンからも開く（町一覧はモックも共通） | core, DOM, web/town |
| `src/web/rpg/review-window.ts`, `review.css`, `file-open.ts` | 鑑定の窓、長い題の折り返しと比較元ラベルの幅の維持、報告の鑑定済み印、ブラウザのエディタ選択とファイルを開くリンク（モックも同じ窓） | core, DOM, HTTP |
| `src/web/rpg/expedition.ts` | 出陣・端末の窓。出陣直後はパス欄へフォーカスし、読込後にその欄を隠す時だけ種類／行き先へ移す | core の型, DOM, HTTP, terminal |
| `src/web/rpg/expedition-bases.ts`, `worktrees.css`, `src/web/town/party-list.ts` | 出陣の拠点・新しい branch／path の下書き・同じ場所の警告、勇者を拠点ごとにまとめる共通一覧 | core, DOM, HTTP |
| `src/web/rpg/quests.ts`, `quest-settings.ts`, `talk-quest.ts` | クエストのタブと札、題・目的・ためすことの未保存入力とフォーカスの維持、見出しで名前を付けた窓と表示中のresizeでの位置更新、会話からの選び直し、本文保存と記録削除の設定 | core, web/town, HTTP/WS |
| `src/web/town/quest-party.ts`, `party-window.ts`, `party-cards.ts`, `party-forming.ts`, `party-tactics.ts`, `party-window.css`, `quest-party.css`, `src/web/rpg/party-notices.ts` | 本体・モック共通の札のパーティー一覧と、ドラクエ風の編成窓（手伝ってもらう・担当を交代する・外す・しき役）、でんれいの仲間の確認と役割外の変更。確認窓は見出しで名前を付け、表示中だけresizeで位置更新し、閉じる時に監視を外す | core, DOM, HTTP/WS |
| `src/web/town/quest-checks.ts`, `check-marks.ts`, `checks.css` | 本体・モック共通のためすこと、札・一覧・報告の印と見出しで名前を付けた証拠の窓、done の確認 | core, DOM, HTTP |
| `src/web/town/quest-list.ts`, `quest-card.ts`, `quest-board.ts` | 本体・モック共通のクエスト一覧・札・掲示板の入口。一覧は「あなたの番／勇者が作業中／おわった」に分け、札は6段階の帯と「次にやること」を上に出す。編集・追加・パーティー・全出来事は開いた状態を保つ折り畳みにする（段階22）。一覧更新は操作中の新規／クエストID／条件ID／町の折り畳みへフォーカスを戻し、削除時だけ隣接項目へ移す | core の型・関数, DOM, art data |
| `src/web/rpg/preview.ts`, `src/web/town/quest-preview.ts`, `preview-controls.ts`, `preview-tabs.ts`, `preview.css` | 本体・モック共通のプレビュー区画、名前付きの別タブ、エラーの一覧と会話への下書き。町のプレビューとエラーの窓は見出しで名前を付ける | core, DOM, HTTP |
| `public/preview-link.js` | opener があるページだけ、URL・題・先頭20件（各500文字）のエラーを配信元 origin へ postMessage | ブラウザ標準 API のみ |
| `src/web/town/*` | データを引数で受け取る共有描画。ワールド・5種の町・宿屋・教会・図書館・道具屋・フィールド・戦闘、絵の読み込みと歩行。地図のラベルは描画時だけ160px以内で省略し、コマンドは親と窓自身のサイズ変更時に範囲内へ置き直す | core の型, DOM/Canvas, public/art |
| `src/web/town/battle.ts` | 本体・モック共通の戦闘フォーカス。上の小窓の名前を内幅（武器の分を除く）で末尾省略 | core の型, DOM/Canvas, art data |
| `src/web/rpg/app.html`, `app-layout.ts` | 本番・開発モックで共通のアプリHTMLとマップ／サイドバーの高さ計算。ViteがHTMLへ差し込み、共通mainが起動する | DOM, Vite の HTML 変換 |
| `src/web/art/*` | `/art.html` のギャラリーと `/mock.html` の架空データ。`mock.ts` は既存HTTP／WS契約のブラウザ内応答を先に用意して、本番の `rpg/main.ts` をそのまま起動。`mock-state.ts`・`mock-quest-api.ts`・`mock-server.ts` に一時状態・既存API応答を分け、未知の操作は409。別の地図描画・サイドバー・クエスト操作実装を持たない。場面移動・勇者追加などの操作パネルは `mock-controls.html` と `mock.css` でアプリの外へ置く。実サーバー・PTY・外部AIは呼ばない | 既存 core の型、web の本番画面、ブラウザ標準API |
| `src/web/terminal.ts`, `terminal-page.ts`, `style.css` | xterm の接続部品、`/terminal.html` の起動・接続・終了。町の端末窓も同じ接続部品を使う | xterm, DOM, HTTP/WS |
| `adapters/codex/hook.ts` | core の変換を呼び、端末 Bearer 付きで `/event` へ送る。ビルド先は `lib/adapters/codex/hook.js`、出力は `{}` のみ | core/codex, Node |
| `adapters/claude-code/*`, `adapters/pi/*` | ハーネスのフック・拡張をイベントに変換し、ローカルへ短時間で送る。pi は使用するイベント・context の最小の型を `types.ts` に置き、`npm run typecheck` に含める | ハーネス API, Node |

`src/core` は DOM・Node API・HTTP・WS に依存しない純粋 TypeScript。
時刻は引数で受け取り、活動・待機・集計・様子・居場所などの判断を単体テストする。
Room のようなイベントから状態を更新する処理もここに置くが、I/O や画面の状態は持たせない。

### テスト配置の限定例外

純粋な判断は `src/core/permissions.test.ts`・`terminal-session.test.ts` で検証する。既存の `src/server/permissions.test.ts` は Node タイマーと Promise の独立した期限・解除だけ、`pty-session.test.ts` は `node:path.isAbsolute` の OS 依存と Buffer の UTF-8 変換・切り捨て部分からのモード引き渡しだけを例外として残す。これらを core に移すと Node 依存が入るためで、PTY・WS・描画のモック試験は足さない。
モバイル窓口のセキュリティ検査（`docs/MOBILE.md` の SEC 項目）も例外とし、モックではなく実際の HTTP で窓口を立てて要求を送る。

## インタフェース（今ある境界だけ）

### adapters → server: AgentEvent

`src/core/events.ts` の `AgentEvent` と `parseAgentEvent(input)` が契約。

- `state`: `idle | thinking | working | waiting_input | success | error`
- 状態のメタデータ: `detail?`, `ts?`, `source?`, `tool?`, `context?`（使用率 0〜1）。文字列は `text`・`project`・`command` 以外、入れ子のID・説明も含め最大200文字で切る。町の鍵 `project` は実パスを切って衝突させないため最大4096文字
- 勇者と仕事: `agent?`, `name?`, `terminal?`, `project?`, `branch?`, `hook?`, `target?`, `subagent?`, `task?`。既知の端末の branch はサーバーが補う
- 会話: `text?`（依頼・最終返答、最大8000文字）
- 確かめ: Bash の終了フックだけ `command?`（照合中だけ最大8000文字、合成イベントの `tool_input.command` も可）。往復集計・履歴・WS へ渡す前に外し、証拠には先頭200文字だけを残す

アダプタは活動や物語を判断せず、安全な対象の短縮とイベントへの変換だけを行う。
pi は中断が完了した `agent_settled` で `InterruptConfirmed/idle` を送る。Esc の要求 `Interrupt` とは別で、通常の Stop・StopFailure の境界は変えない。
Notification は実際の入力要求だけ waiting_input。pi の整理失敗・キャンセルは PostCompact/idle の detail（`Compaction failed` / `Compaction cancelled`）で成功と区別し、待機へ戻るが MP 回復とは語らない。
同じ PTY の SessionStart で ID が変わった時は、server が旧 ID の SessionEnd を **terminal 無し**で記録する。PTY は継続し、新 ID の依頼済み判定はリセットする。同じ ID の reload は退場ではない。
会話本文・対象・許可の要約はローカルの表示と仕事の台帳だけで使い、会話本文の保存は利用者が選んだ時だけ。ツール出力・途中の返答は送らない。
Codex の PostToolUse は成否不明として扱い、成功数・報告のテスト／ファイル・証拠を足さず、語りも勝利にしない。公式 Interrupt は停止要求の Interrupt と区別して InterruptConfirmed にする。RoomAgent.source は制限を日英の札へ出すために保持する。

### core → server / web: 値と決定的な計算

新しい抽象インタフェースを挟まず、既存の型・関数を直接使う。

- `classifyActivity(event)`、`waitingAfterEvent(event)`、`hasTrustPrompt(output)` で入力を判定する。
- `permissionSummary` / `permissionOutput` は言語を受け取る許可の表示・回答、`permissionCanDecide` / `permissionProgress` は時刻・送り元・省略本文からの判定。`sessionInputFields` / `dimensions` / `outputStart` は入力のフィールドと保持出力のバイト境界を返し、Node のパス・Buffer 処理は server に残す。
- `previewRecipients(party, writerSession)` は生存中で会話対応の writer なら直接宛先、使えなければ生存中の仲間だけを返す。会話非対応の仲間は画面で選べなくする。
- `Room.apply(event, at)` がイベントから `RoomAgent` を更新し、`moods(agent, now)` が様子を求める。
- `recordTurn(turns, event, at)` 等が会話と報告を集計する。
- `stats(agent, now)`、`narrate(event)`、`battleMonster(activity)` が RPG の見せ方を求める。
- `townView(room, now, previousNames)` が町・勇者と安定した表示名を返す。`townStation` / `stationActivity` は活動中の行き先と最後の対応活動から8秒の保持を共通に求める。library/shop の勇者を町のwalkerから外し、`HeroTravel` は直前の居場所だけを覚えて対応入口から復帰させる。
- `registerTown` / `activateTown` / `archiveTowns` は入力の町一覧と時刻から新しい一覧を返す。`townKey` は内部の鍵、`townLabel` / `townNameForKey` は表示名を返し、未解決の鍵も実パスを見出しにしない。
- `checkBasePath` は保存拠点を優先し、無い時だけ同じ町の生存中の書き換える役を選ぶ。`commandMatchesCheck` / `certainCheckCommand` は単純コマンド1つに限って成否を使い、`&&` の列も不明にする。`ranAtBase` はフックのフォルダ名が拠点と違う実行を不明にする。引用の中の別コマンド・コメント・別名のscriptを拾わない。`evidenceChecks` が複雑な構文内に見つけた試行は成否不明（`CheckEvidence.passed` なし）とし、走ったとは推測しない。`latestCheckEvidence` / `checkMark` は最新の証拠と今の指紋から `unrun`・`passed`・`failed`・`stale`・`unknown` を決め、指紋不明・拠点不明・別拠点を合格にしない。
- `staleSessionEnd(event, at, latestAt)` は終了より新しい知らせの有無を判断し、Room・画面入口・台帳の破棄前に共有する。`rememberPermissionSound` は許可音の既知IDを最近256件に保つ。
- `agentTokenBytes` は固定長の合言葉の形式を調べ、`agentAuthorized` は一致・生存・所属・役割から操作の権限を決める。比較そのものは server の `crypto.timingSafeEqual`。`handoffScroll` は台帳の値を並べるだけで要約しない。
- `questStateForParty(state, waiting)` はメンバーの判断待ちを畳み込み、1人でも待つなら waiting、ただし人が決めた done・dropped を保つ。
- `questTitle` / `questStateAfterEvent` / `questForRecall` / `savedQuestEvent` / `sortedQuests` は依頼の題・状態・再開時の結び付き・保存する本文・一覧の順を決める。`reportTitle(report, language)` は報告の共通の見出しを返す。

### server ↔ web: ローカル HTTP / WebSocket

詳細な入力・返却値は `docs/PLATFORM.md` と各経路の実装に記載する。
`AgentEvent.project`・セッション／めいぼの `project`・クエスト／プレビューの `town` は表示名ではなく町の鍵。地図の `repo` も同じ鍵を指す。既存の JSON 名・保存の形・URL は変えず、型と JSON の入口に短いコメントを置く。

| 経路 | 契約 |
|---|---|
| `POST /event` | AgentEvent を検証して受付。端末専用の Authorization Bearer から terminal を確定。合言葉なし／不一致は表示専用。Origin つき403、CORSなし。正常時204、不正入力400 |
| `WS /ws` | `event` / `replay`、`towns`、`names`、`quests`（一覧・端末の結び付き、各端末の参加クエストと役 `members`、`reports` は空。開いた会話の報告だけ HTTP で読む）、`pending`、`equipped`、`attention`、`permission` / `permission-resolved`、`party-notices`（仲間の確認・役割外の変更）。web からは `permission-decision`。札は未保存入力・操作フォーカスがある間、`quests` の受信でフォームを差し替えない（通信形式は不変） |
| `/api/agents` | 起動時に PATH で検出した種類（shell は常に含む）と町・再開・整理・途中のそうび変更の対応範囲の公開部分。出陣の窓は `hero: false` を「ターミナルのみ（勇者は出ない）」と表示。Codex は hero/resume/compact が true、信頼確認・許可の端末回答と、成否・証拠・MP が取れないことを明記 |
| `/api/equipment` | エージェントごとの武器（モデル）・アクセサリ（考える量）の読み込み済みマスタ |
| `/api/sessions` | 装備つき端末の一覧・作成・削除（一覧 GET は WS 切断後の認可確認にも使い、403なら新 URL を案内。形式は不変）、`/:id/say` で依頼（`steer` で作業中にもすぐ伝える。答え待ちの間は断る）、`/:id/action` で中断・整理・終了、`/:id/equip` で装備の持ちかえ（作業中は預かる） |
| `WS /pty?session=<id>` | 同じ端末の保持出力とライブ出力。web からは `input` / `resize`。停止の確認待ちでも人が調べて復旧できるよう入力を受ける |
| `/api/roster` | 旅立った勇者の一覧と `/:sessionId/recall` で再開 |
| `/api/names`, `/api/towns`, `/api/settings` | 名前、町の鍵で引く台帳・すがた、町をしまうまでの日数・`saveConversation`（既定 false） |
| `/api/mobile` と配下の `/pair`、`/confirm`、`/cancel`、`/devices/:id`、`/test-push` | 同じ Host／Origin／画面 token 検査。起動の有無、公開用アドレス、登録の最小情報と QR／SAS の表示・人の確認・取り消し。秘密鍵・端末公開鍵の台帳・通知 ID・連番は返さず、WS にも流さない |
| `/api/review?session=<id>` または `?quest=<id>` | GET 既知の端末／保存クエスト拠点の cwd・branch・短い HEAD・上流との差・変更一覧と行の増減。`mode=uncommitted`（既定）／`branch`、`base=<branch>`。comparison に候補・既定・選んだ元・mergeBase を返す。既定の元は origin/HEAD → main → master。成功した読み取りは `QuestLedger.reviewed` で記録 |
| `/api/review/verdict?session=<id>`（`quest` でも可） | POST `{verdict:"approved"|"changes",mode,base?}`。拠点は鑑定の読み取りと同じ選び方。サーバーが branch・HEAD・作業状態の指紋を読み、出来事 `verdict` に残す。窓を開いた記録（`reviewed`、「かんていを ひらいた」）とは別（段階21） |
| `/api/review/diff?session=<id>&path=<相対パス>`（`quest` でも可） | GET 同じ mode・base の1ファイルの unified diff、または binary／tooLarge の印。相対パスと実パスの両方で cwd の外を拒否。任意の cwd は受け付けない |
| `/api/quests` | GET 一覧（`?town=<鍵>` で町を限定、`writerSession?` は現在の書き換える役から算出）、POST `{town,title,purpose?}` で作成、DELETE 町ごと／すべての記録を削除 |
| `/api/quests/:id` | GET 出来事つきの札、PATCH `{title?,purpose?,state?}`、DELETE クエストと出来事・結び付きを削除 |
| `/api/quests/:id/adopt` | POST `{reason?,pr?}`（理由500文字まで、PR は https の URL だけ）。サーバーが保存拠点の branch・HEAD・作業状態の指紋と各ためすことの印を読み、出来事 `adopted` に残してから state を done にする。merge・push・PR 作成はしない（段階21） |
| `/api/quests/:id/assign` | POST `{session}` で同じ町の端末に結び付け、cwd・branch を既定の拠点にする。勇者は同時に1つだけ |
| `/api/quests/:id/party` | GET 勇者・役割・一言・書き換える役・状態・拠点・`active`（生存）・`canTalk`（会話対応）。プレビューは終了 writer を候補にせず、生存中の会話対応の仲間を人が選ぶ。POST `{session,role,note,writer?}` で人が所属と役割を変更。1人の勇者は1クエスト、指揮役・書き換える役は各1人まで | DELETE `?session=<id>` でパーティーから外す（勇者は止めない）。handoff で担当を移すと、前の担当（implement）は research の手伝いになる。クエストの担当（session・hero）は書き換える役を優先する（段階23）。
| `/api/quests/:id/tactic`, `/research` | GET 作戦・編成の合否・進み具合。POST `{tactic}` で作戦を選ぶ（足りない時・進行中は断る）。POST `{text}`（research）で調べてからを始める（段階24） |
| `/api/quests/:id/scroll` | GET `{text,reply?}`。台帳の事実だけの下書きと、差し込める直近の返事（本文保存なしならメモリだけ） |
| `/api/quests/:id/send`, `/summary`, `/handoff` | POST 人が直した紹介文／選んで内容を確認した定型文／巻物を、通常と同じ配送で送る。summary は画面で確認した `{text}` をそのまま使い、サーバーで再生成しない。handoff は `{session?,preset?,cwd?,text,writer?}`、新規出陣と書き換える役の移動は人の操作だけ。会話非対応の受け手は409、預かり・新規起動・所属変更の前に断る |
| `/api/party-notices` と `/:id` | GET 確認と警告、POST `{yes:boolean}` で仲間・役割の依頼に人が回答、DELETE で警告を既読に。画面用認可だけ |
| `/api/agent/quests/:id/read`（`:id=current` 可） | GET 自分のクエストの題・目的・条件・パーティー・出来事の要点。画面用トークンは使わず、Authorization Bearer と X-Agent-Session。Origin つきのブラウザ要求を拒否 |
| `/api/agent/quests/:id/note`, `/send`, `/invite`, `/review` | POST 自分の覚え書き（1〜2000文字）。指揮役だけ、パーティーへの依頼・人の確認待ちの仲間／役割変更・review への変更。done・dropped・削除・許可・他クエストの操作は拒否 |
| `/api/quests/:id/checks` | GET `{checks,fingerprint?,candidates}`（保存拠点、無ければ現在の書き換える役のフォルダから再読。他の端末で代用せず、読めなければ指紋なし）。証拠の `base?` と指紋の `base` は拠点のパス。POST `{name,command}` で条件を足す。実行 API ではない |
| `/api/quests/:id/checks/:checkId` | DELETE 条件を消す（過去の証拠は出来事として残る） |
| `/api/quests/report-link?hero=<id>&at=<時刻>` | GET 開いた会話の1返事の `{hero,at,quest,title}` または null。全報告のリンクは配信しない |
| `/api/quests/checks-report?session=<id>&at=<時刻>` | GET 報告時のクエストの条件・最新の証拠・今の指紋。報告とクエストの印は別の判定 |
| `/api/quests/:id/base` | POST `{session}` で同じ町の既知の端末の拠点を保存、DELETE で結び付きを外す（Git の branch は消さない） |
| `/api/worktrees` | GET `?cwd=<絶対パス>` で既存拠点・ローカル branch・HEAD の branch・既定の親、POST `{cwd,base,branch,path}` で作成、DELETE `{cwd,path}` できれいで勇者のいない拠点をたたむ |
| `/api/previews?quest=<id>` または `?town=<鍵>` | GET `{links,candidates}`、POST `{name?,url}`、DELETE `&id=<link id>`。literal loopback の HTTP(S) と 1〜65535 のポートだけ、Yushario 自身のポートを拒否。候補は自動で結び付けない |
| `/preview-link.js` | GET トークン不要の静的 JS。`yushario-preview` の `{url,title,errors,count}` を opener に知らせるだけ |
| `POST /hooks/permission` | Claude Code の HTTP フック。Authorization Bearer の端末へ結び付け、許可・拒否を返す。Origin つき403、CORSなし。合言葉なし／不一致は表示だけで `{}`（端末判断）、許可カードは作らない |

### server ↔ mobile: 独立した HTTP 窓口

`--mobile <host:port>` の時だけ、指定先へ別 listener を bind する（既定は停止）。`POST /mobile/v1` だけで `pair/status/permissions/decide/reports/push-token/unpair/towns/quests/quest-create` を扱い、既存の HTTP／WS 経路へ転送しない。正確な body・署名・暗号・一般拒否は `MOBILE-PROTOCOL.md`。`decide` は同じ `PermissionWaiter.decide` に通し、ブラウザとの先着1件だけを採る。`quest-create` は登録済み町の不透明 ID を窓口内だけで解決し、同じ `validQuestPatch` と `QuestLedger.create` で未着手の札だけを作る（送信・担当・出陣はしない）。要求 ID を作成前に耐クラッシュ予約し、端末ごと5件/60秒に制限する。`reports` はクエストの題と、保存済みまたは同じ勇者・時刻のメモリ返答を最大8000文字で返す。内部のパス・cwd・branch・コマンド出力のフィールドは返さない。
Mac の「スマホ」は起動時だけ表示し、5分の QR／コピー文字列、6桁 SAS の承認／拒否、端末の取り消しを既存の認可済み API で行う。QR の符号化だけ `qrcode-generator`（依存なし）を使い、自作しない。開いている間だけ状態を読む。端末ごとの通知結果と固定文言のテスト送信もこの認可済み画面だけに置き、receipt の成功を端末の表示・閲覧と混同しない。

### web 内: 描画データと端末の接続

本番・モックは `src/web/rpg/app.html` と `rpg/main.ts`（Scene・Status・会話・クエスト・本番CSS）を共用する。モック用の偽データとHTTP／WS応答は `src/web/art/*` に閉じ、モック専用のサイドバーや詳細の開閉処理は作らない。モックが置き換えるのは既存HTTP／WS境界だけで、本番のコードはモックの通信処理を読み込まない。紹介サイトは本体リポジトリの管理・配布対象に含めない。
町の端末窓と `/terminal.html` は `src/web/terminal.ts` の接続部品を共有する。
戦闘の `Focus.status[].name` は完全な名前を渡し、`drawFocus` の描画時だけ省略する。HTTP／WS の API 形式は変えない。
画面専用の選択・開閉・下書きは各画面の中に置き、汎用ストアやイベントバスは作らない。
図書館・道具屋は `town/library.ts` / `shop.ts` の小さな共有描画。`bg-library.library` / `bg-shop.shop` の枠・当たり判定・報告位置・NPC・出口を描画とクリックで共用し、図書館だけ読む／探すの枠を分ける。背景内の家具は描き直さず、NPC→勇者→名札・装備・報告の順に重ねる。`Sheets.variant` は既存の `hero-model.recolor` を継承する。室内の人物は部屋ごとの定数（図書館1.5・道具屋1.7）で拡大して描き、当たり判定・報告位置・通知の矢印も同じ倍率に合わせる。店主・司書のクリック会話は神父と同じ `localHotspots` の1つの経路（`talk`）で処理する。超過人数の札は `town/field.ts` の `overflowPlate` を全室・全フィールドで共有する。新しいAPI・汎用室内エンジンは設けない。

`rpg/main.ts` の `scene`・起動完了 `started` と、既存の移動処理 `Scene.go` をモックの外側パネルから使用する。場面ボタンをアプリ本体へ入れたり、テスト用イベントバス・描画層・汎用DIを挟んだりしない。HTMLの変更はViteの共通差し込みで3入口へ反映し、開発時は共通HTMLの変更でページを再読み込みする。

| web 内の既存 API | 契約 |
|---|---|
| `initSideTabs().show(tab)` | パネル・`aria-selected`・`tabIndex` をそろえる。クリックと左右矢印・Home・End が同じ選択処理を使い、キー操作時だけフォーカスも移す |
| `initQuests(...)`, `pickPartyNotice(...)` | 開いている窓のresizeで既存の `coverMap` を再実行する。内容のDOMを作り直さず、入力・フォーカス・スクロールを保つ。仲間の確認窓はcloseでresize監視を外す |
| `checkMarks(...)`, `previewControls(...)` とクエスト・仲間・町プレビューの窓 | 名前の無かったdialogは見出しに一意のIDを付け、`aria-labelledby` で参照する。HTTP・WS の形式は変えない |

## 寿命・保存・セキュリティ

- ブラウザ用 server は `127.0.0.1` のみ（別 listener のモバイル窓口だけが明示したアドレスを使う）。起動ごとにランダムなトークンを作り、URL に表示する。token ファイルは読まず・書かず、残っていても使わない。開発時だけ明示的な `AGENT_CHARACTER_TOKEN` 指定を許す。ブラウザを自動で開く（`--no-open` で無効）。既定8790／`--port`／`PORT` から、使用中なら次の空きポートを実際に bind して使う。
- npm パッケージの allowlist は `dist/`・`lib/`・Claudeフック・bin・`LICENSE`・`NOTICE`。ライセンスと通知はブラウザ配布用の `dist/` にもコピーする。アダプタはパッケージの絶対パスから読み込み、ソース・テスト・作業用ファイル・利用者データを同梱しない。
- HTTP・WS Upgrade の入口で Host を `127.0.0.1:<実ポート>`／`localhost:<実ポート>` に限定する。Vite proxy は Host を転送先へ変更する。WS `/ws`・`/pty` と `/api/*` はトークンと自分自身の Origin を検査する。WS は Origin 必須、HTTP API の Origin 無しリクエストはトークンで許可する。開発時だけローカルの別ポートも許可する。
- フックの `POST /event`・`/hooks/permission` は画面用トークンを使わず、端末の `AGENT_CHARACTER_AGENT_TOKEN` を Authorization Bearer で受ける。Claude HTTP 許可フックは公式の `headers`・`allowedEnvVars` で環境変数を展開する。すべての Origin つきを拒否し、CORS は返さない。合言葉なし／不一致の知らせは terminal・branch・command を外し、agent を `external:` 名前空間にして描くだけ。台帳・パーティー・証拠・許可・失効・PTY へは渡さない。本文の上限は1MiB、端末作成・町の設定は4KiB、端末操作は64KiB（UTF-8バイト、超過は413）。Claude の command フック stdin も1MiBで、超過時は無言で正常終了する。
- 再開による所属移動は、画面の「よびもどす」で起動した端末の `recalledHero` と SessionStart の hero が一致し、旧端末が終了／削除済みの時だけ。recalledHero はメモリだけで DB に保存しない。ほかの端末の既知の hero を名乗るフックは表示専用に落とす。
- サーバーの Git は `core.fsmonitor=false`・`core.hooksPath` を null device に固定し、global/system 設定と継承した `GIT_*` を使わない。repo の filter 名を `git config` で読み、clean・smudge・process を空、required を false に上書きする。外部 diff・textconv も読み取り側で無効化する。filter による変換を行わない拠点なので、必要な準備は人が端末で行う。同一利用者による同時の設定差し替え、PATH 上の git 自体の改変は隔離しない。
- モバイル窓口は Origin つきを拒否し、CORS／ブラウザ token を使わない。1MiB 上限・送信元 IP／登録端末ごと毎分30件・コード3失敗で失効・最大5台。`0.0.0.0`／`::` は起動時に警告する。公開インターネット向けにはしない。
- `AGENT_CHARACTER_HOME/mobile/` は0700、鍵・台帳・判断の記録は0600。連番を操作／応答の前に一時ファイル＋fsync＋rename＋ディレクトリ fsync で保存し、同じ台帳を2プロセスが使わないよう lock する。破損では停止し、連番を初期化しない。バックアップの古い台帳へ戻す場合は Mac 鍵も作り直し、再登録する。通知は固定文言だけで、失敗は本文／通知 ID を出さず短く記録する。
- PTY はブラウザ切断では止めない。明示的な終了・CLI の終了・server の停止で終わる。最大16セッション、各出力の直近256KBを保持する。切り捨てた部分で有効になった端末のモード（pi の別画面・マウスなど）は覚えておき、開き直した時に先に送る。
- 起動時に検査した CLI の絶対パスを保持し、別の作業ディレクトリでも同じパスを起動する。子プロセスに `AGENT_CHARACTER_URL`・`AGENT_CHARACTER_SESSION`・`AGENT_CHARACTER_PROJECT` を渡す。Claude フックは渡された project を使い、外部起動でその値が無い時だけ git から調べる。transcript_path が無い Stop は再試行しない。server のトークンや親の入れ子セッション判定用変数は渡さない。
- Codex は利用者の設定ファイルを書き換えず、`-c features.hooks=true`・`-c hooks.<Event>=[...]` と `--no-daemon` を付ける。後者は共有デーモンに別端末の合言葉を継承させないため。`/hooks` の信頼確認と管理者制限を迂回しない（初回はターミナルで確認・依頼）。`notify` は重複するため使わず、transcript・画面・出力の解析もしない。Codex 用の保存表・利用者設定は足さず、会話と報告は既存の保存方針のまま。PostToolUse の成否の契約がないので、自動証拠は作らない。
- イベント全体2000件・会話窓の本文と報告・預かり・端末出力はメモリのみ（永続クエストの要点は別）。履歴があふれた時は、最も多く持つ勇者の古いイベントから捨てる。活動中の勇者の最初のイベントと最後の本体の UserPromptSubmit は保護し、SessionEnd 済みの勇者は保護しない。サーバーを再起動すると消える。往復は進行中だけ累積し、遅着補正用のイベントは直近256件まで（それ以前への遅着は集計しない）。ファイル名は往復ごと最大256件、ツール・テスト・失敗の累計は切り捨てない。完了した札は通常の新イベントで数え直さず、直近範囲への遅着時だけ補正する。
- Esc と `action: interrupt` は `Interrupt`（停止の要求）を記録し、300ms経過を待機の証明にしない。Room の `stopRequestedAt` と PTY の `interrupting` は、その後の本体の SessionStart・Stop・StopFailure・PostCompact・SessionEnd・InterruptConfirmed だけで解除する。古い／仲間の知らせ・tool完了・idle通知では解除しない。未確認の間は新しい say・そうび・action を断り、端末を直接操作して確かめられる入口を残す。札・会話は30秒後も停止扱いにせず「まだ とまったか わからない」と表示する。状態はメモリだけで、ブラウザの再接続はイベントの再送から戻す。
- 終了した仲間は勇者ごとにIDと終了時刻を最大256件までメモリで覚え、遅いtool／古い開始で復活させない。同じIDを使うには終了より新しい明示的な SubagentStart が必要。生存中の仲間にも最新の開始／活動時刻を持ち、それより古い Stop では消さない。本体の SessionEnd で破棄し、上限超過時は最古の終了時刻から捨てる。
- 地図・戦闘の名前の省略は描画時だけ。保存済みの名前・イベント・API の値を切らず、省略した文字列も保存しない。
- 町・設定・名前・再開用のめいぼは `AGENT_CHARACTER_HOME`（既定 `~/.config/agent-character`）の JSON に保存する。町の最終活動時刻はメモリで更新し5秒おきと終了時にまとめて保存、時刻だけの変更では台帳を配信しない。登録・すがた・ピン・しまう／戻すはすぐ保存・配信する。本文は保存せず、一時ファイルから置き換える。壊れたファイルは `.broken` に退避する。
- 町の内部の鍵は `git rev-parse --path-format=absolute --git-common-dir` の実パス（非 git はフォルダの実パス）。worktree は同じ鍵、同じ短い名前の別リポジトリは別の町。表示には親フォルダ名を添える。`towns.json` は起動時に保存済み path から鍵へ移し、読めない path は旧名のまま次の登録を待つ。セッションのイベントの project はサーバーが鍵に直す。
- 仕事の台帳は `AGENT_CHARACTER_HOME/yushario.db`。`quests`・`quest_events`・`quest_sessions`・`quest_party`・`quest_checks`・`quest_check_evidence`・`quest_previews` を保存し、`quest-migrations.ts` の配列と `PRAGMA user_version` だけで版を上げる。既存の移行1・2は変えず、移行3に party/checks/previews の作成・旧所属の取り込み・古い証拠表の base/capture 列追加をまとめる。移行4で条件の `latestEvent`（最新証拠の出来事ID、削除時NULL）と報告検索の索引を足し、時刻・rowid順で最新を一度だけ埋める。旧い複合コマンド／200文字で切れた証拠の成否は不明へ直す。各移行と版番号の更新は1つのトランザクションで行い、失敗時はロールバックする。版2で追加表が既にある DB も同じ列・索引・外部キーへ移し、保存クラスは毎起動の表作成・列追加・取り込みをしない。題・目的・状態・時刻・担当・報告の集計と見出しはいつも保存し、依頼／返事の本文は `saveConversation` が true の時だけ。許可の全文・端末／ツールの出力は保存しない。削除は外部キーの CASCADE で出来事・結び付きも消し、secure_delete を使う。DB は 0600。再起動で一覧と札は戻るが、会話窓を DB から再構成しない。DB を開けない・読めない時は起動を止め、bin が実パスと「消さずに退避して、別の AGENT_CHARACTER_HOME で切り分け」を日英で案内する。DB の自動削除・作り直しはしない。
- パーティーは `quest_party`（移行3で作成、クエスト削除で CASCADE）。セッションを主キーにし、指揮役と書き換える役にクエストごとの一意索引を置く。移行3で1回だけ旧 `quest_sessions` から取り込み、所属・再開時に同表とそろえ、`quests.session`・`hero` は最初の「じっそう」を指す。書き換える役の移動とは別。`writerSession` は `quest_party` から返す値で列は足さない。役割・一言・覚え書き・出来事の要点は保存し、依頼・紹介文・巻物の本文は `saveConversation` に従う。
- `AGENT_CHARACTER_AGENT_TOKEN` は PTY ごとに生成する32バイトの乱数で、DB・公開セッション情報・WS に出さない。固定長の形式を core で検査し、server で32バイトを `timingSafeEqual` する。端末・会話が終了／旅立ち中なら拒否。画面用のトークンは従来どおり子へ渡さず、`AGENT_CHARACTER_QUEST_TOOL` と一時 PATH の `yushario`、道具の説明書 `skills/yushario-party/SKILL.md` の場所 `AGENT_CHARACTER_QUEST_SKILL` を渡す。仲間の依頼（最大32件）と警告、差し込む直近の返事はメモリだけ。指揮役が去った依頼は失効し、人の「はい」より前に出陣・役割変更しない。
- セッションごとの判断待ち・往復・依頼重複の覚えは終了時と端末削除時に破棄し、クエスト削除時は所属セッション分と指紋・読み取り世代・直近の返事も破棄する。パーティーの編集観測・警告済みの覚えはセッションごと直近256往復まで、終了時に破棄する。未読の警告本文は端末ごと1件（生存端末は最大16件）にまとめて件数と最新のクエストへの入口を出し、個々の事実は台帳の出来事に残す。許可音の既知IDはページ内の最近256件だけ。画面では会話非対応の受け手を「ターミナルのみ」として選べなくする。
- 指揮役の依頼は `say` の通常の預かり・配送を共有し、`PartyRequest`（`detail` は指揮役の表示名）を会話へ出す。実際の UserPromptSubmit が来ても同じ行を重ねず、起動前の勇者には到着後に表示する。役割の外の編集は成功した編集フックからすぐに知らせ、遅着時は報告のファイル一覧でも補う。1往復につき1件だけで、CLI を止めない。
- ためすことは `quest_checks`、証拠は `quest_events` の `check` 出来事と `quest_check_evidence` に保存する。両表と索引は移行3で作る。証拠の `base`（その端末の拠点）と `capture`（保存ごとの乱数ID）は、移行3の中だけで `PRAGMA table_info` を使って未作成を確かめ、古い表へ `ALTER TABLE ADD COLUMN` する。古い証拠は残すが、拠点が無いので合格にしない。条件名・コマンドの形、証拠の先頭200文字・成否（既存の passed INTEGER は1/0、不明は-1）・時刻・勇者・一致した条件ID・指紋・拠点は `saveConversation` に関係なく保存し、クエスト削除で両表とも CASCADE する。遅れた指紋は出来事ID・capture・親クエストが一致する未付与の証拠だけに付け、削除後のrowid再利用でも別の証拠を変えない。captureは配信しない。
- 指紋は `rev-parse --verify HEAD` と `diff HEAD --no-ext-diff --no-textconv --binary`、未追跡の NUL ファイル一覧と本文を SHA-256 にした物。未追跡は256ファイル・本文の合計1MiBまでを有界読み取りし、上限超過・読取失敗・シンボリックリンク・範囲外は不明。本文は保存も配信もしない。git は execFile・5秒・1MiB上限。比較先は保存拠点、無ければ現在の書き換える役だけ。指紋に実パスを含め、別拠点の証拠を合格に使わない。`/event` の記録・配信と証拠の作成を先に終え、git を待たずに証拠の端末を読んで後から付け、比較先は別に読み直す。遅い読み取りで新しい指紋を上書きしない。今の指紋はメモリだけで、拠点／所属の変更で捨て、クエスト・鑑定・報告を開く時と Stop で読み直す。不明なら「じょうたい ふめい」。done は画面で一言確かめるが、人の判断を止めない。
- 拠点の path・branch は SQLite のクエストの `worktreePath`・`worktreeBranch` に保存し、`QuestLedger.setWorktree(id,{path,branch})` で結び付ける。たたんだ拠点の結び付きは外すが branch は Git に残す。worktree は Git 自身が管理し、別の台帳は作らない。`execFile` の引数で `check-ref-format --branch`・`worktree add -b`・`worktree list --porcelain -z`・`worktree remove` を呼ぶ（5秒・1MiB上限、force なし）。新しい置き場所の既存フォルダ・既存拠点内・別のリポジトリ内・シンボリックリンクの親を確かめる。撤去中は同じ場所への端末作成を断り、活動中の端末（shell も含む）と未追跡も含む変更があれば撤去しない。フックの記録は git の読み直しで待たせず、branch の更新は次のイベント／一覧に使う。
- 同じ同期処理内の台帳変更は1回の `queueMicrotask` にまとめて一覧を構成・配信する（close後は配信しない）。`QuestDatabase.summary`／`QuestLedger.summary` は出来事・条件・証拠を読まない札、`reportsAfter` は遅着補正に要る報告だけを返し、日常のフック記録で全クエストの全出来事を数え直さない。現在の所属はセッション主キーの party member で引く。配信済み一覧のID集合を `Party.prune(knownQuests)` に渡し、クエストごとの再問い合わせを避ける。`list()` は書き換える役・条件と最新の証拠を一括で読み、`CheckDatabase.listAll()` は `latestEvent` への結合で条件ごと1証拠だけ読み、履歴件数を走査しない。証拠の保存と最新IDの更新は同じsavepointで行い、遅着はより新しい証拠を上書きしない。出来事・全証拠の詳しい本文は札を開いた時だけ読む。報告リンクは索引で1返事を引き、毎回の snapshot には載せない。
- `QuestLedger.current(session)`・`addEvent(id,{kind,at,title,...})`・`reviewed(session,at,questId?)` は鑑定側からも直接呼べる。出来事の要点は core の往復集計から保存し、直近範囲の遅着で補正する。`done`・`dropped` はフックで上書きしない。
- 許可は id ごとに最大16件、独立した120秒の期限で待つ。再接続では全件を再送し、ブラウザがすべて切断し登録スマホもなければ全件を端末判断へ戻す（登録スマホがある場合も120秒の期限は延長しない）。コマンド／パスの表示は待っている間だけ2000文字まで保持し、超過時は画面での許可を禁止する。履歴・ログには短い要約だけを渡す。
- 報告の出来事は `result: {cwd,branch?,head?}` を持つ。既存の `quest_events.report` JSON の任意の result キーに保存し、API では集計 report と分けて返す（列・移行の追加なし）。Stop はまず cwd と報告を保存・配信し、安全な Git 読み取りで branch・短い HEAD を後から元の出来事に付ける。遅着の集計補正でも result は保つ。割当・再開の出来事にも cwd を保存し、worktreePath が無い時は最後の割当（無ければ報告）の保存 cwd を鑑定に使う。新しい仲間の報告だけでは割当先を変えない。古い記録に cwd が無ければ不明の理由を出す。保存済みのパスの実在・Git 作業ツリー・町の共通 Git ディレクトリを確かめ、別の生存端末では代用しない。
- 鑑定は `execFile` の git 読み取りだけ（シェルを通さない）。外部 diff・textconv・色を無効にし、各コマンドは5秒、出力は1MiBまで。未追跡の内容は選んだ時だけ読み、バイナリ・1MiB超は本文を返さない。絶対パス・`..`・外向きのシンボリックリンクを拒否し、差分の本文は保存しない。編集後の最後のテストが成功した報告だけ宝箱、未実行・失敗は巻物。見出しは core の `reportTitle` を画面と台帳で共有する。
- エディタ（なし＝パスをコピー／VS Code／Cursor）と報告の鑑定済み印（勇者IDと時刻、直近200件）は localStorage。ファイルを開く操作は URL／クリップボードだけで、サーバーに開く API はない。
- プレビューの名前・URL は同じ SQLite の `quest_previews` 表（表と索引は移行3で作成、既存 quests 列は変えない）。クエスト削除時は FK CASCADE、町／全記録の削除時は町用の結び付きも削除する。端末の候補は最大20件・未完行8KiBのメモリだけ、ページの知らせ・エラー・下書きはブラウザのメモリだけ。表示中の区画の URL／候補は2秒ごとに読む。通知は `window.open` が返したそのクエスト／町のタブ（閉じていない WindowProxy）と `event.source` が一致し、結び付け済み URL と同じ origin・同じ origin の通知内 URL の時だけ受ける。タブの参照はメモリだけで、結び付き／クエストを消した時に捨て、外部へ送らず、下書きを自動送信しない。クエストの下書きの宛先は生存中で会話対応の `writerSession`、使えなければ人が生存中のパーティーから会話対応の勇者を選ぶ。終了した端末は候補に出さない。選択はページ内だけで、保存済みの writer・役割・DB の形を変えず、自動配送もしない。実装役の有無では入口を消さない。
- サイドバーの選択タブは既存のlocalStorageキーだけを使い、矢印移動用の保存は足さない。窓の見出しIDはDOMの寿命だけ。クエスト・仲間の窓のresizeは同じDOMの寸法だけを更新し、未保存入力・フォーカス・スクロールを保存先へ送らない。
- 一覧のフォーカス・町ごとの折り畳み・スクロール位置と、出陣の読込中のフォーカスは DOM 内だけで引き継ぎ、DB・設定・localStorage に足さない。認可切れの案内もページ内だけで、古い合言葉の再利用・保存はしない。
- 既読は勇者IDと時刻だけをブラウザに保存する。会話の下書きはページ内だけ。クエスト札の未保存の題・目的・ためすことも開いている札のDOMだけに持ち、背景の更新や遅い初回読み取りで消さない。閉じると破棄し、保存・追加を選ぶまでAPIへ送らない。各 CLI 自身の履歴保存は別。

## PoC でやらないこと

- ハーネス本体、アプリ自身の LLM 呼び出し、ツール出力・会話本文の意味の解析（返事のマークダウン表示だけは行う）
- デスクトップ常駐・透過ウィンドウ、スマホでの町の表示、インターネットへの公開、ユーザー認証（スマホの別アプリと、LAN・Tailscale 上のモバイル窓口は `docs/MOBILE.md` の範囲だけ行う）
- 任意の起動コマンド、許可の自動承認、作業中へのフック経由の割り込み
- 過去のハーネス履歴の取り込み（仕事の台帳と、選んだ時の会話の保存は段階14から行う。ワークツリーの作成は段階17から行う）
- プラグイン機構・ファクトリ・DI コンテナ・汎用基底クラスなど、現在の境界にない拡張の基盤
