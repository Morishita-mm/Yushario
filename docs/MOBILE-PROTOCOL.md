# Mobile protocol v1

`MOBILE.md` の合意を、Mac の窓口と別リポジトリのアプリで共有する通信仕様にしたもの。v1 の実装はこの文書と `mobile-protocol-vectors.json` に従う。暗号は Mac では Node 標準 `crypto`、アプリでは `@noble/*` を使う。core は入力の検査とバイト列の組み立てだけを行う。

## 記法と共通の表現

- `||` はバイト列の連結、`UTF8(s)` は BOM なし UTF-8、`SHA256` は32バイトの SHA-256。`"...\0"` の末尾は実際の1バイト `00`（文字の `\\0` ではない）。
- `B64(b)` は RFC 4648 §5 の base64url。パディングなし、空白なし、末尾の未使用ビットは0。復号後16／32／64バイトの文字列はそれぞれ22／43／86文字。
- JSON は UTF-8 のオブジェクト。プロパティ名は大文字小文字を区別し、表にないメンバーを拒否する。メンバー順と空白は問わない。重複名は ECMAScript `JSON.parse` と同じく最後の値を使い、検証・署名・表示も必ずその同じ値に対して行う。
- 数値はすべて `0..9007199254740991` の安全な整数。`seq` だけは1以上。時刻は Unix epoch からのミリ秒。文字列は不正な UTF-8・孤立サロゲートを拒否し、Unicode 正規化・改行変換・trim をしない。
- 以下の文字数上限は既存の許可処理と同じ **UTF-16 コード単位数**。切る場合はサロゲート対の途中で切らない。`id` は特記しない限り空でない200文字以内の不透明な文字列。
- `C(value)` は下記の配列・文字列・数値・真偽値・null だけの JSON を、空白なしで UTF-8 にしたもの。オブジェクトを `C` に渡さない。
  - 配列は列挙順。数値は10進整数（指数・先頭0・`+` なし。0は `0`）。真偽値と null は小文字。
  - 文字列は byte `22` で囲む。U+0022 は bytes `5c 22`、U+005C は `5c 5c`、BS/TAB/LF/FF/CR はそれぞれ `5c 62` / `5c 74` / `5c 6e` / `5c 66` / `5c 72` にする。残る U+0000..001F は byte `5c` と ASCII `u00xx`（小文字16進）。それ以外（`/`、U+2028、U+2029 を含む）はそのまま UTF-8。これは有効な入力に対する `UTF8(JSON.stringify(value))` と一致する。

## 鍵と端末 ID

| 記号 | 内容 | wire 表現 |
|---|---|---|
| `GX`, `PX` | Mac／スマホの X25519 公開鍵 | RFC 7748 の32バイト（u 座標、little-endian）の `B64` |
| `GS`, `PS` | Mac／スマホの Ed25519 公開鍵 | RFC 8032 の32バイト compressed point の `B64` |
| `code` | ペアリングコード | CSPRNG の16バイト（128bit）の `B64` |
| `D` | 端末 ID の32バイト | `SHA256(UTF8("yushario.device.v1\0") || PX || PS || code)` |
| `deviceId` | 端末 ID | `B64(D)` |

この表以降、ハッシュ式の `GX/GS/PX/PS/code` は **復号した生バイト**、JSON の値では `B64` の文字列を指す。
Mac は X25519 と Ed25519 の鍵対を初回起動で作り0600で保管する。スマホは Mac ごと・新しいペアリング試行ごとに独立した新しい2鍵対を作り、この端末のみの安全な保管庫へ置く。X25519 と Ed25519 の秘密鍵を兼用・変換しない。Ed25519 は pure Ed25519（prehash／context なし）、署名は生64バイト（DER ではない）。

登録後は `D`、両側の公開鍵、スマホの秘密鍵と送信連番を保つ。Mac は `D`、端末公開鍵・名前・通知 ID と受信済み連番を保つ。`code` は登録後の通信には不要で、保存しない。Mac の鍵の再作成では全端末を登録し直す。公開鍵の pin はアドレス変更で変えない。

## ペアリング

### QR と手入力文字列

```text
yushario-pair:1:<B64(UTF8(JSON の offer))>
```

`offer` は次の6メンバーだけを持つ（JSON の順序は任意）。prefix の版と `v` は一致しなければならない。

| メンバー | 値 |
|---|---|
| `v` | `1` |
| `addresses` | 重複なし1〜8件の窓口 origin（各300文字以内）。`http://host:port` または `https://host:port`。host は ASCII の名前／IPv4 または `[IPv6]`、port は1〜65535の先頭0なし10進。userinfo・パス・query・fragment・末尾 `/` なし |
| `gatewayEncryptionKey` | `GX` |
| `gatewaySigningKey` | `GS` |
| `pairingCode` | `code` |
| `expiresAt` | Mac の作成時刻 + **300000ms** |

Mac は同時に1つのコードだけを表示する。新しいコードの表示・再起動で以前のコードと保留中の要求を失効させる。スマホは期限切れの offer を使わず、時計の60秒差を見込んでも expiresAt が現在から360000msを超えて先なら拒否する。Mac の期限が最終判断で、確認待ちでも延長しない。QR を URL の query やログへ出さない。origin の登録・編集は到達先だけを変え、鍵の pin を変更しない。

### 要求から登録まで

