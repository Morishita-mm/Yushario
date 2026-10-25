# A8: 暗号化した通知内容と種類別設定（SEC-26）

## 対象・環境

- 2026-10-26、macOS / arm64、Node `v26.4.0`、npm `11.17.0`、Vitest `4.1.12`。
- 本体 `feat/mobile-notify-content`、開始時 `8a18fd6`、実装・試験・プロトコルのコミット `f7bc69b21fd870561ebe42323b6ef6b80e3b48ec`。この証跡とSEC一覧は後続の別コミット。
- 追加依存なし。暗号はNode標準crypto。アプリリポジトリは別担当で、ここから変更していない。pushなし。
- 実HTTPのペアリング・push-token・push-prefs・reportsと、ローカル偽Expoのlistenerを使用。鍵／state／SQLiteは一時ディレクトリの生成した検査用データ。通知契機はgatewayのnotifyPermission/notifyEvent/notifyを呼び、本物の射影・暗号・送信を通す。Expoのfetchだけをローカルへ転送する。WSや暗号のモックは使わない。
- 8790には接続・操作せず、8792・8799・Metro 8081も停止／再起動していない。実Expo/APNs/FCMへ通知していない。実利用者の秘密・token・鍵・設定・データは読まず、ログ／コミットにも含めていない。vectorsの秘密値は従来と同じ公開の固定テスト鍵だけ。

## 承認した設計判断

コーディネーターへのquestionで次を確認して採用した。

- 対象IDは暗号文内だけの `target` に載せる。タップ後に必ず窓口から取り直し、通知から直接判断しない。外側deviceIdは複数Macの鍵を選ぶための既存ランダム登録IDだけとして許す。
- push-prefsで対応版を宣言するまで旧固定文言、宣言後はdata-only。旧status/pairのshapeは維持。
- **復号不能時は捨てず、既知登録ID・既知kindの固定文言だけで通知する**。未認証の中身／対象は使わず、高水位も更新しない。これは認証された知らせではなく、偽装され得る一般通知である。認証済みの期限切れ・再送は退避せず破棄する。
- report/errorの期限は1時間（初案10分から変更）。Macの手動テストはOFFも迂回し、対応端末には「テスト通知」を暗号化して送る。
- 送信のpushSeqは端末別に1つ。受信高水位だけは**登録×kindの3値**にする。別kindの順不同を受け、同kindの古い遅着・再送は捨てる。これによりerror(seq=3)が先に着いてもpermission(seq=2)を失わない。

## アプリ実装の契約要約

厳密な型・配列・検証順は `docs/MOBILE-PROTOCOL.md` の「Push（A8）」が正。

### 設定

```ts
PushPrefs = {permission:boolean, report:boolean, error:boolean, contentVersion:0|1}
```

新しい認証済みoperation `push-prefs` はbody `{}` で読取、PushPrefsの全4欄で自分の設定を全更新。成功応答は4欄そのもの。署名配列は要求読取が `[]`、要求更新・全応答が `[permission,report,error,contentVersion]`。部分更新／別deviceId／不正型／未知版は一般拒否。設定変更にallowWorkは不要で、勇者を動かす権限は変えない。

既定は全ON/contentVersion=0。新アプリは背景task・鍵読取・端末内通知を準備してから既存3設定を保持して1を宣言する。Macの既存state.jsonの端末内にpushPrefs/pushSeqを保存し、両方の欄のない旧記録だけ既定で読む。片方だけ欠けた記録は破損として拒否。設定更新やtoken変更でpushSeqを戻さない。

### 鍵と暗号文

