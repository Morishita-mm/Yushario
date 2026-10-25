# A4 / SEC-25 — 許可の作業と変更本文

## 対象

- 実施日：2026-10-25 UTC / JST 13:40〜13:48。Darwin arm64、Node v26.4.0、npm 11.17.0、Vitest 4.1.12。
- 本体実装：`78a162297366f9e6ff8a77f9e291542080fe2d50`（`feat/mobile-quests`）。
- アプリ実装：`ca1c9a2c11fcb088a45e98b13361170db2baeb36`（`main`）。
- この記録と [SEC-25 の標準出力](2026-10-25-mobile-permission-content.log) は検証後の文書コミット。アプリにも同じ記録をコピーする。
- 追加依存・lockfile 変更なし。push なし。画面、App、ui、markdown、town は編集していない。アプリ側で並行した他担当の画面変更は stage／commit に含めていない。

## 決めた契約と理由

- `work: {questId,title} | null`：許可受信時に、認証済み端末の `QuestLedger.current` とその所属から得た担当クエストを固定する。同じ町・同じ勇者を照合し、入力の session_id/cwd/branch や別勇者の最近の仕事から補わない。未割当・終了済み・不明なら null。後の改題／担当変更でも snapshot は不変。
- 最後の request 本文は追加しない。現担当の ID/題は会話保存の有無に依存せず、複数メンバーの依頼や未配送の依頼を混同しない、既存台帳の確定値だから。仲間のフックは親勇者の担当クエストまでを示す。作業欄にパス・cwd・branch・目的を足さない（人が題に書いた文字の自動墨消しはしない）。
- `change`：Write は `{kind:'write',text,omitted}`、Edit/MultiEdit は `{kind:'edit',edits:[{before,after,replaceAll}],omitted,omittedEdits}`。入力順と replace_all（省略時 false）を保持。実ファイルの diff ではなく置換要求。空文字は有効。本文欠落／型不正／孤立サロゲートは `{kind:'unavailable'}`。Bash は従来の content にコマンド全文、その他の道具も change=null。
- **上限**：content は従来どおり2000 UTF-16単位。変更本文は全 text/before/after の合計2000単位、さらに content と合計3000単位。置換は16組、応答16件。サロゲート対を分断せず、未表示の文字数と組数を別に数える。組数の上限は空の置換を大量に並べても効く。応答は既存512KiB暗号文／1MiB HTTP上限に収める。
- 全追加値（kind、null、不明、題、前後、順序、全置換、両省略数）を署名と contentHash に含める。スマホでは外側 omitted=0 **かつ** 変更の omitted=0／omittedEdits=0／unavailable でない場合だけ承認可。省略／不明でも拒否は可。work=null だけなら承認可。
- 制御文字は mobileText の有効な Unicode 生値として保持。画面は既存 visible の規則（本文は改行・タブを残し、それ以外の制御／方向変更文字とバックスラッシュを可視化）を使い、元の受信値で hash を計算する。Markdown/HTML/ANSI として解釈しない。
- Mac の許可カードと既存の判断は変えない。追加本文は PermissionWaiter の待機項目に分けて保持し、既存 Permission／WS／イベント／台帳／監査／通知へ足さない。応答／切断／期限切れで待機項目と一緒に破棄する。
- v1 を両側同時更新。互換フラグなし。アプリは `src/protocol` から `mobilePermissionCanAllow` と追加型を import でき、gateway の新しい呼び出しは不要。

## 再現コマンドと結果

| 対象 | コマンド | 結果 |
|---|---|---|
| 本体 | `npm run typecheck` | 成功 |
| 本体 | `npm test` | 71 files / 864 tests 成功、76.27秒 |
| 本体 | `npm run build` | Vite client / SSR 成功 |
| 本体 | `npx vitest run src/server/mobile/security-permission-content.test.ts --reporter=verbose` | 4ケース成功、1.93秒（添付ログ） |
| アプリ | `npm run typecheck` | 成功 |
| アプリ | `npm test` | 6 files / 80 tests 成功、466ms |
| アプリ | `npm run export:android` | 成功、1034 modules、Android bundle 2.6MB。dist は未コミット |
| 両方 | `git diff --check` | 成功 |
| 本体 | vectors 再生成後に直前のコピーと `cmp` | 同一 |
| 両方 | vectors と新しい純粋契約／テストの `cmp` | 同一 |

作業途中の型検査ではテストの readonly 配列を修正した。アプリ用の並列検査を一度本体 cwd で誤実行し `export:android` が未定義で終了したが、その後アプリの cwd に移り上記3コマンドをすべて成功させた（本体テストも重複で成功）。実装の失敗を隠すものではなく、上の表は最終の正しい対象での結果。

共通 vectors の SHA-256：

```text
502c103ee5b92b0c54ea563c4a0c390c03da56c4d65b4b00c887db4952d87d03
```