1. スマホは QR の鍵を pin し、鍵対と `D` を作る。下記の通常の暗号化・署名形式で `pair` を送る。最初の `seq` は1。公開鍵は packet の外側、コード・名前・通知 ID は暗号の内側に入る。
2. 未登録 `deviceId` の復号は、有効なコードが **available** の時だけ試す。コード、`D` の再計算、鍵、署名、時刻、本文を検査する。失敗はコードごとに累計し、**3回目で locked**。復号／形式／署名の失敗も1回に数える（このため第三者による失効 DoS は残る）。新しいコードだけが回数をリセットする。
3. 正しい要求1件を **pending** として予約し、Mac に端末名と SAS を出す。スマホも自分で SAS を計算して表示する。他の要求は予約を横取りできない。pending 中の不正要求は予約や失敗回数を変えず、一般拒否する。
4. 人が両画面の6桁を比較し、**Mac で承認**した時だけ登録を保存する。スマホの操作だけでは承認できない。保存後に `pair` の成功応答を返す。それまでは同じ HTTP 要求を開いたままにする（HTTP timeout は残り期限より長くする）。待機に入れた要求の時刻を、承認時に再び60秒窓で判定しない。
5. 人の拒否では **consumed**、期限到達では **expired**。いずれも登録せず一般拒否。承認成功も consumed で、同じコードは再使用しない。登録数は Mac ごと最大 **5台**で、予約時と承認の保存直前に調べる。承認時に満杯なら consumed にして一般拒否する。

pairing state は `(createdAt, expiresAt, failures, status, deviceId|null)`。available からの `fail` は failures+1、`reserve` は pending、pending からの人の confirm/reject は consumed。`now >= expiresAt` なら available/pending を expired にする。locked/consumed/expired から登録へ戻る遷移はない。判定・予約・登録の保存は並列要求に対して不可分に行う。

### 確認番号（SAS）

```text
H = SHA256(UTF8("yushario.sas.v1\0") || GX || GS || PX || PS || code)
n = uint32_big_endian(H[0..3]) mod 1000000
SAS = n の10進表現を左に 0 埋めした6文字
```

ラベル・NUL 以外は固定長なので境界の曖昧さはない。番号が一致しなければ承認せず、新しい QR でやり直す。番号そのものをネットワークから受け取って信用しない。

## セッション鍵と nonce

```text
Z = X25519(自分の秘密鍵, 相手の X25519 公開鍵)
salt = SHA256(UTF8("yushario.hkdf.v1\0") || GX || GS || PX || PS || D)
K_request  = HKDF-SHA256(IKM=Z, salt=salt, info=UTF8("yushario.mobile.v1/request"), L=32)
K_response = HKDF-SHA256(IKM=Z, salt=salt, info=UTF8("yushario.mobile.v1/response"), L=32)
nonce(seq) = 00 00 00 00 || uint64_big_endian(seq)   # 合計12バイト
```

HKDF は RFC 5869（Extract + Expand）。X25519 の全0共有結果を拒否する。暗号は RFC 8439 の **IETF ChaCha20-Poly1305**、鍵32・nonce12・tag16バイト。XChaCha ではない。`D` を salt に含めるため、新しいコードでの再登録は別の鍵になる。この静的 DH には forward secrecy はない。鍵漏えい後の過去の通信の保護は v1 の範囲外。

**同じ方向の同じ鍵で nonce を2度使わない規則：**

- スマホは `seq` を暗号化の **前** に安全な保管庫へ予約保存して増やす。送れなかった番号も欠番にし、プロセス再起動・経路変更でも戻さない。上限到達・連番の保管を失った場合は鍵を使わず、新しいコードで登録し直す。
- Mac は受け付けた `seq` を操作・応答の前に耐クラッシュの端末記録へ保存する。署名・形式・時刻・登録を検査した後に不可分に連番を進める。以降の操作が失敗しても番号を戻さない。保存失敗では操作も応答の暗号化もしない。
- 応答は要求と同じ `seq` を1回だけ使い、方向別の鍵を使う。拒否は暗号化しない。Mac は同じ `seq` への応答を再生成しない。
- TCP 等の再送は同じ暗号文バイト列の再配送であり再暗号化しない。ただしアプリの HTTP 再試行は v1 では行わない。応答を失うと処理済みか不明なので、新しい番号で状態を読み直す。新しい時刻・本文を同じ `seq` で暗号化してはならない。
- pair も同じ規則。予約は1件のみで、成功応答の前に pair の `seq` を保存する。新しい試行は新しい鍵で作り直す。取り消した登録を古いコード・連番で復活させない。

## packet と署名付き envelope

HTTP の要求と成功応答は同じ packet 形を使う。

```ts
{ v: 1, deviceId: string, seq: number,
  phoneEncryptionKey: string, phoneSigningKey: string, ciphertext: string }
```

外側の公開鍵は `PX/PS`。登録済みなら保存した値と一致しなければ拒否する。未登録では pair 以外を受け付けない。`ciphertext` は `B64(暗号文本体 || 16-byte tag)`（復号後512KiB以下）。暗号の内側は次の JSON。`v/deviceId/seq` は外側と一致すること。

```ts
{ v: 1, deviceId: string, seq: number, timestamp: number,
  operation: "pair" | "status" | "permissions" | "decide" | "reports" | "push-token" | "unpair" | "towns" | "quests" | "quest-create"
    | "quest-options" | "quest-draft" | "quest-prepare" | "quest-form" | "quest-embark" | "quest-depart",
  body: object, signature: string }
```

署名する正確なバイト列は次のとおり。`bodyValues` は次節の **配列**で、JSON オブジェクトの canonicalization は行わない。要求はスマホの Ed25519、応答は Mac の Ed25519 で署名し、`signature=B64(署名64バイト)` を内側に加えてから JSON を暗号化する。

