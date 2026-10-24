# A3 / SEC-24 — 町の所属と姿

## 対象と合意

- 実施日: 2026-10-24 UTC（2026-10-25 JST 01:29〜01:32）。Darwin arm64、Node v26.4.0、npm 11.17.0、Vitest 4.1.12、Vite 8.3.4。
- 本体の実装: `c197e27223575295bf462f6a9683d6d8fd641060`、`feat/mobile-quests`。
- アプリの実装: `89360cc3ee5e39ec783355b0341e789bfad98a9a`、`main`、Expo 58.0.17 / React Native 0.88.0。
- この記録は上記コードの検証後に追加する文書のみのコミット。追加依存・lockfile変更なし。push なし。
- 監督者の明示指示で、未配布の開発アプリに対する旧版互換の要求4は取り下げた。v1 の厳密な DTO・署名配列を本体とアプリで同時更新し、townContext 等の互換フラグは導入していない。
- 画面は別担当。例外として監督者が許可した `QuestParty.tsx` の初期 MobileTown に `theme:null` を足す1行だけを変更（必須型を満たすため。表示変更なし）。

## 追加した契約

- Hero / Permission / Quest / Report / WorkHero / WorkBase / WorkDraft: 必須 `townId: string | null`。既存の town 表示名は維持。
- Town: `{id, name, theme}`。theme は `village | port | snow | desert | volcano | null`。
- 全町所属は `MobileQuests` の同じプロセス内 UUID v4 対応表を使用。連番・パスの写し・hash/base64 ではない。名前や姿の変更では ID を保ち、削除後の再登録／窓口の再起動で新しくする。
- 所属不明／未登録／削除済みは null。SessionEnd の勇者は status から除去され、options に残る非活動の勇者は null。報告はクエストの町に所属し、勇者の現在地から引かない。
- theme は `TownRecord.theme` を本体の `TOWN_THEMES` で検査して返す。Mac の `Scene.look` と同じ台帳値。未知・未選択は null、フォルダ名から補わず、画像を配信しない。
- preset・装備は町に属さない Choice のまま。draft 内の members/fits/steps は親 draft の町に属する参照であり、重複の町フィールドを作らない。
- 件数は追加しない。取得済み DTO を townId でまとめて表示件数を数えられる。status100／許可16／最近報告50の上限とクエストのページを無視して総数とは表示しない。クエストの進行中は active/waiting/review、全件件数なら全ページを読む。別要求間の snapshot 保証はない。
- 追加値はすべて署名対象。Permission.townId は町の区画・アイコンの判断材料なので表示 hash（10値）にも含めた。

## 再現手順と結果

すべて終了コード0。最初の確認で判明した旧 WorkHero の厳密キー期待値と、上記画面の必須 theme 初期値を修正した後の最終結果。

| 対象 | コマンド | 結果 |
|---|---|---|
| 本体 | `npm run typecheck` | 成功 |
| 本体 | `npm test` | 68 files / 854 tests 成功、66.05秒 |
| 本体 | `npm run build` | Vite client / SSR とも成功 |
| 本体 | `npx vitest run src/server/mobile/security-towns.test.ts --reporter=verbose` | SEC-24 の3ケース成功、1.86秒 |
| アプリ | `npm run typecheck` | 成功 |
| アプリ | `npm test` | 4 files / 53 tests 成功、349ms |
| アプリ | `npm run export:android` | 成功、1011 modules、Android bundle 2.6MB（dist はコミットしない） |
| 両方 | `git diff --check` | 成功 |
| 本体 | `node scripts/mobile-vectors.mjs` を再実行し `cmp` | 決定的に同一 |
| 両方 | vectors の SHA-256 比較 | 同一（下記） |

共通 vectors の SHA-256:

```text
919cdf4790bd1ffa920aac7d6aa865c9b3831f717c39c0d88c2231f404273907
```

固定の公開テスト専用鍵による vectors だけを更新。townId・theme を含む署名・AEAD・許可hashを Node とアプリの noble の両方で照合し、status / permissions / 5テーマと null の towns も追加した。利用者の鍵・通知 token は含まない。

### SEC-24 の実 HTTP 証拠

実装: [security-towns.test.ts](../../../src/server/mobile/security-towns.test.ts)。モックの HTTP／暗号／SQLite／PTY ではなく、実 listener と登録鍵の暗号・署名で要求する。

1. **同名町・各 DTO の所属・許可hash**（243ms）
   - 表示名が同一の7町を用意。5テーマ＋未設定＋未知値を返し、7個の異なる UUID v4、未知値2件は null と確認。
   - 2町に HTTP の quest-create で別々の札を作り、SQLite の内部所属と照合。
   - status、permissions、quests、reports（最近／クエスト別）が同じ町 ID を共有し、別町の報告が混ざらない。
   - 勇者の現在地を変えても既存報告の町は変わらない。
   - 同じ表示名の他町 ID に差し替えた許可hashで decide すると HTTP400。本来の hash の判断は成功。
   - 応答に合成した内部パス・cwd・branch・メタデータのフィールドがない。
