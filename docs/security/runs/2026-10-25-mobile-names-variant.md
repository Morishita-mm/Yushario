# A6: 勇者の名前・報告の題・色の検証

## 対象・環境

- 実行日: 2026-10-25、macOS / arm64。
- 本体: `feat/mobile-quests`、実装コミット `2cb1981`（開始時 `0e51373`）。前担当の未コミット変更を確認して引き継ぎ、以下の修正・検査を追加した。
- アプリ: `/Volumes/ORICO/src/github.com/Morishita-mm/yushario-mobile`、`main`、実装コミット `bb5135b`（開始時 `4406fb2`）。既存の別変更には触れていない。
- Node `v26.4.0`、npm `11.17.0`、Vitest `4.1.12`。追加依存なし。
- 本体の独立した実HTTP窓口／暗号／SQLiteと、隔離HOME・一時ディレクトリ・空きポートのrelay／実PTY／テスト専用CLIを使用。CLIはLLMを呼ばない。利用者の8790、設定・会話・認証情報は操作・読取していない。pushなし。

## 変更した規則

### 名前

利用者の `names.json` の名前を最優先。未命名で、TownNames.base が町の表示名または町のフォルダ名に完全一致した時だけ、`AGENTS[preset].label + " " + TownNamesの番号` にする。接尾辞なしは1、`(3)`なら3、種類不明は「勇者」。種類ごとや現在の人数で数え直さない。

| 入力の例 | 結果 |
|---|---|
| 自分で `testtown` と名付けた | `testtown` を維持 |
| 未命名、base=`testtown`、町もtesttown、最初のClaude | `Claude Code 1` |
| 同じbaseの2人目がpi | `pi 2` |
| 同じbaseの3人目がCodex | `Codex 3` |
| 同じbase、種類不明、TownNamesが `(2)` | `勇者 2` |
| 1人目が退場した後の4人目 | `Claude Code 4`（番号を詰めない） |
| 別worktreeのbase=`feature-tree` | `feature-tree` を維持 |

実HTTPで発見した点: TownRecord.path は最後に起動したworktreeのcwdへ変わるため、basename(path)との比較では別worktreeまで種類名になった。コーディネーターの承認により、町のフォルダはtown.keyの `.git` の親（非Gitはkey自体、旧keyなしのみpath）から取るよう直した。名前は `mobileHeroName` を通した部屋の表示値をstatusとquest-optionsで共有する。PTYだけでまだ部屋に名前が無い場合の従来ラベルは変更しない。

### 報告の題（上が優先）

| event.report の条件 | mobileReportTitle の結果 |
|---|---|
| 無し | 返事が届いた |
| stopFailure | 途中で止まった |
| 最後のテスト失敗 | ファイル N件を変更・テスト失敗 |
| 変更あり・テスト0回 | ファイル N件を変更・テスト未実行 |
| 変更あり・最後のテスト成功 | ファイル N件を変更・テスト成功 |
| kind=scroll | 調査から戻った |
| それ以外 | 返事が届いた |

PCの `reportTitle` と保存済みの題は変更なし。成功判定も従来どおりで、変更0件・テスト成功の場合は題が「返事が届いた」でもsuccess=true、未実行ならnullのまま。最近の報告にはresultメタデータだけのJSONがreport欄に入る既存行があり、その場合はTalkReport無しとして扱う。通知は元から固定文言だけなので変更なし。

### variant

- Hero / WorkHeroだけに必須の `0|1|2|3|4`。PCの計算を `src/core/mobile-hero.ts` へ移し、webもこれを参照する（本体内に計算を重複しない）。
- 部屋の内部勇者IDをJSの `for...of` で走査し、`hash = (hash * 31 + char.charCodeAt(0)) >>> 0`、最後に `% 5`。PTYのみなら既知のhero/recalledHero ID、無ければsession ID。窓口が発行するランダムIDから計算しない。
- `heroValues` / `mobileWorkHeroValues` の末尾へ加えて応答署名に含める。改ざんすると署名入力とそのSHA-256も変わり、元の署名では拒否される。別のhashフィールドは新設せず、PermissionのA4 contentHashも変えない（variantはPermissionへ追加しない）。
- 5値だけの多対一の色番号であり、内部IDを復元・一意に推測できるものではない。色を識別子には使わない。

## 手順と結果

| 検査 | 結果 |
|---|---|
| 本体 `npm run typecheck` | PASS |
| 本体 `npm test` | PASS: 76ファイル、877テスト（74.21秒） |
| アプリ `npm run typecheck` | PASS |
| アプリ `npm test` | PASS: 9ファイル、92テスト |
| アプリ `npm run export:android` | PASS: Android bundleを生成（distはコミット対象外） |
| 両リポジトリ `git diff --check` | PASS |
| `node scripts/mobile-vectors.mjs` 再生成前後と両リポジトリの比較 | 同一 |