```text
requestSigningInput  = C(["yushario.request.v1", 1, deviceId, seq, timestamp, operation, bodyValues])
responseSigningInput = C(["yushario.response.v1", 1, deviceId, seq, timestamp, operation, bodyValues])
AAD = C(["yushario.aead.v1", direction, 1, deviceId, seq, GX, GS, PX, PS])
```

`direction` は要求なら文字列 `"request"`、応答なら `"response"`。AAD の鍵は `B64` 文字列。受け手は pin／登録から gateway 鍵を取る。暗号が通っても、署名・登録・本文・外内の一致の検査を省略しない。

Mac の要求判定は `seq > lastAccepted`（pair は初期値0）かつ `abs(timestamp-now) <= 60000`。境界の±60000msは可、60001msは不可。順不同で遅れた番号も拒否するので、アプリは Mac ごとに要求を直列化する。応答は未完了の要求と `deviceId/seq/operation` が一致し、署名が正しく、同じ±60秒窓内のものを1度だけ受け付ける。

## 操作と本文（許可リストのすべて）

各表の `{}` はメンバー0個。null は省略ではない。成功以外の本文は後述の一般拒否だけで、個別の失敗理由は返さない。

| operation | 要求 body | 要求 bodyValues | 成功応答 body | 応答 bodyValues |
|---|---|---|---|---|
| `pair` | `{pairingCode, name, pushToken}` | `[pairingCode,name,pushToken]` | `{registered:true}` | `[true]` |
| `status` | `{}` | `[]` | `{heroes:[Hero,...]}` | `[[heroValues,...]]` |
| `permissions` | `{}` | `[]` | `{permissions:[Permission,...]}` | `[[permissionValues,...]]` |
| `decide` | `{permissionId, contentHash, decision}` | `[permissionId,contentHash,decision]` | `{decided:true}` | `[true]` |
| `towns` | `{cursor}` | `[cursor]` | `{towns:[Town,...],nextCursor}` | `[[townValues,...],nextCursor]` |
| `quests` | `{cursor}` | `[cursor]` | `{quests:[Quest,...],nextCursor}` | `[[questValues,...],nextCursor]` |
| `quest-create` | `{requestId,townId,title,purpose}` | `[requestId,townId,title,purpose]` | `{quest:Quest}` | `[questValues]` |
| `reports`（最近） | `{}` | `[]` | `{reports:[Report,...],nextCursor:null}` | `[[reportValues,...],null]` |
| `reports`（1クエスト） | `{questId,cursor}` | `[questId,cursor]` | `{reports:[Report,...],nextCursor}` | `[[reportValues,...],nextCursor]` |
| `push-token` | `{token}` | `[token]` | `{updated:true}` | `[true]` |
| `unpair` | `{}` | `[]` | `{unpaired:true}` | `[true]` |
| `quest-options` ほか5操作 | 下記「クエストの作業操作」 | | | |

- pair の `name` は空でない80文字以内、C0/DEL なし。`pushToken` と push-token の `token` は Expo 通知 ID（ASCII U+0021..007E の1〜512文字）または null（通知 ID の削除）。pair の code は16バイトの `B64`。
- decide の `permissionId` は id、`contentHash` は SHA-256 の32バイトの `B64`、`decision` は `"allow"` または `"deny"` だけ（`terminal` はない）。アプリは毎回生体認証または端末のロック解除を求めてから送る。
- unpair は自分の登録・通知 ID だけを消す。他端末の ID を body に取らない。応答を1度組み立て、削除の保存を済ませてから配送する。Mac での取り消しも以後の要求を直ちに拒否する。

### クエストの入力・重複とページ

- `cursor` は先頭なら null、次ページなら前応答の `nextCursor`（最後の行の id）。省略不可。`nextCursor:null` が末尾。知らない／別クエストの cursor は一般拒否。更新をまたぐ snapshot 保証はなく、一覧変更時は先頭から読み直す。
- `townId` は `towns` から取得した不透明 ID。窓口内だけのランダム UUID → 内部の町の鍵の対応表で引く（path を hash/base64 にした ID ではない）。再起動で無効になる。削除済み／未知の町・内部の町の鍵やパスを直接指定しても拒否する。
- `quest-create` の `title` は1〜200文字で trim 後が空でないこと、`purpose` は0〜2000文字（空も明示）。検査・署名では trim せず、保存時の題だけ既存 `QuestLedger.create` と同じ trim。既存 `validQuestPatch` の検査を再使用する。状態は open。割当・送信・出陣・party・done/adopt への引数は許可しない。
- `requestId` は `Unixミリ秒の10進表記.B64(16バイトのCSPRNG乱数)`。先頭0は0自身以外不可。例 `1700000000000.gIGCg4SFhoeIiYqLjI2Ojw`。受理時 `issuedAt <= now+60000` かつ `now < issuedAt+600000`。端末は明示送信時に一度だけ生成し、不明な結果を新しい ID で自動再送しない。
- 登録・署名・連番の既存検査後、作成前に ID を耐クラッシュ予約する。同じ ID は端末・本文・連番が変わっても拒否（応答の再生成もしない）。直近60秒の予約が端末ごと5件以上なら拒否。予約・監査が保存できなければ作成しない。期限後も同じ ID は無効、古い予約は次の作成時に間引く（最大1000件、満杯も一般拒否）。
- 予約と監査は札作成の前なので、停止や SQLite 保存失敗では札がない予約が残り得る。応答消失・一般拒否は未実行の証明ではない。新しい連番で一覧を読み直して人が確認する。HTTP 自動再送は禁止のまま。
- 監査は `{deviceId,questId,time}` のみ（0600、fsync）。要求本文・題・目的は記録しない。詳細と作成ごとの追加生体認証を不要とした理由は `MOBILE.md`。`decide` の本人確認は変更しない。

