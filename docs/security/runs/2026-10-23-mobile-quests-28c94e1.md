# A1: モバイルのクエスト発行・報告確認

## 対象と結果

- 実施日：2026-10-23（ローカル）。本体実装：`28c94e1`（`feat/mobile-quests`）、アプリ実装：`e5d7c8c`（`yushario-mobile/main`）。push はしていない。
- 実行環境：macOS、Node 26.4.0、npm 11.17.0、Vitest 4.1.12、本体 Vite 8.3.4。
- 追加依存：なし。暗号・登録・連番の既存処理はそのまま使用した。
- 画面、App.tsx、src/ui.tsx は変更していない。ポート8790の利用者環境、開発8792/8799、Metro8081は操作・停止していない。HTTP検査は一時HOMEと空きポート、公開テスト鍵だけを使用した。

## APIと画面担当への引き継ぎ

追加の操作は3つだけ（POST /mobile/v1、既存の暗号・署名・連番・時刻検査後）。

| 操作 | 要求 | 成功応答 |
|---|---|---|
| towns | `{cursor:null|string}` | `{towns:[{id,name}],nextCursor}`（100件ずつ） |
| quests | `{cursor:null|string}` | `{quests:[{id,title,town,state,updatedAt}],nextCursor}`（更新の新しい順、100件ずつ） |
| quest-create | `{requestId,townId,title,purpose}` | `{quest:{id,title,town,state,updatedAt}}` |
| reports（拡張） | `{}` または `{questId,cursor:null|string}` | `{reports:[{id,questId,questTitle,title,success,at,excerpt,text}],nextCursor}` |

- 町IDは窓口のメモリ内でUUIDから内部の鍵へ引く。パスの符号化・hashではなく再起動で無効になる。
- 題200文字、目的2000文字、既存 validQuestPatch／QuestLedger.create を使用。openの札を作るだけで、担当・送信・出陣・party・done/adoptには進まない。
- reportsの最近50件は新しい順、text/nextCursorはnull。クエスト別は古い順で8件、本文は最大8000文字、excerptは500文字。本文なしはnull。保存した本文か一致する勇者・時刻のメモリ返答だけを読む。ツール出力・許可・拠点・branch等の別フィールドを返さない（文章に人／CLIが書いた機密の自動墨消しはしない）。
- cursorは直前ページの末尾ID。更新・削除後の固定スナップショット保証はないので、拒否時や一覧変更時は先頭から読み直す。
- reportsのshape／署名配列が増えているので、旧アプリとMacはそろえて更新する。pair/decide、暗号、HTTPの一般拒否は変えていない。

アプリの `src/gateway.ts` に以下を実装した。引数・型・失敗時・例はアプリの `docs/MOBILE-PROTOCOL.md`「画面担当向け」に記載済み。

- `newQuestRequestId(): string`
- `listTowns(mac, cursor = null): Promise<{towns,nextCursor}>`
- `listQuests(mac, cursor = null): Promise<{quests,nextCursor}>`
- `createQuest(mac, {requestId,townId,title,purpose}): Promise<MobileQuest>`
- `listQuestReports(mac, questId, cursor = null): Promise<{reports,nextCursor}>`

## 二重発行・本人確認・通知

- requestIdは `時刻.B64(CSPRNG16バイト)`、10分で期限切れ、未来60秒までの時計差を許容。明示送信時に一度だけ生成する。
- 作成前に0600の `quest-requests.json` へ耐クラッシュ予約し、同じIDは端末・本文・連番が変わっても拒否。期限後は予約の間引き後も時刻で拒否する。5件/直近60秒/端末、予約は最大1000件。既存のIP／端末毎分30要求も残る。
- `quest-creations.jsonl` は作成前に `{deviceId,questId,time}` の3項目だけをfsyncして残す。題・目的・コマンドをログに残さず、保存失敗なら作成しない。
- 予約／監査とSQLiteは別なので、障害時に「札のない予約」はあり得る。二重作成を避ける側へ倒し、自動再送・自動再開はしない。アプリは失敗で新しいIDに置き換えず、一覧の確認を案内する。
- 作成ごとの追加生体認証は不要：コード実行ではなく札の保存だけのため。decideは引き続き毎回生体認証／端末ロック解除が必要。
- Expo送信は `priority:"high", channelId:"alerts"`。アプリ側はalertsをHIGHで作る。実機での通知表示をこのタスクの自動検査だけで保証しない。

