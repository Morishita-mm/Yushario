# A2：モバイルの依頼・出陣・パーティー出発

- 実施日：2026-10-23 UTC（日本時間は翌24日）。実装コミット：Yushario `950ea0a807ee3fa5625835b23dad10637f80a81b`、`feat/mobile-quests`。
- アプリ：`ae153a20153d9003e81804867c9c8fe59f6daa68`、`main`。アプリの `docs/PROTOCOL-SOURCE.md` で上の実装コミットを固定。
- この記録とチェックリスト更新は、実装コミットの後の文書コミット。push はしていない。
- 環境：macOS arm64、Node `26.4.0`、npm `11.17.0`、Vitest `4.1.12`。
- **追加依存なし**。ネイティブモジュール・Expo 設定変更なし、development client の再ビルド不要、EAS ビルドなし。
- アプリの `src/screens/*`、`App.tsx`、`src/ui.tsx` は変更していない。アプリ画面は後続 UI 担当の範囲。

## 実行結果

| リポジトリ | コマンド | 結果 |
|---|---|---|
| Yushario | `npm run typecheck` | 成功 |
| Yushario | `npm test` | **66ファイル・848検査 成功** |
| Yushario | `npm run build` | Vite web / server / adapters 成功 |
| アプリ | `npm run typecheck` | 成功 |
| アプリ | `npm test` | **3ファイル・44検査 成功** |
| アプリ | `npm run export:android` | Android JS/Hermes bundle・assets の export 成功 |
| 両方 | `git diff --check` | 成功 |

共有ベクトル SHA-256：`d370db0b549d226d992aef9ca7dbc945e280589bd05e24e818e7f5674709cdb2`。両リポジトリの JSON は一致し、Node と noble で全要求／応答の署名・暗号値を照合した。`mobile-work.ts`・`mobile-work-display.ts` と `docs/MOBILE.md` の同期も確認。

最終確認前の並列実行では、既存 SEC-12 の ephemeral port の受け渡し競合、既存 push-log の400回 fsync の5秒 timeout、既存 SEC-11 の隣接ポートを別検査が使う競合が各1回出た。検査条件や timeout を緩めず、`vitest.config.ts` で **ファイル単位だけ直列化**した後、通常の `npm test` は複数回成功。各検査内の並行 HTTP／重複 ID の競合検査は残している。

## SEC-21〜23 の証拠

検査は `AGENT_CHARACTER_HOME`・HOME・git 設定を専用一時ディレクトリに隔離し、空きポートで本物の relay、HTTP、暗号、SQLite、PTY を起動する。CLI は一時 PATH の実行可能な Node 製 `claude/codex/pi` fixture（**実 LLM ではない**）。実プロセスで argv、bracketed paste、認証付き SessionStart/UserPromptSubmit/Stop、割り込み後の ready を確認し、終了時に子プロセスと一時データを片付ける。既存の8790/8792/8799/8081・エミュレーターは停止・変更しない。

- **SEC-21** — `src/server/mobile/security-capability.test.ts`（4件）：既定 off、永続化、旧台帳の移行で鍵・連番を維持、不正な値で停止、Mac の strict な `{enabled:boolean}` と端末不明／method 拒否。
- **SEC-22/23** — 下記5検査ファイル（計26件）と共通 fixture：
  - `security-work.test.ts`：安全な候補、Pi の新規起動なし・既存 Pi の `permissionGate:false`、off の拒否、作るだけ／担当付け／送信、Claude/Codex の強制 argv、出陣だけでは送信しない、各 helper の依頼と owner の本題。
  - `security-work-inputs.test.ts`：町・勇者・拠点・preset・装備の未知／別町／生 ID、cwd・args・env・command・sandbox・bypass 欄、空／8001文字、8000文字の受け付け、不正／期限切れ ID、未知 operation。IP の30件枠で拒否を代用しないよう別 fixture に分ける。
  - `security-work-limits.test.ts`：同時重複、再起動・別端末・別 operation でも ID 再利用不可、5変更/分・2実行/分・1出陣/分・3出陣/時・端末ごと2生存勇者・全体16 terminal。長い窓は **検査用 reservation の時刻だけを古くする**方法で確認し、実時間1時間経過の試験とはしていない。
  - `security-work-tactics.test.ts`：調査の個別指示と全員終了後の owner への1回配送、レビューの遅延、しきへの本題、fit と役割の拒否、off の保存で実 Stop が来ても作戦が発火しない、しき付与／忙しい勇者の付け替えの opt-in と実行枠。
  - `security-work-crash.test.ts`：未出発の下書き消失／再入力、部分出発の再起動後拒否、`unknown` を再送しない、破損 journal で起動停止、作業ファイルに依頼文／helper 指示を保存しない。
