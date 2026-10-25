# A5 / SEC-22拡張 — 装備のモデルとeffort

## 対象と合意

- 実施：2026-10-25、JST 13:57〜14:02。Darwin arm64、Node v26.4.0、npm 11.17.0、Vitest 4.1.12。
- 本体実装：`27419dbd930e197192cce866eb07c320c6cf0a78`（feat/mobile-quests）。
- アプリ実装：`23a18f0eb473136d5c4ef5cb0c22a4f8d094ab29`（main）。
- この記録と [検査の標準出力](2026-10-25-mobile-equipment.txt) は検証後の文書コミット。アプリにも同じ記録をコピーする。
- 依存追加／lockfile変更なし。画面、App、ui、markdown、townは編集していない。pushなし。
- coordinatorのask回答で、**不適合な値でも選択肢を消さず値だけnull**、モデルは利用者登録済みの短い識別子を認め `/` `:` 大文字を許す、と確認した。Claudeの既定3種類だけに制限してCodex/Piの既存上書き設定を失わせない。

## 追加した契約

- `MobileWeaponChoice = {id,name,model:string|null}`。
- `MobileAccessoryChoice = {id,name,effort:MobileEffort|null}`。
- `MobileWorkHero` に平坦な必須 `model:string|null` / `effort:MobileEffort|null` を追加。既存weapon/accessoryの名前を維持し、既存勇者やパーティーでも説明できる最小の形にした。
- 共通MobileChoice／拠点の形は不変。Launchも不透明weaponId/accessoryIdだけのまま。gatewayの呼び出し追加なし。
- 出どころは読み込み済み装備マスタ（本体equipment.jsonと既存のエージェント単位上書き）の武器model／はちまきvalue。名前から推測せず、その値をそのまま使う。勇者は端末の選択済み装備IDで同じマスタを引く。
- 外部勇者／未選択／不明はnull。CLI既定値やCLI内で変更した現在値を実測したわけではない。不適合でも装備のid/nameと選択可能性は維持し、値を切り詰め・正規化しない。

### 値の制限と安全境界

- model：1〜64 ASCII文字、`^[A-Za-z0-9][A-Za-z0-9._:/-]{0,63}$`。`openai-codex/gpt-6-astra`、`Provider:Model-1.0`等のprovider付き識別子を認める。
- さらに `://`、先頭のWindowsドライブ形 `^[A-Za-z]:/`、`/`または`:`区切りの`.`/`..`成分は不可。空白・制御文字・非ASCII・先頭の`-`・絶対パス・URL等を値として出さない。
- effort：off/minimal/low/medium/high/xhigh/maxの7値だけ（小文字、最大7文字）。未知の値や大文字変種はnull。
- これは**表示用メタデータの制限**。モデル名の世界共通の固定一覧や、利用者が自分で登録したCLI引数を隔離する新機構ではない。短いモデル識別子はマスタに登録された値を採用する。未知の装備ID、値をIDの代わりに渡すこと、要求への任意model/effortフィールドは拒否する。
- 全追加値とnullをquest-optionsの応答署名へ追加。WeaponChoiceは[id,name,model]、AccessoryChoiceは[id,name,effort]、WorkHeroは従来の11値の後ろにmodel/effortを足す。
- Permissionは変更しないため、**A4のcontentHashとpermission vectorは不変**。許可の表示欄に装備を混ぜない。v1を両側同時に更新し、互換フラグを作らない。
- SEC-22の装備／不透明ID／入力制限の検査を拡張した。新しい操作や権限を増やしていないので新SEC番号は作らない。

## 確認した結果

| 対象 | コマンド | 結果 |
|---|---|---|
| 本体 | `npm run typecheck` | 成功 |
| 本体 | `npm test` | 73 files / 869 tests 成功、70.29秒 |
| 本体 | `npm run build` | client / SSR 成功（309ms / 33ms） |
| 本体 | `npx vitest run src/core/mobile-work-equipment.test.ts src/server/mobile/security-work-equipment.test.ts --reporter=verbose` | 純粋3ケース＋実HTTP2ケース成功、2.60秒（添付標準出力） |
| アプリ | `npm run typecheck` | 成功（画面の型修正不要） |
| アプリ | `npm test` | 7 files / 85 tests 成功、491ms |
| アプリ | `npm run export:android` | 成功、1034 modules、Android bundle 2.6MB。生成distは未コミット |
| 両方 | `git diff --check` | 成功 |
| 両方 | vectorsのcmp、共有work型／表示／テストのcmp | 同一 |
| 本体 | vectors再生成後に前コピーとcmp | 決定的に同一 |
| 本体 | A4時点とpermission vector全体の比較 | 同一（許可hash不変） |

