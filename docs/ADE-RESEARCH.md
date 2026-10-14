# YusharioをRPG型ADEへ育てるための比較調査

調査日：2026-10-14。**将来設計の提案であり、現在の実装仕様を変更する文書ではない。**

## 1. 結論

Yusharioが目指すべきなのは「エージェントの仕事をゲームに見せるアプリ」から、**エージェントに仕事を任せ、検証し、成果を採用するRPG型の指揮所**への成長。

現在にも起動・指示・割り込み・許可回答・報告・再開の土台はある。ジョークアプリかどうかを分けるのは絵柄ではなく、次の一周を安全に完結できるかである。

> 依頼を残す → 作業環境を分ける → エージェントに任せる → 呼び出しに答える → 変更と検証結果を確認する → 採用・差し戻しする → 翌日も続けられる

最優先は **仕事の永続的な管理、worktree、差分レビューと検証**。自動オーケストレーション・クラウド・町のカスタマイズを先に増やしても、この穴は埋まらない。

## 2. 調査範囲と読み方

- Yushario：このworktreeの `docs/ARCHITECTURE.md`、`docs/PLATFORM.md` の最新段階、core・server・web・adaptersを確認。未コミットの変更を含む現状を評価した。古い段階の制限を現在の制限として扱っていない。
- 競合：公式README・公式ドキュメントを調査。Orcaはインストール済み1.4.222のCLIと、そのバイナリが配布するガイドも確認。Web確認は現在のworktreeのOrca内蔵ブラウザを使用した。
- 競合すべてをインストールして実作業を測定したわけではない。機能は「公式資料に記載された能力」、使いやすさ・認知負荷の評価は分析または仮説として区別する。速度・メモリ・生産性の優劣を実測したとは主張しない。
- GitHubのmainと公式サイトはリリース版より先行する場合がある。「全機能が最新安定版に含まれる」という保証ではない。

| 対象 | 確認したmainのcommit先頭 | APIで確認した最新release |
| --- | --- | --- |
| Orca | `dd4d0fa5` | `v1.4.224` |
| Superset | `cc31d024` | `desktop-v1.37.0` |
| cmux | `88cc4d38` | `v0.65.1` |
| Pixel Agents | `d1e007a9` | `v1.4.1` |
| Gas Town | `649b832b` | `v1.2.1` |

Conductorは公式サイト・ドキュメント・changelogを確認。サイトの最新掲載は0.90.0（2026-10-02）。料金・提供条件は変更されるため、この調査の中心には置かない。

## 3. 比較対象と、学ぶべきこと

| 対象 | 区分 | 公式資料で確認した特徴 | Yusharioが学ぶ点 |
| --- | --- | --- | --- |
| **Orca** | 直接比較：ADE | worktree単位の端末・エディタ・ブラウザ、差分へのコメント、GitHub/Linear、CLI、セッション履歴、使用量、SSH/mobile。配布CLIにはTask/Dispatch、メールボックス、質問・承認ゲート、ワーカー管理もある。[O1][O2][O3] | 状態を見るだけでなく、作業の所有者・試行・検証・取り込みまで管理する |
| **Superset** | 直接比較：ADE | 独立worktree、diff・PRレビュー、browser/Design、永続端末、resume/fork/他エージェントへの引き継ぎ、CLI/SDK/MCP、setup、使用量、remote/automations。[S1][S2][S3][S4] | 人のレビューとエージェントへの再指示を同じ流れにする |
| **Conductor** | 直接比較：ADE | 仕事ごとのworkspace・branch、diffコメント、checks・todos、PR/merge、turnごとのcheckpoint。現在はCloud・共同workspace・API・iOSも訴求。[C1][C2][C3][C4] | 「委任の単位」と「成果を取り込む単位」を明確にする |
| **cmux** | 間接比較：エージェント向けターミナルマルチプレクサ | terminal/browser、通知リング・未読へのジャンプ、CLI/socket、SSH、agent resume/fork。Cloudは有料のearly access。worktree構成はエージェント・スクリプトへ委ねる方針も説明。[M1][M2][M3][M4] | 自由なCLIを残すことと、素早い移動・通知・プログラム操作を両立する |
| **Gas Town** | 参考：自動協調システム | 永続的な仕事台帳、agent identity、mail/handoff、workflow、監視・回復、検証付きmerge queue、dispatchの並列数制御。[G1] | プロセスが終わっても仕事が残ること、完了と統合を分けること。構成全体の模倣は不要 |
| **Pixel Agents** | 直接比較：遊びのある可視化 | VS Code版だけでなくstandalone browser版、活動・入力待ち、subagent/Agent Teams、音、layout/asset pack。Claudeが現実装で、他CLI・予算バー・チーム編成・タスク配布はロードマップ。[P1] | ドット絵・IDE非依存・ゲーム化だけでは独自性を保てない |

