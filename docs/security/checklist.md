# モバイル窓口：ASVS L2 の該当チェック

基準は [OWASP ASVS 4.0.3](https://github.com/OWASP/ASVS/tree/v4.0.3)。対象はこの PoC の Mac 窓口に該当する管理策で、網羅的な ASVS 適合宣言・第三者認証ではない。L2 を目標に、実装／自動証拠のあるもの、部分的なもの、未実施を区別する。脅威の対応は [threat-model.md](threat-model.md)。実行結果は [窓口の初回検証](runs/2026-10-22-f881937.md) と [通知の配送確認・診断](runs/2026-10-22-7094164.md)、[静的解析・lock race 修正](runs/2026-10-23-sast-da6d36b.md)。

## 証拠の入口

- [P：実 HTTP ペアリング検査](../../src/server/mobile/security-pairing.test.ts)
- [R：実 HTTP 要求・判断検査](../../src/server/mobile/security-requests.test.ts)
- [S：実 Yushario プロセスの起動・認可・経路分離検査](../../src/server/mobile/security-startup.test.ts)
- [C：Node 暗号の共有ベクトル](../../src/server/mobile/crypto.test.ts)／[共通の仕様](../MOBILE-PROTOCOL.md)
- [F：実 FS 故障・同一台帳 lock・破損時停止](../../src/server/mobile/security-storage.test.ts)。stale lock も自動回収せず拒否し、lock だけの手動復旧で鍵・連番を保持する
- [core の純粋な検査](../../src/core/mobile-protocol.test.ts)／[コード状態・SAS・通知](../../src/core/mobile-pairing.test.ts)
- [通知の純粋 parser／ログの shape](../../src/core/mobile-push.test.ts)、[Expo 境界の単体検査](../../src/server/mobile/push.test.ts)、[0600・上限・ローテート](../../src/server/mobile/push-log.test.ts)。外部 Expo と経過時間だけを fake にし、実通知は送らない

- [Q：実 HTTP クエスト発行・報告検査](../../src/server/mobile/security-quests.test.ts)。SEC-18（最小権限／入力／端末）、SEC-19（重複／頻度／監査／実 FS 故障）、SEC-20（表示射影／本文寿命／ページ）。[純粋な型・署名の検査](../../src/core/mobile-quests.test.ts)、C の追加共通ベクトルは別アプリの noble 実装でも確認する

## 窓口に該当する管理策

| ASVS の該当範囲 | 確認すること | 状態 | 証拠／残ること |
|---|---|---|---|
| V1 Architecture / Threat Modeling | 境界、攻撃者、信頼する入力、許可リストを明文化 | 実装・文書化済み | threat-model、MOBILE、MOBILE-PROTOCOL、ARCHITECTURE。公開インターネットと同一 OS 利用者の隔離は範囲外 |
| V4.1.1 | 認可を信頼できる server 側で強制 | 自動確認済み | P SEC-01/03、S SEC-12。署名・登録・Mac の明示承認が必要 |
| V4.1.3 | 最小権限・既定拒否 | 自動確認済み | R/S SEC-12、Q SEC-18。10操作だけで、札の作成を加えても送信・担当・出陣・PTY・WS・任意コマンド・他端末の unpair へ届かない |
| V4 Access Control | 取り消しを次の要求へ即時反映 | 自動確認済み | P SEC-10、R SEC-08、S SEC-12。公開鍵台帳・通知 ID・連番を画面 API に出さない |
| V5.1.3 / V5.1.4 | allowlist、型・長さ・数値範囲の検査 | 自動確認済み | core、R SEC-12/13、Q SEC-18/20。UTF-8、base64url、孤立サロゲート、題200／目的2000、本文8000とページ8件、固定 shape |
| V5 Input Validation | 表示内容と承認の対象が同じ | 自動確認済み | R SEC-14、C。9値の SHA-256、期限・省略・未回答と先着の検査 |
| V6.2 Cryptographic Algorithms | 標準の認証付き暗号・署名、独自暗号を作らない | 自動確認済み | C、P SEC-04、R SEC-06。Node crypto だけ、X25519／Ed25519／HKDF-SHA256／IETF ChaCha20-Poly1305 |
| V6.2 Cryptographic Algorithms | 同じ鍵の nonce 再使用を防ぐ | 自動確認＋実装確認 | R/F SEC-05（再起動・実 FS 故障・lock・破損含む）、[store](../../src/server/mobile/store.ts)。方向別鍵・コードに結び付く deviceId・耐クラッシュ連番・1プロセス lock。stale lock の自動削除による同時起動 race は修正済み。電源断試験は未実施 |
| V6.3.1 | 適切な乱数生成器 | 実装確認済み | [crypto](../../src/server/mobile/crypto.ts) の generateKeyPairSync、[pairing](../../src/server/mobile/pairing.ts) の randomBytes(16)。固定鍵は C のテストだけ |
| V6.4 Secret Management | 秘密鍵の保管・最小公開 | 自動確認＋実装確認 | P SEC-10、S SEC-12。0700/0600、破損時停止。古い台帳の復元は鍵の再作成と再登録が必要 |
| V7.1 Logging | 本文・コード・通知 ID をログへ出さない | 自動確認＋実装確認 | R SEC-15、[push](../../src/server/mobile/push.ts)。判断は deviceId/permissionId/result/time の4項目だけ。発行予約は deviceId/questId/time の3項目（Q SEC-19）だけで題・目的を残さない。通知も安全な6項目だけを50件・32KiB×2ファイルに制限し、provider message／token／ticket ID は記録しない |
| V7.1 Logging | セキュリティ上の事象の追跡 | 部分実装 | 判断の監査保存は配送前で、実 FS 失敗なら判断しない（R SEC-15）。発行も予約／監査保存が作成より先で、実 FS 失敗では作成しない（Q SEC-19）。登録・失敗・取り消し全件の長期監査は本タスクの範囲外 |
| V7.4.1 | 情報を漏らさないエラー | 自動確認済み | P SEC-01、R SEC-06/12/13。一般拒否1種類、版違いだけ supportedVersion。nonce を再使用する暗号エラー応答は作らない |
| V8 Data Protection | 最小データ、キャッシュ・通知の抑制 | 自動確認＋実装確認 | R SEC-07/08/15、S SEC-12。no-store、要約500文字／本文8000文字、Q SEC-20 のメタデータ除外・既存の保存／メモリ方針、固定通知（channelId=alerts）、unpair で token 消去 |
| V9.1.1 Communications | クライアント通信に TLS を使う | 未達／設計上の制限 | LAN/Tailscale の HTTP にアプリ間 AEAD を必須にするが、HTTP transport 自体の TLS を必須にはしていない。ASVS 全体適合とはしない。Expo へは Node 標準の検証付き HTTPS |
| V14 Configuration | 明示的な有効化、限定経路、要求数・サイズ上限 | 自動確認済み | S SEC-11/12、R/P SEC-13。flag なし停止、全アドレス警告、既存 Host/Origin/token 不変 |
| V4 / V11 Business Logic | 作成の重複と濫用を防ぐ | 自動確認済み | Q SEC-19。期限つき要求 ID の先行予約・再起動後と並行要求でも重複拒否・5件/60秒/端末、失敗は一般拒否。障害で札のない予約は残り得る |
| V14 Dependencies | 依存の固定と既知の脆弱性の検査 | Mac の単発検証済み／全体は部分 | Vitest/mocker の2 advisory を4.1.12 patch で解消、追加依存なし。OSV・全体／runtime npm audit は0件。gitleaks は19件×2の公開ベクトル FP、CodeQL は残る19件を全分類（FP 8・AR 11）。実行記録参照。CI 運用と別アプリの検査は未完了 |

## 自動化していない項目・実機の残作業

- **SEC-09**：各判断の生体認証／端末ロック解除はスマホ OS と別アプリの責務。Mac の HTTP 検査だけでは保証できない。
- **SEC-16**：[Mac の CodeQL／OSV／gitleaks と両 npm audit](runs/2026-10-23-sast-da6d36b.md) を実行。2つの moderate advisory（GHSA-qxg6-89mg-rqv8、GHSA-xp26-3454-mjgp）を patch 更新し、stale-lock race も修正した。未 triage／未修正の確認済み TP はないが、同一 OS の直接改変などの AR は残る。CI への継続実行、別リポジトリのスマホ依存、MobSF と供給元評価は未完了。
- **SEC-17**：iOS の「この端末のみ」Keychain、Android Keystore の暗号化、バックアップからの除外・復元は別アプリと実機で確かめる。
- **SEC-07/08 の実配送部分**：ticket と receipt の区別、object／単一配列 ticket、照会・timeout・DNR と更新済み token の保護は外部 fetch の単体 fake で確認した。既存の real HTTP SEC 検査は変更しない。FCM/APNs の実配送と端末表示は担当者のエミュレーター確認が必要で、receipt の ok だけで表示を保証しない。
- カメラでの QR 読み取り、LAN／Tailscale と iOS／Android の経路切り替え、紛失時の手順、耐クラッシュ保存の電源断は手動で残る。自動試験と Orca 内蔵ブラウザでの登録表示だけを実機検証の代わりにしない。

未実施項目を隠してリリース条件を満たしたとは扱わない。今回の完了は「Mac 窓口の実装と指定した自動検査」であり、別アプリの実機検証と全体のリリース承認は別段階。
