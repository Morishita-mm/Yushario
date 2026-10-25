# モバイル窓口：ASVS L2 の該当チェック

基準は [OWASP ASVS 4.0.3](https://github.com/OWASP/ASVS/tree/v4.0.3)。対象はこの PoC の Mac 窓口に該当する管理策で、網羅的な ASVS 適合宣言・第三者認証ではない。L2 を目標に、実装／自動証拠のあるもの、部分的なもの、未実施を区別する。脅威の対応は [threat-model.md](threat-model.md)。実行結果は [窓口の初回検証](runs/2026-10-22-f881937.md) と [通知の配送確認・診断](runs/2026-10-22-7094164.md)、[静的解析・lock race 修正](runs/2026-10-23-sast-da6d36b.md)、[クエスト発行・報告確認（SEC-18〜20）](runs/2026-10-23-mobile-quests-28c94e1.md)。A2（SEC-21〜23）は [依頼・出陣・パーティー出発の検証](runs/2026-10-23-mobile-work-950ea0a.md) を参照。実機の本人確認・電源断・全体リリースの完了を意味しない。

## 証拠の入口

- [P：実 HTTP ペアリング検査](../../src/server/mobile/security-pairing.test.ts)
- [R：実 HTTP 要求・判断検査](../../src/server/mobile/security-requests.test.ts)
- [S：実 Yushario プロセスの起動・認可・経路分離検査](../../src/server/mobile/security-startup.test.ts)
- [C：Node 暗号の共有ベクトル](../../src/server/mobile/crypto.test.ts)／[共通の仕様](../MOBILE-PROTOCOL.md)
- [F：実 FS 故障・同一台帳 lock・破損時停止](../../src/server/mobile/security-storage.test.ts)。stale lock も自動回収せず拒否し、lock だけの手動復旧で鍵・連番を保持する
- [core の純粋な検査](../../src/core/mobile-protocol.test.ts)／[コード状態・SAS・通知](../../src/core/mobile-pairing.test.ts)
- [通知の純粋 parser／ログの shape](../../src/core/mobile-push.test.ts)、[Expo 境界の単体検査](../../src/server/mobile/push.test.ts)、[0600・上限・ローテート](../../src/server/mobile/push-log.test.ts)。外部 Expo と経過時間だけを fake にし、実通知は送らない

- [Q：実 HTTP クエスト発行・報告検査](../../src/server/mobile/security-quests.test.ts)。SEC-18（最小権限／入力／端末）、SEC-19（重複／頻度／監査／実 FS 故障）、SEC-20（表示射影／本文寿命／ページ）。[純粋な型・署名の検査](../../src/core/mobile-quests.test.ts)、C の追加共通ベクトルは別アプリの noble 実装でも確認する
- [W：A2 の作業検査](../../src/server/mobile/security-work.test.ts)、[上限・予約・部分出発](../../src/server/mobile/security-work-limits.test.ts)、[端末ごとの作業許可](../../src/server/mobile/security-capability.test.ts)。SEC-21（Mac 側の既定 off の許可）、SEC-22（権限・出陣の制限・不透明 ID・Pi）、SEC-23（全変更系の要求 ID／頻度／部分出発／注入／パスなし）。[入力・別町・注入](../../src/server/mobile/security-work-inputs.test.ts)、[作戦と権限昇格](../../src/server/mobile/security-work-tactics.test.ts)、[再起動・不確実配送](../../src/server/mobile/security-work-crash.test.ts)、[純粋な型・署名の検査](../../src/core/mobile-work.test.ts)。実 HTTP の30件と全体848件が成功（上の実行記録）。CLI は実プロセスの fixture で、実 LLM ではない。

- [T：A3 の町の所属・姿（SEC-24）](../../src/server/mobile/security-towns.test.ts)。実 HTTP の3ケースで、同名町・全5テーマ/null・各 DTO の同一ID・他町拒否・削除/再起動/退場・パス非公開・許可hashの町への束縛を確認。[純粋検査](../../src/core/mobile-towns.test.ts)、[実行記録](runs/2026-10-24-mobile-towns.md)。本体854件とアプリ53件が成功。

- [P25：A4 の許可の作業・本文（SEC-25）](../../src/server/mobile/security-permission-content.test.ts)。実 HTTP の4ケースで認証済み端末の作業snapshot・別勇者/別町非混同、本文と作業のhash束縛、省略/欠落時の承認拒否、16件の最悪escape応答を確認。[抽出の純粋検査](../../src/core/permission-change.test.ts)、[両実装の契約検査](../../src/core/mobile-permission.test.ts)、[実行記録](runs/2026-10-25-mobile-permission-content.md)。本体864件・アプリ80件成功。

- [E：A5の装備表示（SEC-22拡張）](../../src/server/mobile/security-work-equipment.test.ts)。実relay/HTTP/cryptoの2ケースで既定/上書きマスタと勇者のmodel/effort、64文字/7値/不適合null、選択肢維持、表示値や未知IDでの起動拒否を確認。[純粋契約検査](../../src/core/mobile-work-equipment.test.ts)、[実行記録](runs/2026-10-25-mobile-equipment.md)。Permissionのhashと起動権限の規則は変更しない。

- [O：A7初回導線・通知（SEC-02/21・07/08拡張）](../../src/server/mobile/security-onboarding.test.ts)と[承認APIの作業許可](../../src/server/mobile/security-capability.test.ts)。実HTTPのMac承認・暗号化窓口・ローカル偽Expoで、allowWorkの省略/false/true・再起動、固定3種・期限ttl・端末別kind抑止・認証接続解除・遅いticket・失敗時再試行・手動テスト例外・旧台帳を確認。[実行記録](runs/2026-10-25-mobile-onboarding.md)。通知サービスへの実配送はしない。

- [N：A8通知内容・設定（SEC-26）](../../src/server/mobile/security-push-content.test.ts)。実HTTP＋ローカル偽Expoで設定の型／宛先／永続化／OFF、固定文言退避、復号と別端末・改ざん・署名不良・再送・期限拒否、独立連番の予約／再起動／上限／実FS失敗、4KBと診断の秘匿を検査。[純粋検査](../../src/core/mobile-push-content.test.ts)、[暗号vectors](../../src/server/mobile/crypto.test.ts)、[記録](runs/2026-10-26-mobile-push-content.md)。背景task・OS表示・受信高水位保存は別アプリの責務。

## 窓口に該当する管理策

| ASVS の該当範囲 | 確認すること | 状態 | 証拠／残ること |
|---|---|---|---|
| V1 Architecture / Threat Modeling | 境界、攻撃者、信頼する入力、許可リストを明文化 | 実装・文書化済み | threat-model、MOBILE、MOBILE-PROTOCOL、ARCHITECTURE。公開インターネットと同一 OS 利用者の隔離は範囲外 |
| V4.1.1 | 認可を信頼できる server 側で強制 | 自動確認済み | P SEC-01/03、S SEC-12。署名・登録・Mac の明示承認が必要 |
| V4.1.3 | 最小権限・既定拒否 | 自動確認済み | R/S SEC-12、Q SEC-18。17操作（A8の自分のpush-prefsを含む）だけで `/pty`・`/ws`・任意コマンド API・他端末の unpair へ届かない。A2 で送信・出陣・出発を加えたため、端末ごとの作業許可（既定 off）、状態による効果の分類（しき役・忙しい／送信待ち・付け替えは送信扱い）、作戦は出発まで obey、強制した承認モード、Pi 新規出陣の拒否を W SEC-21/22 で確かめる |
| V4 Access Control | 取り消しを次の要求へ即時反映 | 自動確認済み | P SEC-10、R SEC-08、S SEC-12。公開鍵台帳・通知 ID・連番を画面 API に出さない |
| V5.1.3 / V5.1.4 | allowlist、型・長さ・数値範囲の検査 | 自動確認済み | core、R SEC-12/13、Q SEC-18/20。UTF-8、base64url、孤立サロゲート、A1 の題200／目的2000、A2 の依頼・全文目的8000（W SEC-22/23）、報告本文8000とページ8件、固定 shape |
| V5 Input Validation | 表示内容と承認の対象が同じ | 自動確認済み | R SEC-14、C、T SEC-24、P25 SEC-25。townId・work/change（前後/全置換/省略/不明）を含む12値の SHA-256、期限・本文/組省略・未回答と先着の検査 |
| V6.2 Cryptographic Algorithms | 標準の認証付き暗号・署名、独自暗号を作らない | 自動確認済み | C、P SEC-04、R SEC-06。Node crypto だけ、X25519／Ed25519／HKDF-SHA256／IETF ChaCha20-Poly1305 |
| V6.2 Cryptographic Algorithms | 同じ鍵の nonce 再使用を防ぐ | 自動確認＋実装確認 | R/F SEC-05（再起動・実 FS 故障・lock・破損含む）、[store](../../src/server/mobile/store.ts)。方向別鍵・コードに結び付く deviceId・耐クラッシュ連番・1プロセス lock。N SEC-26で通知専用HKDF鍵と独立pushSeqの暗号化前予約、再起動・失敗・欠番・版切替・上限でも戻さないことを追加確認。stale lock の自動削除による同時起動 race は修正済み。電源断試験は未実施 |
| V6.3.1 | 適切な乱数生成器 | 実装確認済み | [crypto](../../src/server/mobile/crypto.ts) の generateKeyPairSync、[pairing](../../src/server/mobile/pairing.ts) の randomBytes(16)。固定鍵は C のテストだけ |
| V6.4 Secret Management | 秘密鍵の保管・最小公開 | 自動確認＋実装確認 | P SEC-10、S SEC-12。0700/0600、破損時停止。古い台帳の復元は鍵の再作成と再登録が必要 |
| V7.1 Logging | 本文・コード・通知 ID をログへ出さない | 自動確認＋実装確認 | R SEC-15、[push](../../src/server/mobile/push.ts)。判断は deviceId/permissionId/result/time の4項目だけ。発行予約は deviceId/questId/time の3項目（Q SEC-19）だけで題・目的を残さない。A2 の作業記録は deviceId/operation/questId/heroId/time の5項目だけで本文・依頼を残さない（W SEC-23）。通知も安全な6項目だけを50件・32KiB×2ファイルに制限し、provider message／token／ticket ID は記録しない |
| V7.1 Logging | セキュリティ上の事象の追跡 | 部分実装 | 判断の監査保存は配送前で、実 FS 失敗なら判断しない（R SEC-15）。発行も予約／監査保存が作成より先で、実 FS 失敗では作成しない（Q SEC-19）。登録・失敗・取り消し全件の長期監査は本タスクの範囲外 |
| V7.4.1 | 情報を漏らさないエラー | 自動確認済み | P SEC-01、R SEC-06/12/13。一般拒否1種類、版違いだけ supportedVersion。nonce を再使用する暗号エラー応答は作らない |
| V8 Data Protection | 最小データ、キャッシュ・通知の抑制 | 自動確認＋実装確認 | R SEC-07/08/15、S SEC-12。no-store、要約500文字／本文8000文字、Q SEC-20 のメタデータ除外・既存の保存／メモリ方針、A8は暗号化data-only、旧端末は固定通知（channelId=alerts）、unpair で token 消去。OのA7拡張でkind別本文・permissionの残存期限ttl・既存stateの端末別kind抑止と認証済み接続時の解除を検査 |
| V4 / V8 Town Context | 同名町の取り違えと内部キーの漏えいを防ぐ | 自動確認＋実装確認 | T SEC-24。窓口の1つの UUID v4 対応表、null の所属、町の台帳の5種の theme のみ。表示名／パスからIDや姿を作らない |
| V9.1.1 Communications | クライアント通信に TLS を使う | 未達／設計上の制限 | LAN/Tailscale の HTTP にアプリ間 AEAD を必須にするが、HTTP transport 自体の TLS を必須にはしていない。ASVS 全体適合とはしない。Expo へは Node 標準の検証付き HTTPS |
| V14 Configuration | 明示的な有効化、限定経路、要求数・サイズ上限 | 自動確認済み | S SEC-11/12、R/P SEC-13。flag なし停止、全アドレス警告、既存 Host/Origin/token 不変 |
| V4 / V11 Business Logic | A2 の送信・出陣・出発の重複と濫用を防ぐ | 自動確認＋実装確認 | W SEC-23。変更系5操作の共有要求 ID（効果前 fsync）、5/分・送信系2/分・出陣1/分3/時・端末2人・全体16人、出発の journal（pending のみ人が新 ID で再開、unknown は再送しない、再起動後は uncertain で再開しない、編成は保存しない鍵の HMAC だけ）、0600 の5項目の試行記録（prepare／form のメンバーごと／spawn／send／出発） |
| V4 / V11 Business Logic | 作成の重複と濫用を防ぐ | 自動確認済み | Q SEC-19。期限つき要求 ID の先行予約・再起動後と並行要求でも重複拒否・5件/60秒/端末、失敗は一般拒否。障害で札のない予約は残り得る |
| V14 Dependencies | 依存の固定と既知の脆弱性の検査 | Mac の単発検証済み／全体は部分 | Vitest/mocker の2 advisory を4.1.12 patch で解消、追加依存なし。OSV・全体／runtime npm audit は0件。gitleaks は19件×2の公開ベクトル FP、CodeQL は残る19件を全分類（FP 8・AR 11）。実行記録参照。CI 運用と別アプリの検査は未完了 |

## 自動化していない項目・実機の残作業

- **SEC-26のアプリ部分**：background taskの登録／復号／登録×kind別高水位の原子的保存／ローカル表示、復号不能時の固定文言退避と対象なし遷移、Android/iOSの実配送を別担当が検証する。暗号化プレビューもロック画面に出れば他人に読める。未認証退避の一般通知は偽装され得るため、タップ後の再取得・通常判断は省略しない。

- **SEC-09**：各判断と A2 の勇者を動かす操作の生体認証／端末ロック解除はスマホ OS と別アプリの責務。Mac の HTTP 検査だけでは保証できない。Keystore に結び付けた署名鍵・attestation は採用していないので、改造アプリが確認を飛ばすことは防げない（threat-model の T19）。
- **SEC-21〜23 の実機部分**：自動 HTTP／PTY／CLI fixture の確認は上の実行記録に記載した。実際の Claude/Codex 各版の許可画面、スマホでの Pi 警告、OS 本人確認、送信瞬間の電源断は未実施。`unknown` の検査は journal の crash-window 状態を検査用に置いて再起動するもので、実電源断試験ではない。
- **SEC-16**：[Mac の CodeQL／OSV／gitleaks と両 npm audit](runs/2026-10-23-sast-da6d36b.md) を実行。2つの moderate advisory（GHSA-qxg6-89mg-rqv8、GHSA-xp26-3454-mjgp）を patch 更新し、stale-lock race も修正した。未 triage／未修正の確認済み TP はないが、同一 OS の直接改変などの AR は残る。CI への継続実行、別リポジトリのスマホ依存、MobSF と供給元評価は未完了。
- **SEC-17**：iOS の「この端末のみ」Keychain、Android Keystore の暗号化、バックアップからの除外・復元は別アプリと実機で確かめる。
- **SEC-07/08 の実配送部分**：ticket と receipt の区別、object／単一配列 ticket、照会・timeout・DNR と更新済み token の保護は外部 fetch の単体 fake で確認した。A7は実HTTPのローカル偽Expoも使い固定文言・抑止・送信時ttlを確認するが、FCM/APNs の実配送と端末表示は担当者のエミュレーター確認が必要で、receipt の ok だけで表示を保証しない。
- カメラでの QR 読み取り、LAN／Tailscale と iOS／Android の経路切り替え、紛失時の手順、耐クラッシュ保存の電源断は手動で残る。自動試験と Orca 内蔵ブラウザでの登録表示だけを実機検証の代わりにしない。

未実施項目を隠してリリース条件を満たしたとは扱わない。今回の完了は「Mac 窓口の実装と指定した自動検査」であり、別アプリの実機検証と全体のリリース承認は別段階。