**重要な更新：** `docs/OBSERVATION.md` のPixel Agents比較は現在の競合を十分には反映していない。今は「VS CodeでClaudeを眺めるだけ」とは言えない。一方、READMEにある将来のタスク配布を実装済みとは扱わない。

tmuxのような汎用マルチプレクサも土台の比較対象にはなるが、中心課題はpane数ではない。Yusharioが勝つべきなのは、複数エージェントのうち**誰に・何の判断が必要か**を把握し、仕事を前進させること。

## 4. Yusharioの現状と不足

| 開発者の仕事 | Yusharioの現状 | 比較先の能力・不足の意味 |
| --- | --- | --- |
| エージェントを出す・話す | Claude Code/piは勇者・会話・中断・compact・resume。Codex/shellは端末のみ。最大16セッション | Orca/Superset/cmuxは幅広いCLIを扱う。起動できることと、状態・許可・再開まで対応することは別 |
| 作業中の方針修正 | 戦闘コマンドの `steer` がある。通常の会話は終了後に届ける。答え待ちの間はsteerを断る | 「割り込みが全くない」は誤り。ただし伝達状態と送信後の実行証明は強化の余地がある |
| 人の判断が必要な箇所を拾う | でんれい、全町横断の急ぐ通知、Claudeの複数許可、通知音 | 基本機能はすでにある。次は未読・失敗・レビュー待ちの横断一覧と、最短の移動 |
| 独立した仕事を並行する | 既存worktreeをcwdに指定できるが、作成・branch選択・setup・port管理はない | Orca/Superset/Conductorでは仕事ごとのworkspaceが基礎。自動分離できないと複数勇者が同じファイルを編集する |
| 仕事そのものを管理する | CLIのTaskイベントを表示する。依頼と報告は会話の往復。セッションを超えた仕事台帳はない | 外部issueや永続taskを、目的・担当・状態・成果と結び付けられない。「勇者の一覧」は「仕事の一覧」ではない |
| 成果の内容を確認する | 最後の返答、編集ファイル名、テスト実行回数、失敗・時間・MPを表示。git diffやPR/CIの画面はない | Orca/Superset/Conductorは実際のdiffにコメントして修正へ戻せる。報告本文だけでは品質を判断できない |
| 検証して採用する | 最後のテスト成功/失敗とStopFailureを区別するが、未検証の編集も「しょうり」になり得る | acceptance criterion、対象revision、CI、review、mergeは別の証拠。「ツールが成功」と「依頼を満たした」は違う |
| 翌日・再起動後に続ける | ブラウザ再接続は可能。server停止でPTYと会話・報告・イベントは消える。町・名前・めいぼは保存。Claude/piはCLI側の会話をresumeできる | 復元後の画面に依頼・判断・成果が戻らない。めいぼは終了セッション最大50件のmetadataで、仕事履歴の代わりにならない |
| エージェント同士で協力する | subagentの活動を観察・表示。独立セッション間の担当割当、mail、依存関係、引き継ぎ、統合担当はない | Orca/Superset/Gas Townでは協調のための管理がある。パーティーの絵と協調実行は同義ではない |
| 作業環境をエージェントから操作する | ローカルHTTP/WSはあるが、利用者/エージェント向けの管理CLIはない | Orca/Superset/cmuxのように、エージェント自身が別の仕事・端末・検証を起動できない |
| 正しいコンテキストを渡す | 自由文・定型作戦が中心。ファイル選択・添付・diff行・過去の成果を依頼に関連付ける機能はない | rich prompt、file mention、画像、skills/MCPの可視化に差がある |
| 動くものを試す | shellを出せるが、dev server・port・previewを仕事に結び付ける管理はない | browserとrun環境は、UI変更の検証で特に重要 |
| コスト・限界を判断する | MPはcontext残量。料金・subscription quota・rate-limit reset・CPU/RAMはない | Orca/Supersetのusage、cmuxの実行環境管理が参考。MPを「残り料金」に流用してはいけない |