### 表示データと配列の順序

下記は **オブジェクトの全メンバー**と、署名用の固定順の配列。

```ts
Hero = {id, name, town, state, permissionPending, townId}
heroValues = [id, name, town, state, permissionPending, townId]
Permission = {id, heroId, heroName, town, tool, summary, content, omitted, expiresAt, townId, work, change, contentHash}
permissionContentValues = [id, heroId, heroName, town, tool, summary, content, omitted, expiresAt, townId, workValues, changeValues]
permissionValues = [...permissionContentValues, contentHash]
Town = {id, name, theme}
townValues = [id, name, theme]
Quest = {id, title, town, state, updatedAt, townId}
questValues = [id, title, town, state, updatedAt, townId]
Report = {id, questId, questTitle, title, success, at, excerpt, text, townId}
reportValues = [id, questId, questTitle, title, success, at, excerpt, text, townId]
```

- Hero は最大100件、id の UTF-16 辞書順で先頭100件。`name/town` は表示名で、空でない200文字以内。町の実パスを名前の代わりに返さない。`state` は `idle|thinking|working|waiting_input|success|error`、`permissionPending` は真偽値。
- Permission は未回答かつ `now < expiresAt` の最大16件。expiresAt 昇順、同時刻は id の UTF-16 辞書順。`heroId` は id、`heroName/town/tool/summary` は空でない200文字以内。`content` は既存のコマンド／パス表示そのもの（空も可、最大2000文字）。`omitted` は省略した UTF-16 単位数で0以上、`expiresAt` は既存の120秒期限をそのまま使い、取得で延長しない。長い表示名や要約は表示用に上限内へ切り、切った後の表示値を hash に使う。
- Town は id の UTF-16 辞書順、1ページ100件まで。`name` は空でない200文字以内の表示名だけ。
- Quest は updatedAt 降順、同時刻は id の UTF-16 辞書順、1ページ100件まで。`title/town` は空でない200文字以内、town は表示名（削除済み等なら「町」）。`state` は `open|active|waiting|review|done|dropped`。目的・担当・パス・cwd・branch・拠点・条件・コマンドは返さない。
- Report の `questId` は所属クエストの ID、`questTitle` は現在のクエストの題、`title` は報告の見出し（各200文字まで）。`success` は true/false/不明なら null、`at` は報告時刻。`excerpt` は読める本文の先頭 **500文字**。`text` は全文を **8000文字**まで、本文がなければ null（空の本文は空文字）。切る場合はサロゲート対を分断しない。
- `reports {}` は最近50件、at 降順・同時刻は id の UTF-16 辞書順。要約一覧なので `text` は常に null、`nextCursor` も null。`reports {questId,cursor}` はそのクエストだけを at 昇順・同時刻は id の UTF-16 辞書順で1ページ8件まで返す。JSON の制御文字エスケープを含めても既存512KiB暗号文・1MiB HTTP 上限内にするため全文ページを8件に制限する。
- 本文は保存済みの報告、無ければ同じ勇者・同じ報告時刻のメモリの返答だけ。`saveConversation=false` の返答は保存せず再起動・保持期限で消える。無ければ excerpt は空・text は null。別の返答やツール出力から補わない。result/cwd/branch/files/checks/command/permission と報告以外の出来事を返さない。返答の文章に人／CLI が書いた機密を自動検出・墨消しする仕様ではない。要約を LLM に作らせない。
- クエスト拡張では reports の shape と署名配列も増えている。暗号・pair/decide の wire は不変だが、古いアプリは新 reports を拒否するので Mac／アプリをそろえて更新する。

### 許可の作業と変更本文（A4）

v1 を本体・アプリ同時に更新する。`work` と `change` は null の時も必須。Mac の許可カード／WS の形は変えず、追加本文は未回答の waiter 内だけに保持する（最大16件・120秒、解決／切断／終了で破棄）。台帳・監査・通知には書かない。

```ts
work = null | {questId, title}
workValues = null | [questId, title]
change = null
  | {kind:"write", text, omitted}
  | {kind:"edit", edits:[{before, after, replaceAll}, ...], omitted, omittedEdits}
  | {kind:"unavailable"}
changeValues = null
  | ["write", text, omitted]
  | ["edit", [[before,after,replaceAll], ...], omitted, omittedEdits]
  | ["unavailable"]
```

