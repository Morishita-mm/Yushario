# A7: 初回登録・通知の検証

## 対象と環境

- 2026-10-25、macOS / arm64、Node `v26.4.0`、npm `11.17.0`、Vitest `4.1.12`。
- 本体 `feat/mobile-quests`、開始時 `89774c6`、実装コミット `b8a53e148566c0b21feecba91424a3b5aee493a4`。試験・本記録は後続の別コミット。
- 追加依存なし。アプリ側README・画面は別担当で、この作業からアプリリポジトリは変更していない。pushなし。
- SEC検査は一時ディレクトリ、生成した検査用鍵、合成データ、localhostの空きポートを使用。Mac画面API、暗号化窓口、偽ExpoのHTTP listenerは実物。Expoへのfetchだけ宛先をローカル偽送り先に差し替え、ネットワーク失敗のケースだけrejectさせる。
- 追加検査のMac listenerは既存例と同じくhandleMobileApiを直接載せる。外側のHost／Origin／画面tokenの認可境界は変更せず、既存security-startupの実プロセス検査で継続確認する。
- 実Expo/APNs/FCMへ通知していない。利用者の秘密鍵・通知ID・設定・保存データは読み取り／記録／コミットしていない。8790には触れず、8792・8799・8081の既存プロセスも操作／再起動していない。

## 実装した挙動

1. **Mac承認時の作業許可**
   - 「この端末から依頼・出陣も許可する」は新しい承認カードごとに未チェック。定期更新は同じカードで利用者が選んだ状態を維持する。
   - Mac専用 `POST /api/mobile/confirm` が任意の `allowWork:boolean` を受け取り、登録と同じstate保存に含める。省略／falseはoff、trueだけon。文字列・数値・null・オブジェクトは拒否する。拒否の操作ではtrueでも端末を登録しない。
   - 承認後に「あとから スマホ → この端末 で変えられます」を表示。既存の端末別切り替え・遠隔コマンド実行の注意書きは維持する。
2. **登録端末の見分け**
   - 既存の端末名に登録日時createdAtを追加し、最後の接続lastSeenAtも残す。承認カードは元からスマホの申告名を表示しており、そのまま維持。名前変更は追加しない。
3. **種類別の固定通知**
   - 題はすべて `Yushario`、permission「確認が必要です」、report「報告が届きました」、error「勇者が止まりました」。
   - data.kindの3分類は不変。作業内容・町名・勇者名・コマンド・パス・許可ID等は送らない。priority=high、channelId=alertsも不変。
4. **重複抑止と有効期間**
   - 自動通知は端末別・kind別。送信中は同じ連番の重複を抑止し、ticketがokなら既存 `mobile/state.json` の端末内 `notifiedKinds` に印を保存する。最大3種類・重複なし。保存ファイルを追加しない。
   - 次の認証済み要求の連番保存と同時にその端末の全種類を解除。未認証／署名不正／replayでは解除しない。送信時の連番と現在の連番が違う古いticketも印を付けない。
   - 再起動でも印を維持。欄がない旧記録は空として読み、鍵・連番・既存allowWorkを維持。不正な印の台帳は書き換えず拒否する。
   - ネットワーク失敗・ticketエラー・tokenなしでは印を付けず、次の通知機会に送れる（通知自体を自動再送はしない）。明示的なMacテスト通知は抑止を迂回し、自動通知の印も付けない。既存の処理数上限は維持する。
   - relayのpermissionからexpiresAtを渡し、permissionだけ `ttl = floor(min(120000, expiresAt - now) / 1000)`。1秒未満／期限切れは送らない。手動テストは120秒以下。report/errorにはttlを足さない。

## 手順と結果

| 検査 | 結果 |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS: 77ファイル、884テスト（75.22秒） |
| 下記6ファイルの `npm exec vitest run …` | PASS: 41テスト（3.71秒） |
| `git diff --check` | PASS |

対象6ファイルは `src/core/mobile-pairing.test.ts`、`src/core/mobile-push.test.ts`、`src/server/mobile/push.test.ts`、`src/server/mobile/security-capability.test.ts`、`src/server/mobile/security-requests.test.ts`、`src/server/mobile/security-onboarding.test.ts`。

### 実HTTPの追加証拠

`security-capability.test.ts` の追加1ケース（SEC-02/21）:

- 実窓口へpairを送り保留させ、実Mac画面APIへ承認をPOST。allowWorkの省略・false・trueをそれぞれ検査し、再起動して永続化を確認。
- 各ケースで非booleanを拒否。同名の端末を登録でき、画面向けsnapshotがname/createdAt/lastSeenAt/allowWorkを返し、秘密欄や抑止印を増やしていないことを確認。
- 拒否時のallowWork=trueでも登録されない。従来の後からの切り替え・旧台帳の既定off・壊れたallowWorkの停止検査も成功。