現状の根拠：`src/server/agents.ts`、`pty*.ts`、`permissions.ts`、`project.ts`、`src/core/events.ts`、`turns.ts`、`story.ts`、`roster.ts`、`src/web/rpg/report-card.ts`、各アダプタ。

### 見落としやすい基盤の問題

1. **仕事とセッションのIDを分ける。** 一つの仕事をClaudeからCodexに引き継ぐ、再起動して続ける、再試行する場合にも、仕事のIDと判断履歴は同じである必要がある。
2. **町の同一性を名前に依存させない。** 現在は主worktreeのbasenameをprojectにするため、同名の別repositoryを安全に区別する基盤が弱い。repoの正規化された場所と表示名を分ける。
3. **観察用イベントだけで成果管理しない。** `target` はbasenameや短縮されたコマンド。git status/diff、実行コマンドと終了コード、対象revisionを別途確認しなければ、変更全体・検証の正当性は分からない。
4. **不明を成功・失敗・停止に変換しない。** hookが来ない、接続が切れた、送信がacceptedになった、というだけで「作業完了」「停止済み」「再送が必要」と決めない。遅着と重複試行を扱う必要がある。[O2]

## 5. 比較して良い点、伸ばせる強み

### A. 空間に意味があり、監視をテキスト読解だけにしない

町・戦場・宿・教会、苦戦・呼び出し・報告という表現に、実際の活動と時間の変化が結び付いている。Orca/Superset/cmuxの端末・カード中心の表示とは異なる、**状況を視界の端で把握するUI**になり得る。

ただし、8人・16人の時に本当に判断が速くなるかは未検証。単にキャラが増えて賑やかになることは価値の証明ではない。止まっている仕事と理由を、一覧でも即読できる必要がある。

### B. 既存のCLI・利用者の設定を尊重している

PTYに既存CLIを載せるため、各ハーネスの機能・ログイン・スキルをそのまま使い、端末へ逃げられる。Yushario自身はLLMを呼ばず、独自の推論コストを上乗せしない。起動時だけhooks/extensionを付け、利用者のagent設定を書き換えない設計も良い。

これはOrca/Superset/cmuxにも共通する方針で、**唯一無二ではない**。差別化というより守るべき基礎。自動指揮も既存CLIをcoordinatorにでき、アプリ内に新しいハーネスを作る必要はない。

### C. 人が必要な場面を、世界観のまま直接操作できる

単なるPixel表示より、話しかける・戦闘中の命令・中断・装備・許可回答・報告への返事までつながっている。許可は自動承認せず、表示しきれないコマンドは画面から許可できない。不明なMPを「？」とする方針も信頼できる。

この方向を「レビュー待ちの勇者」「他の仕事に進むには判断が必要な門」へ拡張すると、RPGが実務に効く。

### D. 最後の返事と作業の事実をまとめる報告がある

報告カードは会話だけ、端末だけより、担当者の結果を確認しやすい構成。ここに**実diff・検証証拠・採否**を追加すれば、宝箱を開ける行為を実用的な成果レビューに変えられる。

### E. 導入とプライバシーの負担を抑える余地がある

ローカルNode/browser、少ない依存、MIT、macOS/Linux、日本語/英語対応。大きなIDEを置き換えずに導入できる。ただしNode/native PTYの準備は必要で、ネイティブアプリより軽いと実測したわけではない。

会話を保存しない方針はプライバシー面の強みだが、ADEとしては連続性と衝突する。**本文の保存は明示的に選べる**ようにし、仕事metadataの保存・会話の保存・CLI側の保存を区別するのがよい。

## 6. RPGの世界観への取り込み方

### まず対応させる対象を整理する

