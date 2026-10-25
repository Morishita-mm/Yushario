# モバイル窓口の脅威モデル

`../MOBILE.md` の T1〜T23 を正とする。通信の正確な形は `../MOBILE-PROTOCOL.md`。対象は Mac の別 HTTP listener と既存画面からの登録 API で、同じ OS 利用者によるファイル・プロセスの直接改変、公開インターネットでの運用、スマホ OS 自体の侵害は隔離しない。

## 脅威と証拠

| ID | 脅威 | 対策 | 検査・証拠 |
|---|---|---|---|
| T1 | 同じネットワークの他人が窓口に要求を送る | 端末の署名、未登録の端末を拒否 | SEC-01：[実 HTTP ペアリング検査](../../src/server/mobile/security-pairing.test.ts) |
| T2 | QR コードを盗み見て先にペアリングする | 5分・1回限りのコード、Mac 側での確認番号の承認 | SEC-02,03：同上（期限、単回、最大5台、HTTP 保留、人の確認） |
| T3 | ペアリング中に経路で鍵をすり替える | Mac の公開鍵を QR で受け取る | SEC-04：同上（pin／端末鍵の書き換えを拒否） |
| T4 | 承認の要求を再送する | 連番・時刻・許可 ID の1回限りの受け付け | SEC-05：[実 HTTP 要求検査](../../src/server/mobile/security-requests.test.ts)（±60秒境界、再起動、判断の再送）＋[実 FS 故障・lock 検査](../../src/server/mobile/security-storage.test.ts) |
| T5 | 経路で要求を書き換える | AEAD による暗号化、改ざんを拒否 | SEC-06：同上。[共有暗号ベクトル](../../src/server/mobile/crypto.test.ts) |
| T6 | Apple・Google・Expo に作業の中身が渡る | 通知は固定の文言だけ | SEC-07：同上（固定3種の payload、作業内容は AEAD 内）。[送信処理](../../src/server/mobile/push.ts) は固定 URL と token/kind だけを使い、[診断の純粋検査](../../src/core/mobile-push.test.ts) で provider message／token の記録を禁止 |
| T7 | 通知用 ID の漏れによる偽の通知 | 通知では操作できない。登録を消すと ID も消える | SEC-08：同上（token 更新、通知の偽造では認可されない、unpair 後の消去） |
| T8 | スマホの紛失・盗難 | 承認・勇者を動かす操作ごとの生体認証、Mac からの取り消し、鍵の安全な保管 | SEC-10：ペアリング検査（即時取り消し）。SEC-09 は別アプリの実機で手動 |
| T9 | 窓口をインターネットへ公開してしまう | 既定で停止、アドレスの明示、全アドレス待受の警告 | SEC-11：[実プロセス・別 listener 検査](../../src/server/mobile/security-startup.test.ts)（既定停止／flag／警告）。`::` も同じ警告分岐 |
| T10 | 窓口から `/pty` などの操作に届く | 別ポート、許可リスト以外を拒否 | SEC-12：要求検査＋実プロセス検査（両方向の経路分離、Host／Origin／token） |
| T11 | コードの総当たり・大量の要求 | 128bit、3失敗で失効、本文上限、要求数の制限 | SEC-13：ペアリング検査＋要求検査（1MiB、毎分30件、転送 IP を信用しない） |
| T12 | 表示と違う内容を承認させられる | 表示した12値（townId・work/change を含む）の SHA-256 を判断へ結び付ける | SEC-14：要求検査（内容変更、省略、期限、ブラウザとの先着） |
| T13 | 誰が承認したか分からない | 判断の記録 | SEC-15：要求検査（0600、4項目だけ、実 FS 保存失敗では判断しない） |
| T14 | アプリの依存パッケージの汚染 | 最小依存、lockfile の固定、脆弱性の検査 | SEC-16：[Mac の CodeQL／OSV／gitleaks と両 npm audit](runs/2026-10-23-sast-da6d36b.md) を実行し、2 advisory と stale-lock race を修正。CI、スマホ側の依存／解析／MobSF は別途必要 |
| T15 | 鍵がバックアップから漏れる | この端末のみの保管、バックアップから除外 | SEC-17：別アプリの Keychain／Keystore と実機バックアップで手動。Mac の0600／0700は SEC-10 |
| T16 | 許可リスト外の実行へ広がる／不正な町・端末を名乗る。A1 の「札の作成だけで実行に進まない」前提は A2 で撤回し、作業の6操作を別に扱う | quest-create は札だけ（既知の不透明 ID、既存のクエスト検査、登録鍵と連番）。作業の6操作は窓口が発行した不透明 ID と固定の列挙だけで、パス・引数・環境変数・状態変更の欄がない | SEC-18：[実 HTTP クエスト検査](../../src/server/mobile/security-quests.test.ts)（quest-create について町・長さ・不明フィールド・未登録／別端末・担当なし・出来事なし。今も有効）。作業は SEC-22 |
| T17 | 応答消失で二重発行／大量発行／誰の発行か不明 | 10分期限の要求 ID を作成前に耐クラッシュ予約、5件/60秒/端末、本文なし監査 | SEC-19：同上（同時再送、再起動、期限後、実 FS 故障、0600と3項目の監査） |
| T18 | 報告から内部のパスや別の出来事、消えた本文が漏れる | 表示フィールドだけの射影、報告だけ・一致するメモリ返答だけ、8000文字と8件の上限 | SEC-20：同上（時刻順ページ、メタデータ除外、保存あり／なしと再起動）＋[純粋検査](../../src/core/mobile-quests.test.ts) |
| T19 | 登録端末の鍵や改造アプリから遠隔実行される／しき役の付与・忙しい勇者の付け替え・フォームの作戦で間接的に動かす | Mac 側の端末ごとの作業許可（既定 off、画面 API だけで変更）、状態による効果の分類（しき・忙しい・送信待ち・付け替えは送信扱い）、作戦は許可された出発まで obey、Claude `--permission-mode default`／Codex `--ask-for-approval untrusted --sandbox workspace-write` の強制、Pi の新規出陣禁止、頻度・人数の上限、取り消し。アプリの操作ごとの本人確認は Mac から検証できない | SEC-21：[作業許可の実 HTTP 検査](../../src/server/mobile/security-capability.test.ts)（既定 off、再起動・旧記録・壊れた値、画面 API の shape）。SEC-22／23 は下記。**証拠は親タスクの実行待ち** |
| T20 | 応答消失・再送・部分的な出発で二重に送る／大量に動かす／下書きが残る | 変更系5操作で共有する要求 ID の効果前 fsync 予約、出発の step journal を各送信前に fsync（編成は保存しない乱数鍵の HMAC だけ）、pending だけを人が新しい ID で再開、unknown は再送しない、再起動後は uncertain で再開しない、5/分・送信系2/分・出陣1/分3/時・端末2人（メモリ上）・全体16、0600 の5項目の試行記録 | SEC-23：[上限・予約・部分出発の実 HTTP 検査](../../src/server/mobile/security-work-limits.test.ts)＋[作業の実 HTTP 検査](../../src/server/mobile/security-work.test.ts)。**証拠は親タスクの実行待ち** |
| T21 | 許可確認のないエージェント・注入した起動引数で動く | 出陣は Claude／Codex のみで承認モードを強制、Pi は options に出さず拒否、既存の Pi は permissionGate:false で警告、他町・未知 ID・注入フィールド・長文の拒否、応答にパスなし | SEC-22：[作業の実 HTTP 検査](../../src/server/mobile/security-work.test.ts)（選択肢、opt-in off、未知／他町 ID、起動フラグ、出発）＋[純粋検査](../../src/core/mobile-work.test.ts)。**証拠は親タスクの実行待ち** |
| T22 | 同名町の取り違え／内部キー・姿からのパス漏えい | 全 DTO が同じ窓口の UUID v4 を使い、町なしは null、theme は本体台帳の5種のみ。町の区画は許可hashにも束縛 | SEC-24：[実 HTTP・SQLite・relay 検査](../../src/server/mobile/security-towns.test.ts)、[純粋検査](../../src/core/mobile-towns.test.ts)、[実行記録](runs/2026-10-24-mobile-towns.md) |
| T23 | 別勇者/別町の作業・変更本文の混同、欠落や省略のある本文の承認 | 認証済み端末と同じ町/勇者の担当snapshot、Write/Edit/MultiEditの本文/順序/全置換/省略数をhashに束縛、本文合計2000・content含め3000・16組・16件、取得不能/省略時の承認拒否 | SEC-25：[実HTTP・relay・CLI検査](../../src/server/mobile/security-permission-content.test.ts)、[実行記録](runs/2026-10-25-mobile-permission-content.md) |