- `work` は **許可受信時**に認証済み端末の `QuestLedger.current` から読む担当クエストの不透明 ID と題（各1〜200文字）。町がその端末と同じ、所属の勇者がその端末と一致する場合だけ返す。done/dropped・未割当・不明／不正な題なら null。本文の session_id/cwd/branch では決めず、別勇者／別町や「最近のクエスト」から補わない。後の改題・再割当ではこの snapshot を変更しない。仲間のフックは親勇者の担当クエストを示し、仲間の細かい作業を推測しない。
- 最後の依頼文は今回追加しない。現担当の ID/題は台帳の確定値で、会話保存の有無に依存せず、複数メンバーの request や未送信の依頼を混同しないため。work に内部パス・cwd・branch・目的は載せない。利用者が題／ツール本文に書いた文字を機密判定して墨消しする仕様ではない。
- Write は tool_input.content を `change.text` にする。Edit は old_string/new_string を `before/after` の1組に、MultiEdit は edits の入力順に各組を返す。`replaceAll` は replace_all（省略時 false）。これは実ファイルとの unified diff ではなく **要求された置換**である。空文字の挿入・削除もそのまま。Bash は既存 content のコマンド全文のみで change=null、他の道具も従来どおり change=null。
- **上限**：content は従来の最大2000文字。変更本文は全 text／before／after の **合計2000文字**まで、さらに **content＋変更本文の合計3000文字**まで。MultiEdit は最大16組。入力順、各 before→after の順に予算を使い、サロゲート対を分断しない。change.omitted は返さなかった本文の UTF-16 単位数（省いた組の文字数も含む）、omittedEdits は省いた組数（空の組も数える）。外側 omitted は従来どおり content の省略数。
- 元入力に本文の欠落・型不正・孤立サロゲートがあれば kind=unavailable（空本文とは違う）。構造を捏造して承認可能にはしない。変更対象の3ツールでは null を返さない。他のツールで非nullの change は拒否する。
- **承認条件**：外側 omitted=0、かつ change が null、または write の omitted=0、または edit の omitted=0 かつ omittedEdits=0。unavailable・本文省略・組省略は承認不可、期限内なら拒否は可。不明な作業 work=null 自体は承認不可の理由ではない。
- 1応答は従来どおり最大16件。合計3000文字の予算と固定 shape／16組上限により、制御文字がすべて JSON の6バイト escape になっても16件を既存 **暗号文512KiB／HTTP 1MiB** 以下に収める。文字列の生値は mobileText の規則どおり保持し、正規化・制御文字の除去・ANSI解釈はしない。表示はアプリの visible の規則を使う（詳細は下の hash とアプリの画面担当向け説明）。
- 全追加値（kind、順序、replaceAll、省略数、不明/nullを含む）を応答署名と contentHash に束縛する。SEC-25 は実 HTTP／暗号／隔離 relay・CLI・SQLite で帰属、本文のすり替え、省略時の拒否、最悪16件応答を確かめる。

### 町の所属と姿（A3）

未配布の開発アプリを本体と同時更新する合意により、旧版互換の要求は取り下げた。A1 と同じく v1 の DTO・固定署名配列を直接更新し、切り替えフラグ・二重プロトコルは作らない。古いアプリ／窓口は新しい DTO を検証できないため双方をそろえる（外側の版不一致の426規則は不変）。

- `townId: string | null` は Hero・Permission・Quest・Report・WorkHero・WorkBase・WorkDraft に必須。`Town.id` と同じ窓口内のランダム UUID v4 を使い、表示名が同じ町も区別する。パスのコピー・hash・base64・連番ではない。同じ起動中は名前や姿を変えても不変、削除後の再登録と窓口再起動では取り直す。Mac をまたいで ID を結合しない。
- 未登録／削除済みの町、所属不明の勇者・許可は null。SessionEnd 後の勇者は status から消える。options に残る終了済み／会話不可の外部勇者は `active:false,townId:null`。不明な町の表示名をパスから補わない。
- Report は**報告のクエストの町**に属する。勇者が後で別の町へ移っても報告の町は変えない。WorkDraft はクエストの町、WorkBase は拠点の町。draft の members/fits/steps は親 draft の町に限定される参照なので同じ townId を重複させない。preset・装備の Choice は町に属さないので追加しない。
- `theme` は `"village" | "port" | "snow" | "desert" | "volcano" | null`。本体の `TownRecord.theme`（`src/core/town-ledger.ts` の `TOWN_THEMES`）だけを返す。Mac の Scene.look と同じ保存値で、未選択・未知なら null。パス／作業フォルダ名からの推測、画像 URL／パスの返却はしない。絵はアプリに同梱する。
- 件数は追加しない。取得済み行を townId でグループ化し、勇者数・許可待ち数・`active|waiting|review` のクエスト数を数えられる。これは**取得済みの表示件数**で、status は100件まで、許可は16件まで、報告は最近50件まで。クエスト全件の件数なら nextCursor が null になるまで全ページを取得する。別要求間に snapshot 保証はなく、古い一覧と合算して全体の厳密な件数だと表示しない。
- すべての追加値を応答署名に含める。Permission.townId は町ごとの区画・アイコンの判断材料になるため contentHash にも含める（A4 で work/change を加えた12値）。同じ名前の別町へ付け替えた hash は decide で拒否する。

### クエストの作業操作（A2：勇者を動かす6操作）

A2 で次の6操作を許可リストへ加えた（A3 で応答に町の所属を追加）。検査と署名配列は `src/core/mobile-work.ts`（要求）／`mobile-work-display.ts`（応答）。

| operation | 要求 body | 要求 bodyValues | 成功応答 body | 応答 bodyValues |
|---|---|---|---|---|
| `quest-options` | `{townId}` | `[townId]` | `{allowWork,heroes:[WorkHero,...],bases:[WorkBase,...],presets:[WorkPreset,...]}` | `[allowWork,[workHeroValues,...],[baseValues,...],[presetValues,...]]` |
| `quest-draft` | `{questId}` | `[questId]` | `{draft:WorkDraft}` | `[draftValues]` |
| `quest-prepare` | `{requestId,townId,text,mode,heroId,launch}` | `[requestId,townId,text,mode,heroId,launchValues\|null]` | `{draft,heroId,delivery}` | `[draftValues,heroId,delivery]` |
| `quest-form` | `{requestId,questId,text,members:[FormMember,...],tactic}` | `[requestId,questId,text,[memberValues,...],tactic]` | `{draft}` | `[draftValues]` |
| `quest-embark` | `{requestId,questId,launch,role,writer}` | `[requestId,questId,launchValues,role,writer]` | `{draft,heroId}` | `[draftValues,heroId]` |
| `quest-depart` | `{requestId,questId}` | `[requestId,questId]` | `{draft}` | `[draftValues]` |