| RPGの対象 | 実務上の対象 | 避ける混同 |
| --- | --- | --- |
| 町 | project/repository | branchや一回の依頼を町にしない |
| クエスト | セッションより長く残る仕事。目的・受入条件・担当・成果を持つ | CLIの内部TODO完了をそのまま利用者の依頼完了にしない |
| 勇者 | その仕事に取り組むエージェントセッション | セッションが終わっても仕事は消えない |
| 遠征拠点 | workspace/worktree。branch・端末・検証環境を持つ | worktreeはファイルの分離であり、権限やネットワークのsandboxではない |
| パーティー | 同じ目的に協力する担当者と役割 | ハーネス内subagentと、独立CLIのworkerを同じ制御機能だと扱わない |
| 宝箱・巻物 | 変更候補・調査結果と、その根拠 | 報告到着を自動的な品質保証や採用と扱わない |

### 不足機能と具体的なRPG表現

| 機能 | 取り込み案 | 実用性の条件 |
| --- | --- | --- |
| **永続task/issue** | **ギルドのクエスト掲示板**：目的、受入条件、担当、状態、issue/PR。勇者が交代しても依頼書が残る | 最初は人が作成・割当。CLIのTODOは依頼書内の「作業メモ」として別扱い |
| **worktree/branch** | **遠征拠点を作る**：base branchを選び、独立checkoutへ出陣。町の中に拠点名・branch・担当を出す | 既存checkoutで出す選択も残す。同じcwdの複数書き手には警告。setupの実行は信頼確認 |
| **差分・レビュー** | **持ち帰った宝箱を鑑定する**：変更一覧、実diff、レビューコメント、「なおして」「採用」 | diff・コードは普通の等幅表示でよい。鑑定所まで歩くのを待たず、報告から直接開く |
| **test/CI/acceptance** | **試練の札と合格印**：typecheck、unit test、CIなど受入条件ごとに未実行/成功/失敗/古いを表示 | command・exit code・時刻・対象revisionを確認。新しい変更で印は古くなる |
| **PR/merge** | **町へ成果を届ける**：commit/PR/mergeの経路を一つの成果画面で扱う | 最初はPRの作成・外部確認から。自動mergeや一律cherry-pickを既定にしない |
| **履歴・再開** | **冒険の書**：依頼、判断、変更、検証、終了理由、再開先。必要に応じて本文保存 | 「会話を復元」「コードを戻す」「プロセスを再開」を別操作にする |
| **checkpoint** | **セーブポイント**：変更前の差分を確認して戻す | セッション単位の巻き戻しで同じworkspaceの他者の変更を消さない。まず別branchへ復元 |
| **役割と引き継ぎ** | **パーティー編成・引き継ぎの巻物**：調査役、実装役、review役。目的・判断・未完了・成果を渡す | 最初は人が編成。担当の所有権を移し、二人に同時に同じ編集をさせない。送信前に内容を確認 |
| **依存関係・判断待ち** | **閉じた門・伝令**：先行クエスト待ち、質問、検証失敗、採用待ちを理由付きで表示 | グラフ演出だけでなく、横断一覧の一行でも分かる。待機と失敗を分ける |
| **CLI/API** | **作戦指令書**：既存のCLIエージェントから仕事一覧・派遣・進捗・報告を操作 | 見た目のクリックを自動化するのではなく、画面と同じ既存server機能を操作する薄いCLI |
| **files/skills/MCP** | **図書館と道具屋**：参照するファイル・資料、利用できるskills/toolsを選ぶ | 最初は選択・参照・依頼への添付。設定変更や第三者コードの導入は明示承認。プラグイン基盤は不要 |
| **run/preview** | **水晶で動く成果を見る**：仕事に紐付くdev server、URL、port、スクリーンショット | 初期はURLと外部IDE/ブラウザへの導線でもよい。iframeでは表示できないサイトがあり、独自browser engineは急がない |
| **quota/cost/resources** | **会計帳と補給状況**：実費/推定/API換算、quota、reset、CPU/RAM | MPはcontextのまま。subscription料金とAPI換算を混ぜず、不明値を作らない |
| **通知・素早い移動** | **伝令を強化**：次に判断が必要な勇者・クエストへ一キーで飛ぶ | 町・勇者・仕事を横断検索。地図を移動することを必須操作にしない |
| **定期実行・remote** | **巡回任務・遠い地方への遠征** | 後回し。権限・予算・認証・切断時の状態・重複実行を先に設計する |

### 信頼されるRPG表現のルール