`security-onboarding.test.ts` の5ケース（SEC-07/08拡張）:

1. 実窓口で通知IDを設定し、合成の許可待ちを置く。ローカル偽Expoが受け取った3種のpayloadを完全なキー集合で検査。許可の残り約60秒にはttl=59〜60、報告／失敗にはttlなし。期限切れと残り1秒未満は送らない。合成作業内容が混入せず、診断ログは従来の安全な6項目だけでtoken・本文・ticket IDなし。
2. 同名の2端末へreport/errorを送り、種類別・端末別の抑止を確認。一方だけが署名付きstatusへ接続すると、その端末だけ再送可能。署名不正と成功要求のreplayでは解除せず、窓口再起動でも印が残る。もう一方のpermissions接続ではその端末だけ解除。保存先のファイル集合もstate.json、既存lock、既存診断ログのみ。
3. ネットワーク失敗／ticketエラー後は印がなく、次の機会に成功できる。自動reportを抑止している最中でもMacの実test-push APIから2回送れる。テスト通知はpermissionの自動印を付けず、自動permissionは別に送れる。tokenなしでも印は付かず、更新後に送れる。
4. 偽Expoのticket応答を保留。同じ連番での重複は送らず、その間に端末がstatusへ接続した後の遅いokでは再抑止しない。次の通知のokだけで新しい印が付く。
5. 検査専用stateのnotifiedKindsだけを削除して旧記録を再現。allowWork=true・ID・連番を維持して読み、通知可能。重複kindを含む不正台帳は起動拒否し、元ファイルの内容を変更しない。

### 純粋計算・既存検査

- `mobile-pairing.test.ts`: 各kindの厳密な固定文言、未知kind拒否。
- `mobile-push.test.ts`（core）: ttlの120秒上限、秒未満の切り捨て、1秒／999ms境界、期限切れ／不正時刻。
- `push.test.ts`: 既存ticket／receipt／安全な診断の確認を維持。permissionのttlを検査し、50件上限の検査は重複抑止を迂回する明示テスト通知で行う。
- `security-requests.test.ts`: SEC-07の固定文言期待値のみ3種に更新。許可本文のAEAD内限定等の検査は維持。

## アプリ担当への契約

- スマホ `/mobile/v1` の要求・応答・署名配列は変更なし。pair bodyへallowWorkを足してはならない。共有暗号vectorsは変更不要。
- 通知は既存data.kindと上記の固定本文で識別できる。通知を直接許可対象にせず、開いた後は窓口へ取得する。通知の抑止解除用の新しいAPIは不要。
- Macの初回チェックと承認後案内の文言、任意allowWorkを受けるMac専用APIを本体MOBILE-PROTOCOLに記載した。アプリ側README／画面への反映は別担当。
- このコードを動作中の窓口に反映するには担当者の管理下で窓口を更新／再起動する。再ペアリングは不要。この検証では実行していない。

## 変更ファイル

実装コミット:

- `src/core/mobile-pairing.ts`, `src/core/mobile-push.ts`
- `src/server/mobile/api.ts`, `src/server/mobile/gateway.ts`, `src/server/mobile/pairing.ts`, `src/server/mobile/push.ts`, `src/server/mobile/store.ts`, `src/server/relay.ts`
- `src/web/rpg/app.html`, `src/web/rpg/mobile-api.ts`, `src/web/rpg/mobile.css`, `src/web/rpg/mobile.ts`
- `docs/ARCHITECTURE.md`, `docs/MOBILE.md`, `docs/MOBILE-PROTOCOL.md`

試験・証跡コミット:

- 上記対象6テストファイル（`security-onboarding.test.ts`は新規）
- `docs/security/checklist.md`, `docs/security/threat-model.md`, 本記録

## 限界・未実施

Macの表示変更はソース・型検査で確認し、実ブラウザでの操作検証は未実施。実機アプリの画面・通知配送／端末表示・カメラ・OS本人確認は別途で、TTLは送信時点の計算とpayloadを検査したもので実サービスの時間どおりの配送を保証しない。Expo受付とstate保存の間の電源断、または送信先が受け取ってからのネットワーク切断まで含むexactly-once配送は保証しない。抑止印の保存に失敗した時は内容なしの警告を出して次の通知を許す。許可の最終的な期限・未回答検査は従来どおり窓口で行う。全体のリリース承認や未実施SEC項目の完了を意味しない。