```ts
Launch = {baseId, presetId, weaponId, accessoryId}
launchValues = [baseId, presetId, weaponId, accessoryId]
Choice = {id, name}
choiceValues = [id, name]
WorkBase = {id, name, townId}
baseValues = [id, name, townId]
WeaponChoice = {id, name, model}
weaponValues = [id, name, model]
AccessoryChoice = {id, name, effort}
accessoryValues = [id, name, effort]
WorkPreset = {id, name, weapons:[WeaponChoice,...], accessories:[AccessoryChoice,...]}
presetValues = [id, name, [weaponValues,...], [accessoryValues,...]]
WorkHero = {id, name, preset, weapon, accessory, busy, canTalk, active, questId, permissionGate, townId, model, effort}
workHeroValues = [id, name, preset, weapon, accessory, busy, canTalk, active, questId, permissionGate, townId, model, effort]
FormMember = {heroId, role, writer, ask}
memberValues = [heroId, role, writer, ask]
WorkFit = {tactic, ok, gaps, inside, outside}
fitValues = [tactic, ok, gaps, inside, outside]
WorkStep = {heroId, kind, state}
stepValues = [heroId, kind, state]
WorkDraft = {questId, text, tactic, members:[FormMember,...], fits:[WorkFit,...], editable, draftLost, departure:{state, steps:[WorkStep,...]}, townId}
draftValues = [questId, text, tactic, [memberValues,...], [fitValues,...], editable, draftLost, [departure.state, [stepValues,...]], townId]
```

- 構造上、パス・コマンド・引数・環境変数・session・cwd・branch を渡す欄はない。要求・応答のどのオブジェクトも列挙したメンバーだけで、足したものは一般拒否／応答の不採用。ID は空でない200文字以内。townId/heroId/baseId/presetId/weaponId/accessoryId と Choice.id・inside/outside の勇者 ID は窓口がプロセス内で発行した不透明 ID だけを解決する（再起動で無効）。questId は既存台帳の永続 UUID、gaps は不足条件の短いコードであり、プロセス内 ID ではない。町・拠点・勇者・preset・装備の内部の鍵やパスを直接書いても解決しない。
- null 可は prepare の `heroId`（要求・応答）と `launch`、Launch の `weaponId/accessoryId`、WorkHero の `weapon/accessory/questId/model/effort`、WeaponChoice.model、AccessoryChoice.effort と各 DTO の `townId`。WorkHero の `preset/weapon/accessory` と各 `name` は1〜200文字の表示ラベルで、実パスではない。
- `requestId` は quest-create と同じ形式・時刻判定。変更系の5操作（create・prepare・form・embark・depart）は同じ `quest-requests.json` の名前空間を共有し、10分有効・未来60秒まで。同じ ID は操作・本文・端末を変えても拒否する。
- prepare・form の `text` は1〜8000文字（UTF-16）で trim 後が空でないこと（検査・署名は trim しない）。`ask` は0〜8000文字。`draft.text` は0〜8000文字。
- `mode` は `only|send|party`、`role` は `implement|research|review|command`、`tactic` は `obey|review|research|delegate`、`delivery` は `none|sent|held`、`departure.state` は `not-started|partial|complete|uncertain`、`step.kind` は `request|ask|research`、`step.state` は `pending|sent|held|deferred|unknown`。
- prepare の `heroId` と `launch` は同時に指定できない。`launch` は `mode:"send"` の時だけ。Mac は新しい勇者を作って札へ割り当てるが本文は送らない。`send` で勇者も launch も無ければ札の作成だけ（`delivery:"none"`）。`quest-form` は下書きの保存とメンバーの割当で、本文は送らない。選んだ作戦は出発まで有効にしない（実際の作戦は obey のまま）。
- 件数：heroes・members 16、steps 17（リーダー＋補助16）、fits 4（tactic 重複なし）、gaps/inside/outside 各16、bases 100、presets 8、各 preset の weapons/accessories 100。heroes・bases・presets・members（heroId）・装備の id 重複は拒否する。
- 本人確認：アプリは控えめに、`heroId` または `launch` が null でない prepare（mode を問わない）、`members` が空でない form、すべての embark・depart で毎回、Mac ごとの直列処理の中で連番予約の直前に OS の生体認証／端末ロック解除を求める（`mobileWorkMovesAgents`）。この結果を wire に載せず、Mac も信用しない。Mac の判断材料は登録鍵の署名、Mac 側で端末ごとに既定 off の作業許可、その時点の状態による効果の分類（下記）だけ。
- 効果の分類（窓口）：launch・embark は出陣、depart は出発、勇者つきの `mode:"send"` は送信。prepare・form のうち command 役の付与、忙しい勇者、送信待ちの本文／装備変更が残る勇者、別クエストからの付け替えを含むものも送信と同じ扱い。それ以外（札だけ、空の form、待機中で未割当の勇者を command 以外で置く）は作業許可 off でも受け付ける。出陣・送信・出発は作業許可が必要で、端末ごと合計2件/分（出陣は1件/分・3件/時）。変更系は全体で5件/分。
- 失敗はすべて既存の一般拒否（HTTP 400）。部分的な結果を返すのは depart の成功応答（`departure.state:"partial"` と各 step の状態）だけ。
- 最大の draft（16人×ask 8000＋text 8000）は通常の本文なら暗号文512KiB以内だが、制御文字だらけの極端な本文ではエスケープで超え得る。その場合は送信前のローカルエラーか一般拒否になる。