- **世界観は入口と状況表示に使う。情報を隠すためには使わない。** 「遠征拠点（worktree）」「試練（テスト）」のように、詳細では実務名・path・branch・model・commandも見せる。
- **ゲームのために実務を待たせない。** 文字送り・移動・演出は省略可能。建物と同じ機能を通知・一覧・ショートカットからも開く。
- **勝利は段階を分ける。** 「攻撃成功＝ツール成功」「帰還＝agent turn終了」「試練合格＝検証成功」「クエスト達成＝受入・採用」。合格していない宝箱は「鑑定待ち」。
- **Lv/HPは能力・品質・進捗率ではない。** 現在のLvはツール成功数等、HPは最近の失敗からの指標。ツール連打で育つLvを生産性ランキングにすると逆効果。ゲーム上の記録として説明し、ADEの判断は別の事実で行う。
- **装備のランクを万能の強さにしない。** モデルは速度・費用・得意分野が違う。実際のmodel/effortを出し、「高い武器だから正しい」とは示さない。
- **作戦と権限は別。** 「ガンガンいこうぜ」は依頼文であり、自動承認やsandbox変更の同意ではない。
- **地図と一覧は同じ情報の二つの見方。** 賑やかさを抑えたい利用者、キーボード・支援技術利用者にも、状態と同じ操作を到達可能にする。

## 7. 推奨する実装順

順序は価値・依存関係・実装リスクからの判断。工数・利用率の実測がないため、数値のRICEや週数は付けていない。

### 段階A：まず一人で日常開発できるADE

1. **repo/workspace/quest/sessionの同一性を整理**し、仕事のmetadata・採否・検証証拠をローカルに残す。本文保存は明示的な選択。大量の過去transcript取り込みはまだ不要。
2. **既存workspaceのgit status/diffとレビュー差し戻し**を追加。報告のファイルパスから確認できるようにする。最低限のread-only閲覧と外部エディタ連携でよく、フルIDEは不要。
3. **新しい遠征拠点＝worktreeの作成と準備**を追加。base、branch、cwd、同じ場所での編集競合を見える化。repo内スクリプトや秘密ファイルのコピーはユーザーの承認を取る。
4. **依頼の受入条件と検証状態**を持たせる。最後のテスト一回ではなく、必要な検証すべてを対象revisionと結び付ける。最初の出荷導線はcommit/PRへの接続まででもよい。
5. **Codexの対応範囲を拡大**。まずsession/state/report/resume、次に安全に対応できる許可操作。hooksのtrust条件を回避せず、対応しない機能は明示する。
6. **横断一覧・検索・通知への一キー移動、再起動後の仕事再開**を仕上げる。プロセスの自動再開は、実行中か不明な時に二重起動しない方針を先に決める。

終了条件：一件のバグ修正を、依頼→分離作業→差分確認→検証→PRまで進め、server再起動後にも依頼・採否・次の手を辿れる。

### 段階B：二〜三人の勇者を実際に協力させる

- 薄い管理CLIを作り、画面からできる仕事管理と派遣を既存エージェントからも操作できるようにする。
- 人がクエストを分割し、実装・review・検証の担当を割り当てる。最初から自動分解・汎用DAG engineを作らない。
- 仕事ごとの担当・試行ID・依存・質問・構造化した結果を持つ。送信受付、開始、完了、受入を区別する。
- 引き継ぐ情報を人に見せる。別のproviderへ渡す時、terminal出力に鍵などが混ざり得るため、無加工の全ログを既定で送らない。[S2]
- coordinatorは既存Claude/pi等を使う。アプリ内LLMやコードプラグインなしで始める。

終了条件：実装役の成果をreview役へ渡し、問題を差し戻して修正・再検証できる。誰が編集権を持つか、どの試行の成果を採用したかが分かる。

### 段階C：待ち時間と運用の負担を減らす

files/画像の添付、skills/toolsの参照、run/preview、usage/予算、追加agent対応を進める。次に定期任務とremote/mobile。後者はlocalhost/token前提を変更するため、認証・通信・権限制御の独立した設計が必要。

当面は、町のlayout editor、レア装備、戦闘演出の追加、独自ハーネス、フルコードエディタ、全自動merge、企業向け共同クラウドを優先しない。

## 8. 差別化の方向と検証方法

**「RPGだから使う」入口と、「指揮しやすいから使い続ける」理由を分ける。**