## 自動検査

| 検査 | 結果 |
|---|---|
| 本体 npm run typecheck | 成功 |
| 本体 npm test | 59ファイル、811件成功 |
| 本体 npm run build | 成功（web＋server） |
| アプリ npm run typecheck | 成功 |
| アプリ npm test | 2ファイル、25件成功 |
| アプリ npm run export:android | 成功（993 modules、Android bundle出力） |
| 両リポジトリ git diff --check | 成功 |

初回の本体全体テストでは既存 `security-port-choice.test.ts` の開発ポート検査が一時ポート競合で1件失敗した（期待した窓口エラーより先に、Viteの `Port ... is already in use` で終了）。該当ファイル4件の単体再実行と、その後の全体2回は成功し、このテストには変更していない。

新規の `security-quests.test.ts` はHTTP・暗号・SQLite・ファイルI/Oを実際に使う（時計境界だけDate.nowを固定）。

- **SEC-18**：既知の不透明な町、題・目的の上限、未知のフィールド、禁止操作、未登録／失効端末、別端末ID／連番の偽装、作成後の担当・出来事・実行なし。
- **SEC-19**：同時重複、本文変更・別端末の同じID、窓口再起動、期限切れ、5件の頻度制限、実FS故障時の作成禁止、0600と本文なしの予約・監査。
- **SEC-20**：クエスト／町のページ、時刻順の報告ページ、別クエスト／削除cursor拒否、制御文字8000文字×8件でもHTTP上限内、内部メタデータ／別種イベントの除外、保存ありのSQLite再読込、保存なしのメモリ本文と消失後null。
- Nodeとnoble双方で、towns・quests・quest-create・最近reports・クエスト別reportsの署名入力・署名・AAD・nonce・暗号文・packetが共有ベクトルと一致する。

残る作業は画面担当による町選択／入力／二重押し防止／結果不明時の案内／報告本文画面と、実機検証。SEC-09/16/17等の既存の未完了リリース条件はこの変更で完了扱いにしない。

## 変更ファイル

本体 `28c94e1`：

```text
docs/ARCHITECTURE.md
docs/MOBILE.md
docs/MOBILE-PROTOCOL.md
docs/mobile-protocol-vectors.json
docs/security/checklist.md
docs/security/threat-model.md
scripts/mobile-vectors.mjs
src/core/mobile-display.ts
src/core/mobile-pairing.ts
src/core/mobile-pairing.test.ts
src/core/mobile-protocol.ts
src/core/mobile-protocol.test.ts
src/core/mobile-quests.ts
src/core/mobile-quests.test.ts
src/server/mobile/crypto.test.ts
src/server/mobile/data.ts
src/server/mobile/gateway.ts
src/server/mobile/operations.ts
src/server/mobile/push.test.ts
src/server/mobile/quest-requests.ts
src/server/mobile/quests.ts
src/server/mobile/security-quests.test.ts
src/server/mobile/security-requests.test.ts
src/server/quest-ledger.ts
src/server/relay.ts
```

アプリ `e5d7c8c`：

```text
docs/MOBILE-PROTOCOL.md
docs/mobile-protocol-vectors.json
src/gateway.ts
src/protocol/mobile-display.ts
src/protocol/mobile-protocol.ts
src/protocol/mobile-quests.ts
src/protocol/mobile-quests.test.ts
src/protocol/protocol.test.ts
src/protocol/session.ts
```

本報告ファイルは実装コミットを参照する別の文書コミットに置く。