### 装備のモデルと effort（A5）

- `WeaponChoice.model: string|null` と `AccessoryChoice.effort: MobileEffort|null` は必須（null も明示）。共通 Choice や拠点には足さない。WorkHero にも必須の `model` / `effort` を最小限の平坦な欄として追加し、既存 weapon/accessory の名前は維持する。
- 出どころは本体が既に読み込んだ装備マスタ（`src/server/equipment.json` と、既存の利用者設定によるエージェント単位の上書き）。武器の model、はちまきの value をそのまま返す。名前や装備 ID から推測しない。勇者の値はその端末が選んだ装備 ID で同じマスタを引く。外部勇者・未選択・不明は null。CLI 内での変更や CLI 既定値を観測した値ではない。
- model は **1〜64 ASCII文字**、`^[A-Za-z0-9][A-Za-z0-9._:/-]{0,63}$`。provider/model と provider:model、大文字も許可する（例 `openai-codex/gpt-6-astra`、`Provider:Model-1.0`）。加えて `://`、先頭の Windows ドライブ形 `^[A-Za-z]:/`、区切り `/` または `:` 間の `.` / `..` 成分を不可とする。絶対パス、引数、空白、制御文字、URLを表示用値にしない。型の合う任意の名前を世界共通のモデル一覧で検証するものではなく、サーバーの読み込み済みマスタにある短い識別子を返す。
- effort は **off|minimal|low|medium|high|xhigh|max** の7値だけ（ASCII小文字、最大7文字）。未知の文字列や大文字変種は返さない。これは表示用の列挙で、全エージェントが全値を使えるという意味ではない。
- **不適合な値でも選択肢は消さない**。id/name を従来どおり返し、model/effort だけ null にする（勇者表示も同じ）。切り詰め・正規化・ラベルからの補完はしない。null は既定値や「off」と同義ではなく、未選択または表示可能な値が不明。装備を選んでいたら名前は残る。
- model/effort は表示専用。Launch は従来の不透明 weaponId/accessoryId だけで、要求に model/effort を足す、値を ID の代わりに使う、未知の装備 ID を使うことは拒否する。null の装備も利用者登録済みの ID として従来どおり選べる。既存の起動引数・承認モードは変更しない。
- 全追加値と null を quest-options 応答署名の上記固定配列に含める。Permission の欄は変更しないため **A4 の contentHash は変更なし**（装備の値を許可内容に混ぜない）。共有 vectors は quest-options の署名・平文・AEADを更新し、provider、大小文字、effort、null のケースを加えた。v1 のまま両側を同時更新する。
- SEC-22 の既存の装備／入力制限を拡張し、実HTTP・relay・CLIでマスタとの一致、未選択、不正／未知値のnull化と選択肢の維持、任意値／未知IDの起動拒否を確かめる。新SEC番号は作らない。

### 許可の表示内容の hash

```text
contentHash = B64(SHA256(C(["yushario.permission.v1", ...permissionContentValues])))
```

アプリは検証済みの Permission の12値（work/change は上記の固定配列にする）を取得時のまま保持し、この hash を自分で再計算して `contentHash` と照合する。勇者名・町・ツール・要約・コマンド／パス・作業・変更本文・省略数・期限を判断画面で確認できるようにする。コマンド／パス・本文をさらに切る・改行を正規化する・制御文字を見えないまま捨てるなど、異なる文字列を判断の根拠にしない。安全な文字表示（制御文字の可視化等）は元の文字列と対応づける。固定の UI ラベルと残り秒数のカウントダウンは hash の対象ではない。

Mac は現在の同じ12値から hash を再計算し、decide の hash が一致し、期限内・未回答の時だけ既存 `permission-decision` の処理へ渡す。`allow` はさらに A4 の承認条件（外側／本文の省略なし、組省略なし、unavailable でない）が必要で、省略／不明な要求への `deny` は可。ブラウザとの競合は先に届いた1件だけを採る。失敗理由を区別せず拒否する。端末 ID・許可 ID・判断・Mac の時刻だけを監査記録へ残し、本文・hash の入力列は記録しない。

## HTTP と拒否

- 窓口の独立したポートの **`POST /mobile/v1`** だけを使う。origin にこのパスを付ける。query なし。LAN/Tailscale で同じ形式。HTTP 自体が平文でもアプリ間暗号を必須にし、HTTPS でも省略しない。
- 要求／応答は `Content-Type: application/json`（要求では `application/json; charset=utf-8` も可）、`Content-Encoding` は使わない。HTTP 本文は両方向 **1048576バイト（1MiB）以下**。成功は200と packet。応答には `Cache-Control: no-store`。
- Origin つき要求を拒否し、CORS を返さない。ブラウザ用 token/cookie、`/api/*`、`/pty`、`/ws`、任意の操作へ転送しない。
- 要求数はソケットの送信元 IP ごとに `floor(now/60000)` の区間で最大30件。転送ヘッダーの IP を信用しない。pair の失敗回数制限は別に適用する。上限を超えた要求も一般拒否する。
- 復号・認証・署名・登録・連番・時刻・コード・SAS 拒否・端末数・本文・許可の競合・HTTP 形式・サイズ・経路／method・要求数などの失敗は、**すべて HTTP 400、本文 `{"error":"rejected"}`**。暗号化 packet、個別の理由、Retry-After 等の診断を返さない。
- 唯一の例外は外側の `v` が安全な整数で1以外の場合。**HTTP 426、本文 `{"error":"version","supportedVersion":1}`**。文字列・欠落等は一般拒否。パスは版不一致でも `/mobile/v1` を使う。この平文エラーを鍵の更新・操作成功の証拠には使わない。
- JSON エラー本文に末尾改行・追加メンバーなし。拒否の理由はスマホへ明かさず、一般拒否や通信切断では操作が未実行だったとも断定しない。