Orca/Superset/Conductorへの追従ではなく、**仕事・担当・詰まり・必要な判断・成果の状態が一目で分かる**ことを強みにする。対象利用者はまず、一人で複数CLIに開発を任せる個人開発者・小規模チーム。大規模自動運用や企業の全要件を最初から抱えない。

価値を確かめるタスク：

- 3件の仕事のうち、判断待ちを特定して答える。
- 同じrepoの2件を、互いの編集を壊さず進める。
- 「agentは完了したが検証は失敗」の成果を、採用せず差し戻す。
- 途中でアプリを再起動し、昨日の依頼と判断を辿って再開する。
- 実装を別agentに引き継ぎ、旧担当の重複編集を避ける。

見る指標：正しい仕事を特定する時間、不要な画面往復、判断待ち時間、再開の成功、編集競合、誤採用。Lv・ツール数・同時勇者数ではない。まず同じYusharioの地図と一覧で比較し、その後競合との同一課題の比較を行う。

## 9. 実装方針との整合

現在の `docs/ARCHITECTURE.md` は意図的に、worktree作成・本文永続化・ハーネス・任意command等をPoC対象外としている。ここで挙げた不足は、その当初判断が誤りだったという意味ではなく、ADEへ進むなら選び直す境界である。

採用した段階ごとに、その範囲だけを `ARCHITECTURE.md` と `PLATFORM.md` に反映する。純粋core・薄いadapters・server/webの既存境界を保ち、factory/DI/plugin/event busなどの将来用基盤は足さない。調査だけでコードや現在の保存方針は変更しない。

## 出典

公式資料の内容を比較根拠として用いた。mainのREADMEは上記commitに固定し、Web docsは調査日に参照したもの。

[O1]: https://github.com/stablyai/orca/blob/dd4d0fa51f03ec0e60f68358d048e37cfe5705db/README.md
[O2]: https://www.onorca.dev/docs/cli/orchestration
[O3]: https://www.onorca.dev/docs/model/worktrees
[S1]: https://github.com/superset-sh/superset/blob/cc31d024c8f266caad52ea15d14311f5d22ba5cc/README.md
[S2]: https://docs.superset.sh/agent-sessions
[S3]: https://docs.superset.sh/diff-viewer
[S4]: https://docs.superset.sh/usage
[C1]: https://www.conductor.build/docs/concepts/workflow
[C2]: https://www.conductor.build/docs/reference/checks
[C3]: https://www.conductor.build/docs/reference/checkpoints
[C4]: https://www.conductor.build/docs/reference/security-and-permissions
[M1]: https://github.com/manaflow-ai/cmux/blob/88cc4d3881220d9862bfecedb00167dfb8013675/README.md
[M2]: https://cmux.com/docs/session-restore
[M3]: https://cmux.com/blog/claude-code-best-worktree-manager
[M4]: https://cmux.com/docs/cloud
[G1]: https://github.com/steveyegge/gastown/blob/649b832b7672bc7a2dbef26f5983aba6198b819b/README.md
[P1]: https://github.com/pixel-agents-hq/pixel-agents/blob/d1e007a9fdf3003c252d2973abe1999ae59aec33/README.md

- [Orca：履歴](https://www.onorca.dev/docs/agents/session-history)、[差分コメント](https://www.onorca.dev/docs/review/annotate-ai-diff)、[usage](https://www.onorca.dev/docs/agents/usage-tracking)。Task/Dispatch等の詳細は `orca skills get orchestration --json` のversion-matched guideでも確認した。
- [Superset：協調](https://docs.superset.sh/orchestration)、[workspaces](https://docs.superset.sh/workspaces)、[全docs index](https://docs.superset.sh/llms.txt)。
- [Conductor：Cloud](https://www.conductor.build/docs/cloud/faq)、[全docs](https://www.conductor.build/llms-full.txt)、[changelog](https://www.conductor.build/changelog)。Cloud FAQのmobile記述には古い「coming soon」が残るため、提供状況は最新changelogと併せて判断した。
- [cmux：fork](https://cmux.com/blog/cmux-fork)、[全docs index](https://cmux.com/llms.txt)。

検証：調査時のworktreeで `npm run typecheck` と `npm test` が成功（29 files、518 tests）。変更はこの調査文書だけ。依存追加なし。