## 実行の性質と残る限界

- SEC テストは実際の Node listener、実ファイル、実際の暗号で行う。SEC-11/12 は別 Node プロセスの Yushario 本体にも HTTP を送る。WS／PTY／暗号のモックは使わない。期限の境界だけ `Date.now` を固定する。
- プロトコル共通のベクトルは固定の公開テスト鍵であり、実データではない。各 HTTP テストは OS の一時ディレクトリへ新しい鍵を作り、終了時に消す。
- 同一コードの3失敗による失効 DoS と、静的 DH に forward secrecy がないことは v1 の明示的な限界。コードは作り直せるが、人の確認を迂回してはならない。
- 連番は操作／応答前に fsync を伴って保存する。stale lock も自動削除せず、同時再起動で他のプロセスの新 lock を消す競合を防ぐ。残った lock は、同じ HOME の全窓口の停止確認後にその1ファイルだけを手動削除し、state.json は残す。Mac の古いバックアップへ戻す時は鍵も作り直して再登録する。意図的なロールバックを同じ OS 利用者から守る機構ではない。
- 自動試験は Expo/APNs/FCM へ通知を実配送しない。ticket／receipt の外部 HTTP 境界と経過時間だけを fake にする追加単体検査で、object／配列 ticket、照会、失効 token の保護、50件・0600・32KiB×2のログを確認する。既存の real HTTP／暗号の SEC 検査は変更しない。実配送・端末での表示、生体認証、カメラ、紛失・バックアップの手順は実機検証として残る。
- クエスト発行は札の記録だけで、追加の生体認証は不要とした。許可判断の本人確認は継続する。予約・監査と SQLite は分かれているため、障害時に札なしの予約が残ることは許し、二重作成は許さない。本文に人／CLI が書いた機密の自動判別・墨消しや、同一 OS 利用者による予約ファイル・時計のロールバックは隔離しない。
- A2 の操作ごとの本人確認はアプリ内の `LocalAuthentication.authenticateAsync` で、結果を wire に載せず Mac も信用しない。`expo-secure-store` の `requireAuthentication` は AES の保存鍵を認証に結び付けるだけで、Ed25519 の秘密は署名時に JS へ取り出される。鍵の attestation もないため、改造・侵害されたアプリは本人確認を飛ばせる。この限界は Mac 側の既定 off の許可・上限・強制した承認モード・取り消しで補い、実機での安全性は主張しない（`../MOBILE.md`「採用しなかった鍵の束縛」）。
- A2 で既存の Pi へ送った依頼は許可確認なしで実行される。警告は表示するが、Pi の挙動自体は隔離しない。
- 強制した承認モードは、全道具で確認が出ることを意味しない。利用者の Claude の allow rules・Codex の設定による道具ごとの許可はそのまま効く。同じ Mac で人が手動で呼び戻した勇者は通常の Mac の flag で起動する（mobile からの recall はない）。
- prepare の本文は Mac のクエスト作成と同じく目的（最大8000文字）として保存される。form で編集した本文・補助への依頼はメモリだけで、送った本文はクエストの出来事に残る。`work-departures.json` は1000件で止まり自動では間引かない。
- 作業の監査は試行の記録で、配送の証拠ではない。同時に生きている勇者の数（端末ごと2人）はメモリで数えるため、再起動で数え直しになる（出陣の1件/分・3件/時は耐久）。
- この証跡だけで ASVS L2 全体への適合やリリース承認を主張しない。状態は [checklist.md](checklist.md)、対象コミットと実行環境は `runs/` に残す。