- IKMとsaltは従来のペアリング由来X25519/HKDFのもの。通知だけinfo=`yushario.mobile.v1/push`（NULなし）、HKDF-SHA256で32バイト。request/responseとは異なる鍵。
- nonceは従来同様 `00000000 || uint64be(pushSeq)` の12バイト。端末ごとのpushSeqを暗号化前にfsync予約し、失敗／欠番／再起動／版切替で戻さない。
- 外側は `{to,priority:"high",_contentAvailable:true,ttl,data:{v:1,kind,deviceId,seq,ciphertext}}`。title/body/sound/channelIdなし。ciphertextはIETF ChaCha20-Poly1305の暗号文＋16バイトtagのbase64url。
- AADは `C(["yushario.push.aead.v1",1,deviceId,seq,kind,GX,GS,PX,PS])`。
- 署名付き平文JSONは `{v,deviceId,seq,timestamp,kind,heroName,town,summary,expiresAt,target,signature}`。
- Mac Ed25519の署名入力は `C(["yushario.push.v1",1,deviceId,seq,timestamp,kind,heroName,town,summary,expiresAt,targetValues])`、targetValuesはnullか `[type,id,questId]`。
- targetはnullまたは `{type:"permission"|"report"|"hero",id,questId}`。permission→許可ID/null、report→Report.id/クエストID、error→statusのHero.id/null。対象不明／テストはnull。
- 表示名・町名・要約は各80 UTF-16単位以内、制御文字を空白へ置換して安全に短縮。許可要約はツール＋短いコマンド／対象（暗号文内だけなので対象のパスも可）。報告は既存mobileReportTitle、失敗は「止まりました」。Write/Editの変更本文や差分、URL・判断・contentHashは載せない。
- permissionは元の許可期限、report/errorは1時間。ttlは送信時点の残り秒を切り捨て、1秒未満は送らない。署名付き平文2400bytes、送信JSON全体は最大512文字の宛先のJSON escapeも含め4096 UTF-8 bytes以下で検査する。

### 受信・退避

1. 既知deviceId・kindだけを扱い、pinした鍵を選ぶ。shape/版/サイズ/base64url/seqを検査。
2. その登録×kindの受信高水位以下なら破棄。
3. 復号→fatal UTF-8→JSON/全shape→外内v/deviceId/seq/kind一致→Mac署名を検証。
4. 認証済みならtimestampの未来60秒上限、timestampより後で種類別上限内のexpiresAt、現在が期限内、同kindの新しいseqを確認。期限切れ／再送は破棄。
5. 登録ごとに背景処理を直列化して、そのkindの高水位を表示前に安全に保存。その後alertsで端末内通知。保存失敗は表示しない。
6. 復号不能／未対応版／署名やshape検証不良は固定文言・対象なしへ退避し、高水位は更新しない。既存のtitle/body型はOS表示に任せ、二重にローカル表示しない。

固定文言は題Yushario、permission「確認が必要です」／report「報告が届きました」／error「勇者が止まりました」。Macの手動テストはOFFとA7抑止を迂回し、1対応端末にはsummary=テスト通知/target=nullを暗号化する。アプリで3設定による再フィルターを足してこの明示テストまで捨てない。OSの通知許可自体は別。

## 手順と結果

| 検査 | 結果 |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS: 80ファイル、902テスト（77.59秒） |
| `npm exec vitest run src/core/mobile-push-content.test.ts src/server/mobile/security-push-content.test.ts src/server/mobile/crypto.test.ts` | PASS: 3ファイル、16テスト（1.87秒） |
| `git diff --check` | PASS |
| `node scripts/mobile-vectors.mjs` 再生成 | バイト一致 |
| 開始時vectorsとの比較 | 既存request/response/pair/全questsケースと既存HKDF値は完全一致。追加だけ |

新vectorsのSHA-256: `9502f3b76695306a755c7d7d471ee30c5b4c2e709c12bb333625ccac12b49cad`。

### 実HTTP 6ケース（security-push-content.test.ts）