2. **不明・削除・名前変更・再起動・退場**（200ms）
   - 名前変更では町 ID 不変。削除済み／未登録の町にいる勇者・許可・札・報告は townId:null、表示名もパスから補わない。
   - 同じ町を戻すと新 ID。SessionEnd 後は status に残らず、その勇者の許可の町も null。
   - 実窓口を再起動するとまた新 ID。古い ID・内部パス・連番 `1`・パスの base64 を HTTP quest-create に渡しても拒否、札は増えない。
3. **本体 relay の台帳の姿・作業の所属**（1210ms）
   - 隔離 HOME・別ポートの実 relay と、既存のローカル CLI fixture を起動（LLM や利用者の設定を使わない）。
   - Mac 側 HTTP API で2町の保存 theme を snow / volcano に変更し、窓口が同じ値を返す。
   - 別々の町に勇者を起動。status と町別 options の WorkHero / WorkBase の townId が一致し、別町の勇者 ID の prepare は拒否。
   - prepare / draft / quests の町が一致。終了した勇者は options に active:false,townId:null として返る。
   - 応答にテスト環境のパス・branch・起動引数・資格情報を含まない。

純粋検査: [mobile-towns.test.ts](../../../src/core/mobile-towns.test.ts) の3ケース（アプリにも同一ファイル）。全所属 DTO の必須/null/型/長さ、5テーマ限定、追加値の署名反映、許可hashの町への束縛を検査。既存の実 HTTP SEC 検査も全体テストで通過。

## 変更ファイル

本体（本記録を含む）:

```text
docs/ARCHITECTURE.md
docs/MOBILE.md
docs/MOBILE-PROTOCOL.md
docs/mobile-protocol-vectors.json
docs/security/checklist.md
docs/security/threat-model.md
docs/security/runs/2026-10-24-mobile-towns.md
scripts/mobile-vectors.mjs
src/core/mobile-display.ts
src/core/mobile-protocol.test.ts
src/core/mobile-quests.ts
src/core/mobile-quests.test.ts
src/core/mobile-towns.test.ts
src/core/mobile-work.ts
src/core/mobile-work-display.ts
src/core/mobile-work.test.ts
src/server/mobile/data.ts
src/server/mobile/operations.ts
src/server/mobile/quests.ts
src/server/mobile/security-quests.test.ts
src/server/mobile/security-towns.test.ts
src/server/mobile/security-work.test.ts
src/server/mobile/work-catalog.ts
src/server/mobile/work.ts
src/server/relay.ts
```

アプリ:

```text
docs/MOBILE.md
docs/MOBILE-PROTOCOL.md
docs/PROTOCOL-SOURCE.md
docs/mobile-protocol-vectors.json
docs/security/checklist.md
docs/security/runs/2026-10-24-mobile-towns.md
src/gateway.ts
src/protocol/index.ts
src/protocol/mobile-display.ts
src/protocol/mobile-quests.ts
src/protocol/mobile-quests.test.ts
src/protocol/mobile-towns.test.ts
src/protocol/mobile-work.ts
src/protocol/mobile-work-display.ts
src/protocol/mobile-work.test.ts
src/screens/QuestParty.tsx
```

## 引き継ぎと限界

- **開発サーバーの再起動が必要**。本体の窓口コードとアプリの DTO を同時にそろえ、Metro の JS を再読込し、町・勇者・許可・札・報告・options を取り直す。既存の鍵・登録・連番は変更しておらず、再ペアリングは不要。古い townId／contentHash は再利用しない。
- この作業では8792・8799の監督者サーバー、8081の Metro、エミュレーターを停止／再起動していない。検証後も3ポートの listener を確認。利用者の8790には接続していない。
- 利用者の `scratchpad/yushario-home`、Firebase 設定、通知 token、鍵を読んで表示・ログ・コミットしていない。検証は一時ディレクトリと別ポートだけ。
- 次の画面担当はアプリ `docs/MOBILE-PROTOCOL.md` の「町のセクションとアイコン（A3）」に従う。町名で逆引きせず ID で結合し、null／未取得／再起動の差を扱う。絵の同梱・描画・町別区画は未実装で、本タスクの範囲外。
- 本記録は A3 のバックエンド／通信の自動検証であり、実機の本人確認・通知・町アイコン表示やセキュリティ全体のリリース承認の証拠ではない。既存の手動検証・依存の残課題は各 checklist のまま。