- 部分配送は実際に helper を割り込み状態にして pending に残し、実 Stop 後に新 requestId でその helper だけを配送し、先に配送した owner を再送しないことを確認。
- `unknown` の crash window は **検査用 journal にその状態を置いて再起動**する検査。送信の瞬間の SIGKILL・電源断を実施したという主張ではない。
- 各拒否は HTTP 400 `{"error":"rejected"}`、DTO に内部パス／branch／settings／token が出ないことを確認。文中に人が書いた秘密を自動墨消しする仕様ではない。
- 純粋な `src/core/mobile-work.test.ts` は shape・境界・余分な欄・固定配列順・保守的な本人確認 predicate を検査。A1・暗号・連番・許可・報告保持の既存検査も全件実行。

## 危険性と採用した境界

A1 の「スマホからエージェントを起動できない」という T16/SEC-18 の全体前提は撤回した。旧 `quest-create` は今も札だけだが、A2 は明確に遠隔実行の入口である。

1. **Mac の設定**：ヘッダー「スマホ」→登録端末→「スマホからの依頼・出陣を許可」。既定 off、オンには警告と確認。認可済み Mac API `POST /api/mobile/devices/:id/work {enabled:boolean}`。スマホ側からオンにできない。
2. **保存に見える操作も分類**：しき役の付与、忙しい勇者、送信／装備変更が待つ勇者、別クエストからの付け替えは送信と同じ allowWork／実行枠の対象。待機中・未割当・しき以外の通常編成は off でも可能。作戦と helper notes は保存だけでは有効化せず、認証済み出発で一度だけ有効化する。
3. **アプリの毎回の OS 確認**：勇者／launch つき prepare（only/party も含む）、空でない form、すべての embark/depart。Mac ごとの直列キュー内で連番予約の直前に `LocalAuthentication.authenticateAsync`、strong biometrics・confirmation・端末資格情報への fallback。拒否なら連番も HTTP も使わない。
4. **Keystore 非採用の判断**：インストール済み SecureStore の `requireAuthentication` は Android の AES wrapping key を認証に結び付けるだけで、Ed25519 署名を Keystore 内で行う API／遠隔 attestation はない。seed は JS に出て noble が署名する。PIN fallback のない wrapping-key 認証を足しても要求ごとの署名証明にはならないため採用しない。改造アプリ・鍵窃取者は OS 確認を飛ばせる。Mac の allowWork・制限・取り消しが主要な境界。
5. **新規出陣**：既存拠点と発行済み opaque ID のみ。Claude `--permission-mode default`、Codex `--ask-for-approval untrusted --sandbox workspace-write` を装備引数の後ろに強制。通常の per-tool allow rule は引き続き効くので「全ツールで必ず確認」とは言わない。新規 Pi はサーバーでも拒否。Mac 起動済み Pi は利用可能だが `permissionGate:false` を UI で警告する。
6. **予約と配送**：A1 と同じ要求 ID 名前空間（10分・未来60秒）。全変更5/60秒、実行2/60秒、出陣1/60秒・3/時・端末2生存勇者・全体16 terminal。失敗した予約も枠を消費し得る。各 step は配送前に unknown を fsync し、pending のみ人が新 ID で再開する。unknown／完了の再送なし、再起動後の未完了は uncertain として再開しない。
7. **保存と監査**：最初の全文目的（8000文字）は意図したクエストのメタデータとして永続化する。form で編集した本文と helper の指示はメモリだけ。journal は ID／状態と、保存しないプロセス鍵による HMAC だけ。フォーム／出発のメタデータは各1000件までで自動削除なし。監査は `{deviceId,operation,questId,heroId,time}`、0600、32KiB×2、本文なし。試行記録であり配送完了証明ではない。Mac「スマホ」に直近50件、ヘッダーに未読数（ページ読込・ダイアログ中の取得時に更新）。
8. **範囲外**：live/redo の編成、引継ぎ、呼び戻し、採用／取消、クエストの編集／削除、新規 worktree。Mac の明示的な操作による既存機能は変えていない。

## UI 担当への API 引継ぎ

暗号、署名、nonce、連番永続化、時刻検査、HTTP 自動再送なしは従来どおり。完全な shape と署名配列は両リポジトリの `docs/MOBILE-PROTOCOL.md`。