新しい検査がmobile-workを先にimportしたことで既存の循環初期化（MOBILE_WORK_OPERATIONSが未初期化）が見つかった。定数の所有元をmobile-protocolへ移してmobile-workから再exportし、起動時の相互参照を除去した。操作名・要求・wireの変更はなく、両側で直接importと全体検査を通している。

共通vectors SHA-256：

```text
b466303e4a3b5e785c4cd86ec5dee1f5292a714338a48230eec0ac2dc249c523
```

Node crypto／アプリnobleの両方で署名・平文・AEADを照合。既定のopus/highに加え、provider/model、大文字とコロン、null、off/minimalを収録。鍵は従来の公開テスト専用fixtureだけ。

### SEC-22の追加実HTTP証拠

実装：本体 `src/server/mobile/security-work-equipment.test.ts`。実relay、実HTTP、暗号、SQLite、実CLI fixtureを使用し、HTTP／PTYのモックや実LLMは使わない。別HOMEと空きポートで立てる。

1. **マスタ一致と起動入力境界（1428ms）**：Claudeの全3モデル・全5effortを確認。選択済みClaudeはopus/high、Piはnull/minimal、未選択Claudeはnull/null。武器／はちまきだけに追加キーがあり拠点にはない。model/effortの文字列をIDにする、未知ID、任意のmodel/effort欄を足す8要求は全てHTTP400で起動なし。既存の発行済みIDでの起動は成功し、返る勇者にも同じ値が載る。
2. **上書きと不適合値（948ms）**：隔離HOMEのequipment.jsonに同じ表示名の武器10／はちまき5を用意。provider付き／大文字コロン／64文字モデルは原文を返し、65文字・絶対パス・Windowsドライブ・flag形・空白・URL・親ディレクトリ成分はnull。未知effort ultraとHIGHもnull。全選択肢の件数・異なるID・名前は残り、勇者も同じ値／null。拒否した生値は応答に現れない。nullの装備もIDによる起動は成功し、従来の利用者登録装備を無効化しない。

両側の `mobile-work-equipment.test.ts` は、文字の境界・7値・必須null・不正型・別の行への追加欄拒否・全追加値とnullの署名反映を検査する。既存のSEC-22/23およびA4の検査も全体テストで通過。

## 変更ファイル

本体（本記録と標準出力を含む）：

```text
docs/ARCHITECTURE.md
docs/MOBILE.md
docs/MOBILE-PROTOCOL.md
docs/mobile-protocol-vectors.json
docs/security/checklist.md
docs/security/runs/2026-10-25-mobile-equipment.md
docs/security/runs/2026-10-25-mobile-equipment.txt
scripts/mobile-vectors.mjs
src/core/mobile-protocol.ts
src/core/mobile-towns.test.ts
src/core/mobile-work.ts
src/core/mobile-work-display.ts
src/core/mobile-work.test.ts
src/core/mobile-work-equipment.test.ts
src/server/mobile/work-catalog.ts
src/server/mobile/security-work.test.ts
src/server/mobile/security-work-equipment.test.ts
```

アプリ（`/Volumes/ORICO/src/github.com/Morishita-mm/yushario-mobile`）：

```text
docs/MOBILE.md
docs/MOBILE-PROTOCOL.md
docs/PROTOCOL-SOURCE.md
docs/mobile-protocol-vectors.json
docs/security/checklist.md
docs/security/runs/2026-10-25-mobile-equipment.md
docs/security/runs/2026-10-25-mobile-equipment.txt
src/protocol/mobile-protocol.ts
src/protocol/mobile-towns.test.ts
src/protocol/mobile-work.ts
src/protocol/mobile-work-display.ts
src/protocol/mobile-work.test.ts
src/protocol/mobile-work-equipment.test.ts
```

## 残る作業

- **監督者による8792/8799開発サーバー再起動が必要**。新v1応答とアプリJSをそろえ、画面実装後に再読込する。鍵・登録の作り直しは不要。
- Sonnetのドロップダウン／モデルとeffortの併記が残る。アプリ `docs/MOBILE-PROTOCOL.md` の「画面担当向け：装備＝モデル／はちまき＝effort（A5）」に、nullでも選択肢を残す、既定値と混同しない、不透明IDだけ送る等を明記した。
- 監督者の開発サーバー、Metro8081、エミュレーターは停止・再起動していない。利用者の8790／秘密／scratchpadの利用者データには触れていない。検査用プロセスと一時HOMEは後始末済み。
- 実機のドロップダウン／表示操作は未確認。API／自動検査の完了であり、全体リリース承認ではない。