共有vectorsのSHA-256: `50f6002183d00e1147aed6ec6b4cfe7455e7b0921df23644035496d7f5cc57fe`。

### 実HTTPの証拠（SEC-20/22/24の拡張）

`src/server/mobile/security-names-variant.test.ts` の3テスト:

1. 本物のrelay・PTY・隔離CLIでClaude/pi/Codexを順番に起動。statusとquest-optionsで `Claude Code 1 / pi 2 / Codex 3`、同じ名前・同じ内部ID由来のvariant、異なる公開IDを確認。名前の上書き、退場後の4番、実Git worktreeの `feature-tree` の維持を検査し、応答に内部パス等が無いことも確認。
2. SessionStartをまだ出さない隔離CLIのPTYを作り、statusに無い勇者のquest-optionsのvariantがsession ID由来であることを確認。
3. RoomとSQLiteの合成データを実窓口へ接続。町表示名／フォルダ名一致、未知の種類の `勇者 1 / 勇者 2` と退場番号の保持、報告8例の題とsuccessを最近一覧／クエスト別の双方で確認。保存されたPCの題は不変。resultだけの報告JSONも検査。これは外部のHTTPイベントをmobileRoomへ取り込む変更ではない（既存の送り元境界は不変）。

1では実HTTPで受け取ったstatus／quest-options応答のvariantを別の有効値に変え、厳密なshape検査を通してから署名入力・SHA-256の変化とEd25519拒否を検査した。テスト端末の共有鍵で正しいAEADラッパーを作り直しても、元の署名を持つ改ざん応答をTestPhone.openが拒否した。したがって単に範囲外の型で弾いただけではない。

### 純粋関数・アプリ側の証拠

- `src/core/names.test.ts`: 利用者名優先、完全一致、表示名とフォルダ名、別worktree、未知の種類、TownNamesの退場込み番号。
- `src/core/mobile-report.test.ts`: 題の全分岐・優先順、0件の失敗、最後のテストを優先、PCの日本語／英語の題の不変。
- `src/core/mobile-hero.test.ts` とアプリの同名テスト: PC互換の固定hash値、オーバーフロー・Unicode、5値、欠落/null/範囲外/小数/文字列/余分なキーの拒否、全variantが署名配列を変えること。
- 既存mobile-protocol/towns/work/equipmentテストのfixtureと固定配列を更新。既存SEC-22の厳密キー列、SEC-25の最大応答fixtureも更新。
- アプリ `src/protocol/protocol.test.ts`: Node共有vectorsの全署名・AEADをnobleで照合し、Hero/WorkHeroの有効な別variantへの変更が署名入力・SHA-256を変え、元の署名では検証できないことを追加確認。

## 変更ファイル

本体:

- `src/core/mobile-hero.ts`, `mobile-hero.test.ts`, `mobile-report.test.ts`（新規）
- `src/core/mobile-display.ts`, `mobile-work.ts`, `mobile-work-display.ts`, `names.ts`, `quests.ts`
- `src/core/mobile-protocol.test.ts`, `mobile-towns.test.ts`, `mobile-work.test.ts`, `mobile-work-equipment.test.ts`, `names.test.ts`
- `src/server/mobile/data.ts`, `quests.ts`, `work-catalog.ts`, `security-names-variant.test.ts`（新規）, `security-work.test.ts`, `security-permission-content.test.ts`
- `src/server/relay.ts`, `src/web/town/appearance.ts`
- `scripts/mobile-vectors.mjs`, `docs/mobile-protocol-vectors.json`, `docs/ARCHITECTURE.md`, `docs/MOBILE.md`, `docs/MOBILE-PROTOCOL.md`, 本記録

アプリ:

- `src/protocol/mobile-hero.ts`, `mobile-hero.test.ts`（新規）
- `src/protocol/mobile-display.ts`, `mobile-work.ts`, `mobile-work-display.ts`
- `src/protocol/mobile-towns.test.ts`, `mobile-work.test.ts`, `mobile-work-equipment.test.ts`, `protocol.test.ts`
- `docs/MOBILE-PROTOCOL.md`, `docs/mobile-protocol-vectors.json`

## 範囲外・残ること

アプリの画面は未変更。色表示とsuccess=null時の札を出さない変更は画面担当の作業で、アプリ側MOBILE-PROTOCOLに注意点を記した。v1を同時更新したため窓口再起動とJS再読込が必要（利用者の窓口は本検査では再起動していない）。実機UI／通知配送の検証、リリース全体の未実施SEC項目を完了とする記録ではない。