## Push（作業内容をサービスへ渡さない）

```json
{"priority":"high","channelId":"alerts","title":"Yushario","body":"確認が必要です","data":{"kind":"permission"}}
```

`priority` は時間制約のある利用者向け通知のため常に `"high"`（配送の優先度だけで、到達や表示の保証ではない）。`channelId` は合意した `"alerts"` を常に指定する。Android の channel importance は配送優先度と別で、別アプリ側が `alerts` を HIGH の重要度で作成する。`title/body` はこの固定文字列のみ。`data` は `kind` だけ（`permission|report|error` のいずれか）、または省略。勇者名・コマンド・パス・端末 ID・許可 ID・報告 ID・URL・暗号文を載せない。Expo への配送用 `to` は別途保存した通知 ID で、本文を足す場所ではない。通知から直接判断せず、開いた後に窓口へ取りに行く。取り消しで通知 ID も消す。

### Expo の配送確認（Mac 内の診断。スマホ v1 の wire は変更しない）

- `POST https://exp.host/--/api/v2/push/send` に `{to:<通知 ID 1件>,priority:"high",channelId:"alerts",title,body,data}` を送る。`to` は文字列で、本文・kind は上記の固定値だけ。ticket は `data` が1オブジェクトでも要素1個の配列でも受け付ける。ticket の `ok` は Expo の受付であり、配送成功と表示しない。
- ticket の ID を使い、5秒後に `POST https://exp.host/--/api/v2/push/getReceipts`、本文 `{"ids":["<ticket ID>"]}` で照会する。結果は `data[ticket ID]`。未確認／照会の失敗なら追加で30秒後・120秒後（送信後およそ5／35／155秒、各 HTTP は最大10秒）に照会し、それでも不明なら未確認で止める。通知自体の自動再送はしない。
- receipt の `ok` は APNs/FCM の受理までで、スマホの表示・音・閲覧の証拠ではない。ticket／receipt の `DeviceNotRegistered` は、まだ同じ token を持つ登録だけから通知 ID を消す。照会中に更新された新しい token は消さない。
- 診断ログは `{time,deviceId,kind,ticketStatus,receiptStatus,errorCode}` の6項目だけ。time は試行の開始時刻で、同じ試行の進行でも保持する。ticketStatus は `pending|ok|error|skipped`、receiptStatus は `none|pending|ok|error|unknown`。errorCode は `src/core/mobile-push.ts` の許可リストか null だけで、未知の provider error は `UnknownExpoError`。token・ticket ID・provider message・題／本文・許可 ID は記録しない。
- メモリの履歴は50件、0600の JSONL は32KiBで1世代の backup を更新する。保持範囲の端末別最新試行を Mac 画面へ返し、古い試行の遅い receipt で新しい結果を上書きしない。token なしは `NoPushToken`、処理中の終了／再起動は `GatewayStopped/Interrupted` の未確認。ticket ID はメモリだけなので再起動後に照会を再開しない。同時処理も最大50件で、上限は `QueueFull` として記録する。
- 画面用の認可済み `POST /api/mobile/test-push` は `{deviceId}` だけを取り、その登録1件へ kind=`permission` の同じ固定通知を送る。新しい許可要求やスマホ側操作は作らない。これは既存の画面 API であり、窓口の操作には追加しない。

## 共有テスト用データと実装の境界

- `node scripts/mobile-vectors.mjs` で `docs/mobile-protocol-vectors.json` を再生成する（毎回同一）。秘密鍵も含めた **公開のテスト専用データ**であり実運用へ流用しない。
- X25519 の秘密値は32バイト raw scalar、Ed25519 は32バイト seed。固定鍵・コード・連番・時刻から、公開鍵、共有値、salt/info、方向別 HKDF 鍵、SAS、表示 hash、署名入力 hex、署名、AAD、nonce、平文、tag つき暗号文、packet を収録する。pair・decide に加え、towns・quests・quest-create・reports の最近／クエスト別と、作業の6操作（quest-options・quest-draft・quest-prepare（launch つき）・quest-form・quest-embark・quest-depart）について、入れ子の配列を含む要求／応答を両方収録する（`quests` 配列）。A3 では townId・theme を含む署名／暗号値を更新し、status・permissions・5テーマと null の towns も加えた。A4 は work/change を含む hash と署名／暗号値に更新し、Write（制御文字・絵文字）、Edit（replaceAll）、MultiEdit（本文／組省略）、unavailable と work=null の permissions も収録した。各組で別の seq を使う。
- アプリの `@noble/*` でも同じ JSON の全暗号値を照合する。JSON の読み込み順や各実装のオブジェクト順を署名仕様の代わりにしない。
- 純粋な検査・配列化は `src/core/mobile-protocol.ts`（作業の6操作は `mobile-work.ts`／`mobile-work-display.ts`）、表示値と hash 入力は `mobile-display.ts`、署名入力／AAD／nonce は `mobile-signing.ts`、コードの遷移／SAS の桁／push は `mobile-pairing.ts`。時刻は引数。暗号そのもの、厳密な UTF-8 復号、HTTP、連番の永続化、pin・登録・内容 hash の照合、不可分な状態更新は server／アプリ側の責務。