| operation | 入力の概要 | アプリ関数・戻り値 |
|---|---|---|
| `quest-options` | `{townId}` | `getQuestOptions(mac,townId)` → `{allowWork,heroes,bases,presets}` |
| `quest-draft` | `{questId}` | `getQuestDraft(mac,questId)` → draft |
| `quest-prepare` | `{requestId,townId,text,mode,heroId,launch}` | `prepareQuest(mac,input)` → `{draft,heroId,delivery}` |
| `quest-form` | `{requestId,questId,text,members,tactic}` | `saveQuestForm(mac,input)` → draft |
| `quest-embark` | `{requestId,questId,launch,role,writer}` | `embarkQuestHero(mac,input)` → `{draft,heroId}` |
| `quest-depart` | `{requestId,questId}` | `departQuest(mac,input)` → draft |

- requestId は既存 `newQuestRequestId()` を明示操作1回につき1個。二重押下を抑止し、応答消失後に新 ID で同じ作成／出陣を自動再試行しない。`GatewayError` は既存 `unreachable|rejected|version|invalid`、`AuthenticationError` はローカル確認失敗。一般の storage Error もあり得る。エラーは未実行の証拠ではない。
- mode は `only|send|party`。1行目は core `questTitle`、全文は目的、8000 UTF-16単位。hero と launch は同時指定不可。launch は mode send のみだが、Mac と同じく**作成＋出陣＋担当付けまで**で、本文はまだ送らない。出発は別途明示する。
- Launch は `{baseId,presetId,weaponId,accessoryId}`。ID は候補から選ぶ。町／勇者／拠点／preset／装備 ID は再起動で無効、questId は永続 UUID。
- FormMember は `{heroId,role,writer,ask}`。writer 最大1名、しき最大1名、role は implement/research/review/command。担当には本題、helper にその helper の ask を送る。担当の ask は使わない。
- WorkHero は Mac と同じ重複番号・名前上書き、種類／装備の表示名、busy/canTalk/active/questId/permissionGate を返す。Pi の警告はアプリ画面で実装する必要がある。
- fit（obey/review/research/delegate）と gaps／inside／outside を表示できる。選んだ作戦は出発まで staged。departure の sent/held/deferred は受け付け済み、pending は再開可能、unknown は再送禁止。
- 再起動後 `draftLost:true` は未保存の本文／helper 指示の消失。未出発なら入力し直して form を保存できる。未完了出発が uncertain の場合は再編成／再出発せず Mac で確認する。
- UI と実機による生体認証／Pi 警告／通知の確認は未実施。Node 製 fixture の argv 検査は、実際の Claude/Codex の全バージョンでの許可ダイアログ保証ではない。SEC-09/17、MobSF、実機・電源断、全体のリリース承認は未完了のまま。

## 変更ファイル（実装コミット）

Yushario（41ファイル）：

```text
docs/ARCHITECTURE.md
docs/MOBILE-PROTOCOL.md
docs/MOBILE.md
docs/mobile-protocol-vectors.json
docs/security/checklist.md
docs/security/threat-model.md
scripts/mobile-vectors.mjs
src/core/mobile-display.ts
src/core/mobile-protocol.test.ts
src/core/mobile-protocol.ts
src/core/mobile-work-display.ts
src/core/mobile-work.test.ts
src/core/mobile-work.ts
src/server/mobile/api.ts
src/server/mobile/data.ts
src/server/mobile/gateway.ts
src/server/mobile/operations.ts
src/server/mobile/quest-requests.ts
src/server/mobile/quests.ts
src/server/mobile/security-capability.test.ts
src/server/mobile/security-startup.test.ts
src/server/mobile/security-work-crash.test.ts
src/server/mobile/security-work-fixture.ts
src/server/mobile/security-work-inputs.test.ts
src/server/mobile/security-work-limits.test.ts
src/server/mobile/security-work-tactics.test.ts
src/server/mobile/security-work.test.ts
src/server/mobile/store.ts
src/server/mobile/work-audit.ts
src/server/mobile/work-catalog.ts
src/server/mobile/work-departure.ts
src/server/mobile/work.ts
src/server/pty-launch.ts
src/server/pty.ts
src/server/relay.ts
src/server/tactics.ts
src/server/worktrees.ts
src/web/rpg/mobile-api.ts
src/web/rpg/mobile.css
src/web/rpg/mobile.ts
vitest.config.ts
```

アプリ（13ファイル）：

```text
docs/MOBILE-PROTOCOL.md
docs/MOBILE.md
docs/PROTOCOL-SOURCE.md
docs/mobile-protocol-vectors.json
docs/security/checklist.md
docs/security/threat-model.md
src/gateway.ts
src/protocol/index.ts
src/protocol/mobile-display.ts
src/protocol/mobile-protocol.ts
src/protocol/mobile-work-display.ts
src/protocol/mobile-work.test.ts
src/protocol/mobile-work.ts
```

この後続文書コミットは本ファイルと `docs/security/checklist.md` のみ。利用者の鍵・設定・会話・通知 token・google-services.json・ローカルデータは追加していない。