1. 対応／旧端末を実登録。合成の許可・報告・停止を送り、偽Expoで暗号data-onlyと固定3文言を区別。勇者名・町名・要約・パス・対象が外側に現れず、正しい端末で解ける。reportsを実HTTPで取り直し、報告の題・IDと対象クエストが一致。診断に本文・暗号文・tokenを残さない。
2. 別端末の鍵とHTTP response鍵では復号不可。tag・kind・seq・deviceIdの変更を拒否。端末が知る共有鍵でAEADを作り直した本文改ざんでも、元のMac署名では拒否。期限・再送も拒否。
3. 3種をそれぞれ1つだけONにし、そのkindだけ実送信される。全OFFと窓口再起動、設定読取、旧status shapeを確認。OFFでも手動テストは暗号化して届き自動印は付かない。別登録の既定は全ON/0。署名不正・別deviceIdフィールド・不正bool・未知版・部分更新を拒否し、他登録を変えない。
4. ticketエラーでもseq=1を消費、次の成功は2。再起動と未暗号化の予約欠番の後は4、0への切替による固定通知は番号を消費せず、1へ戻すと5。後戻りとMAX_SAFE_INTEGER超過は送信を止める。
5. 最大の表示入力、長い対象ID、JSON escapeが最大になる512文字の合成tokenで全体4KB以下。名前・町・要約は80以内、対象IDは短縮されない。
6. state.jsonの実rename失敗で暗号化・送信を止める。復旧後の未使用番号は1。片方だけ欠けたA8記録は起動拒否。両欄を持たない旧記録のfixtureは全ON/0で移行しHTTP連番を維持。保存ファイルは既存state/lock/診断だけ。

最後の移行は検査用に旧schemaを再現したもので、運用中のA8台帳から欄を削除してよいという意味ではない。

### 純粋関数と共有vectors

- coreの6ケース: push-prefsの厳密なshapeと署名配列、内容／外側検査、時刻境界、種類別の順不同と再送、Unicode・制御文字・80文字の短縮、最悪サイズと対象／表示／期限の署名束縛。
- Node cryptoの既存3ケースに通知vectorsの1ケースを追加。独立pushKey、permission/report/error/testの署名入力・署名・nonce・AAD・平文・暗号文を照合。既存HTTP vectorsも継続成功。
- A7の抑止／旧通知／失敗／receipt検査、既存SECの認証・権限・保存・API分離も全体試験で成功。

## 変更ファイル

実装・試験コミット（22ファイル）:

- `src/core/mobile-push-content.ts`, `src/core/mobile-push-content.test.ts`（新規）
- `src/core/mobile-protocol.ts`, `src/core/mobile-protocol.test.ts`, `src/core/mobile-display.ts`, `src/core/mobile-push.ts`
- `src/server/mobile/push-content.ts`, `src/server/mobile/security-push-content.test.ts`（新規）
- `src/server/mobile/push.ts`, `src/server/mobile/crypto.ts`, `src/server/mobile/crypto.test.ts`, `src/server/mobile/store.ts`, `src/server/mobile/operations.ts`, `src/server/mobile/gateway.ts`, `src/server/mobile/quests.ts`, `src/server/mobile/test-client.ts`, `src/server/relay.ts`
- `scripts/mobile-vectors.mjs`, `docs/mobile-protocol-vectors.json`, `docs/MOBILE-PROTOCOL.md`, `docs/MOBILE.md`, `docs/ARCHITECTURE.md`

証跡コミット: `docs/security/checklist.md`, `docs/security/threat-model.md`, 本記録。

## 残ること・限界

アプリの契約同期／noble vectors照合、背景task・設定画面・端末内通知、受信高水位の原子的保管、タップ後の再取得は別担当。実Expo/APNs/FCM、OS停止／再開、ロック画面、iOS、実電源断は未検証。relayの通知契機の配線は実装確認で、新SEC試験はCLI全体のE2Eではない。

背景taskがOSに実行されない場合はdata-onlyも復号不能時の退避も表示できない。復号後のプレビューはOSのロック画面設定に従い、端末を見られるリスクは残る。通知サービスにはkind・登録ID・長さ・配送時刻が見える。静的DHにはforward secrecyがない。未認証の固定文言退避は偽装・反復され得るが、判断・URL・対象の操作には使わず、タップ後に必ず窓口へ戻る。古い台帳へのロールバックや同一OS利用者の直接改変は隔離しない。窓口の更新／再起動は担当者の管理下で別途行い、通常のA8移行に再ペアリングは不要。
