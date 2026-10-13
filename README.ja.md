<p align="center">
  <img src="https://raw.githubusercontent.com/Morishita-mm/agent-character/main/public/logo/title.png" width="560" alt="Yushario" />
</p>

<p align="center">
  <strong>退屈な仕事を冒険に。</strong><br/>
  AI コーディングエージェントが、ドット絵の RPG の町で勇者になる。
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A522.12-339933.svg" alt="Node ≥ 22.12" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey.svg" alt="macOS | Linux" />
</p>

<p align="center"><a href="README.md">English</a></p>

---

> **Claude Code や pi はいつも通りに使うだけ。セッションごとに勇者が町へやってきて、仕事を戦いで片付け、報告を持って帰ってきます。**

Yushario は、コーディングエージェントの仕事を小さな RPG として見せるローカルのブラウザアプリです。セッションは勇者に、プロジェクトは町になります。編集・テスト・コマンドは戦闘に、サブエージェントは仲間に、終わった仕事は開けられる宝箱になって届きます。

<p align="center">
  <img src="https://raw.githubusercontent.com/Morishita-mm/agent-character/main/docs/images/town.gif" alt="5種類の町を歩く勇者たち" width="720" />
  <br/>
  <sub><em>プロジェクトごとに町ができます。村・港・雪・砂漠・火山の5種類。</em></sub>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/Morishita-mm/agent-character/main/docs/images/party.gif" alt="勇者と4人の仲間がドラゴンに挑む" width="720" />
  <br/>
  <sub><em>サブエージェントに任せた仕事は、仲間が一緒に戦います。</em></sub>
</p>

## なぜ作ったか

エージェントはターミナルの中で働きます。便利ですが、何人も動かすと何をしているのか追いにくくなります。Yushario は見えない作業をひと目で分かる形にし、待ち時間を少し楽しくします。

## 特徴

- **1セッションに1人の勇者**：エージェントを起動すると、そのプロジェクトの町に勇者がやってきます。
- **仕事は戦闘**：フィールドで今の作業が分かります。Lv・HP・MP は、終えた仕事・最近の失敗・残りのコンテキストを表します。
- **サブエージェントは仲間**：Explore は盗賊、Plan は僧侶、general-purpose は戦士、自分で定義したエージェントは魔法使いとして加わります。
- **はなす・報告**：依頼を送る、報告を読む、Claude Code の許可要求に答える。町から離れずにできます。
- **やすむ・いのる**：手の空いた勇者は宿屋で居眠りし、会話の整理は教会で行います。
- **本物のターミナル付き**：いつでも同じ CLI セッションを開けます。Yushario はエージェントの代わりにはなりません。

## 対応エージェント

| エージェント | 勇者と町 | 埋め込みターミナル |
| --- | :---: | :---: |
| Claude Code | ✅ | ✅ |
| [pi](https://pi.dev/) | ✅ | ✅ |
| Codex | — | ✅ |
| shell | — | ✅ |

フックを付けるのは Yushario から起動したエージェントだけです。個人の設定ファイルは書き換えません。

## はじめ方

Node.js 22.12 以上、macOS か Linux、ログイン済みのエージェント CLI が1つ以上必要です。

```sh
cd /path/to/your/project
npx yushario
```

ブラウザで町が開きます。**しゅつじん**でエージェントを起動し、勇者をクリックしてください。

npm に公開するまでは、ソースから起動します。

```sh
git clone https://github.com/Morishita-mm/agent-character.git
cd agent-character
npm install && npm run build && npm start
```

ポートなどの設定は `npx yushario --help` で確認できます。

## プライバシーとセキュリティ

- `127.0.0.1` だけで動き、起動ごとのランダムなトークンで守ります。ターミナルは利用者の権限で動くので、**公開プロキシやトンネルで外に出さないでください。**
- 会話・報告・ターミナルの出力はメモリにだけ置き、Yushario を止めると消えます。町と設定は `~/.config/agent-character/` に保存します。

## 開発

```sh
npm install
npm run dev        # Vite とローカルサーバー
npm run typecheck
npm test
```

[構成](docs/ARCHITECTURE.md)、[プラットフォームの設計](docs/PLATFORM.md)、[絵の作り方](docs/ART.md)、[PV の道具](tools/demo/README.md)も見てください。

## ライセンスとクレジット

- コード：[MIT](LICENSE)。
- 絵とロゴは OpenAI の画像生成（ChatGPT・Codex）で作り、アプリ用に手を加えました。権利は主張しません。
- パレット：Kerrie Lake 作 [Resurrect 64](https://lospec.com/palette-list/resurrect-64)。フォント：[DotGothic16](https://github.com/fontworks-fonts/DotGothic16)（SIL OFL 1.1）。
- PV：ベートーヴェン『交響曲第9番』の旋律（パブリックドメイン）を使った自作の8bit曲。効果音は[効果音ラボ](https://soundeffect-lab.info/)で、このリポジトリには含めません。

Claude Code・Codex・pi は各権利者の製品で、Yushario は提携・推薦を受けていません。詳しくは [NOTICE](NOTICE) を見てください。