Node crypto とアプリ noble の両方で、work/change を含む hash・署名・平文・AEAD・packet を照合。Bash、Write（制御文字・絵文字）、Edit（全置換）、MultiEdit（本文と組の省略）、unavailable/work=null の公開テスト専用データを収録。利用者の鍵ではない。

## SEC-25 の実 HTTP 証拠

実装は本体 `src/server/mobile/security-permission-content.test.ts`。HTTP・暗号・SQLite・PTYのモックではない。最初のケースは隔離HOME・任意の空きポートの実relayと実CLI fixture、後の3ケースは実GatewayFixture listenerと暗号化／署名した要求を使う。LLMや利用者の設定は使わない。

1. **作業と本文の帰属（1400ms）**：同じ町の2勇者／別町の1勇者に別クエストを割当。各実CLIが、別勇者の session_id と偽の cwd/branch を含む許可フックを送っても、認証済み端末自身の work と BODY-0/1/2 だけが返る。同町／別町のIDも確認。後で担当を変えても元の作業snapshotを維持。別町の作業または変更本文から作ったhashでallowするとHTTP400。本来のhashでdenyは成功し、フックへ実際にdenyが戻る。未割当の勇者はwork=nullで完全なEditならallowがフックへ戻る。内部パス／cwd／branch／目的は応答にない。
2. **本文とstale hash（116ms）**：Write の制御文字／絵文字、Edit の前後と全置換、MultiEdit の全組の順番、Bash コマンド全文を復号して確認。表示後に待機中本文を変えると旧hashのallowはHTTP400。再取得でhashが変わり、そのhashならallowが成立する。
3. **省略／不明（178ms）**：Writeのサロゲート境界（省略2単位）、Edit合計予算超過、17個の空のMultiEdit（省略0文字だが1組省略）、本文欠落、2001文字Bashを確認。全てallowはHTTP400、同じ表示hashでdenyはHTTP200、全待機Promiseがdenyで解決する。
4. **応答上限（65ms）**：16件、各contentが2000個のNUL、置換16組、ID／名前／町／題も上限のNULを使用。全16件をHTTP200で受信・復号・署名検証できる。返す本文は残予算1000文字だけで、未表示31000文字を数える。JSONカード全体<480KiB、暗号文<=512KiB、HTTP<1MiBをassert。全件承認不可。

純粋検査は本体 `permission-change.test.ts`（3ケース）と両側 `mobile-permission.test.ts`（3ケース）。Mac要約不変、順序・空文字・全置換、UTF-16境界、欠落／不正型、入れ子の全値とnullのhash反映、厳密shapeと合計上限、承認条件を確認する。既存SEC検査も全体テストで通過。

## 変更ファイル

本体（本記録とログを含む）：

```text
docs/ARCHITECTURE.md
docs/MOBILE.md
docs/MOBILE-PROTOCOL.md
docs/mobile-protocol-vectors.json
docs/security/checklist.md
docs/security/threat-model.md
docs/security/runs/2026-10-25-mobile-permission-content.md
docs/security/runs/2026-10-25-mobile-permission-content.log
scripts/mobile-vectors.mjs
src/core/mobile-display.ts
src/core/mobile-permission.ts
src/core/mobile-permission.test.ts
src/core/mobile-protocol.test.ts
src/core/mobile-towns.test.ts
src/core/permission-change.ts
src/core/permission-change.test.ts
src/server/mobile/operations.ts
src/server/mobile/security-permission-content.test.ts
src/server/mobile/security-work-fixture.ts
src/server/permissions.ts
src/server/relay-hooks.ts
```

アプリ（`/Volumes/ORICO/src/github.com/Morishita-mm/yushario-mobile`）：

```text
docs/MOBILE.md
docs/MOBILE-PROTOCOL.md
docs/PROTOCOL-SOURCE.md
docs/mobile-protocol-vectors.json
docs/security/checklist.md
docs/security/threat-model.md
docs/security/runs/2026-10-25-mobile-permission-content.md
docs/security/runs/2026-10-25-mobile-permission-content.log
src/protocol/mobile-display.ts
src/protocol/mobile-permission.ts
src/protocol/mobile-permission.test.ts
src/protocol/mobile-towns.test.ts
```

## 残る作業・再起動

- **開発サーバーの再起動が必要**。監督者が8792/8799の同一プロセスを再起動し、A4画面の実装後にJSを再読込する。鍵・登録の作り直しは不要。この作業では監督者のサーバー、Metro8081、エミュレーターを停止／再起動していない。利用者の8790には触れていない。テストのプロセスと一時HOMEは後始末した。
- Sonnetの画面実装が残る。アプリ `docs/MOBILE-PROTOCOL.md` の「画面担当向け：許可の理由と本文（A4）」に表示・全置換・省略・visible・承認条件の注意を記載済み。旧画面に新プロトコルだけ入れた状態では本文は表示されないため、A4完成版として承認操作を検証したとは扱わない。
- 実機の表示／操作／生体認証、実際のClaude各版の許可フック、全体リリース承認は今回の自動検査の範囲外。
