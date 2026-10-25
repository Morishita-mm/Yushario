# 時間制約のある通知を high priority に固定（2026-10-22 UTC）

対象：`feat/mobile-gateway`、base `52da33e` からの本記録と同じコミット。検証は JST 2026-10-23 00:23（UTC 2026-10-22 15:23）。

## 担当者の実 FCM 観測（JST 2026-10-23）

- **00:15:24**：gateway のテスト通知（Expo default priority）は ticket ok → receipt ok だったが、3分後も端末に表示されなかった。device idle は ACTIVE、app standby bucket は10。
- **00:16:1x 頃**：同じフィールドに `"priority":"high"` だけを加えた直接 Expo POST は、**00:16:20**に表示された。channel は `fcm_fallback_notification_channel`、importance は3。
- GMS の MCS link は不安定で、connects=8、`Seen good heartbeat in last connection? false` だった。

これは通常優先度の配送が遅延・欠落しうる経路と整合し、利用者に見せる時間制約のある通知を high に揃える根拠になる。ただし、個別メッセージの内部の消失理由までは断定しない。receipt ok も、high priority も、端末の表示・音・閲覧の保証ではない。

参考：[Expo の priority](https://docs.expo.dev/push-notifications/sending-notifications/#message-request-format)、[FCM Android の message priority](https://firebase.google.com/docs/cloud-messaging/android/message-priority)。high は時間制約のある利用者向け通知に使用する。

## 変更

- 純粋な `mobilePushPayload` の1か所で `priority: "high"` を固定。許可・報告・失敗と Mac のテスト通知すべてに適用され、送信側への二重指定や設定項目は足さない。
- 固定の題／本文、data の kind だけという機密性の制約は維持する。7操作・暗号・署名・共有ベクトル、receipt 照会とログの6項目は変更しない。
- core の全 kind、SEC-07、実際の Expo send body の期待値を更新。send の期待値は helper の呼び出しではなく独立した固定値にし、priority の欠落も余分なフィールドも検出する。
- MOBILE-PROTOCOL と MOBILE の通知節を更新。依存追加なし。

## Android channel の扱い

**channelId は追加しない**。今回の成功は fallback channel・importance=3 で、アプリが定義した high-importance channel の ID は未確認・未合意だからである。

アプリ側で専用の安定した high-importance（4）channel を作ることは推奨する。Android 8以降の heads-up／音などを利用者向けに整え、設定を案内するための**別アプリ側の変更**であり、今回の配送優先度修正の必須条件ではない。FCM priority と channel importance は別物で、利用者の設定も尊重する。アプリ側で channel を作成し、実在する ID を合意してから gateway の channelId を検討する。

## 検証と残り

| 検査 | 結果 |
|---|---|
| `npm run typecheck` | 成功 |
| `npm test` | 57ファイル・797テスト成功（既存の real HTTP SEC 検査も維持） |
| `npm run build` | 成功 |
| ベクトル再生成と JSON の git diff | 差分なし |
| `git diff --check` | 成功 |

この worker は実 push を送っておらず、上記の実 FCM 結果は担当者の提供した観測である。8790、8792/8799、8081 は停止していない。担当者自身が同じ HOME の dev server を更新版へ再起動し、background のエミュレーターへ gateway のテスト通知と許可通知を送り、receipt と実表示を再照合することが残る。
