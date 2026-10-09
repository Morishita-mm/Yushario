# Agent Character (PoC)

AIエージェントの状態イベントを受け、キャラクターの表情・姿勢として表示する表示専用レイヤーです。
現在はJevの代わりに `MockDecider`、Live2Dの代わりにCanvasの簡易顔を使います。
Cubism Core・モデルは不要で、このリポジトリにも含めません。

## 起動

Node.js 22.12以上とnpm、イベント送信用にcurlが必要です。

```sh
npm install
npm run dev
```

Viteが表示するURL（通常 `http://localhost:5173`）を開いてください。
relayは `http://localhost:8790` で待ち受けます。
`Ctrl+C` で両方のプロセスを停止します。
別々のターミナルで起動する場合は、それぞれ `npm run dev:relay` と `npm run dev:web` を実行します。

relayのポートを変更する場合は `PORT=8791 npm run dev` のように指定します。
別々に起動する場合、**両方のターミナルに同じ `PORT`** を渡してください。
webはViteの `/ws` プロキシ経由でrelayのWebSocketへ接続します。
切断時は3秒後に再接続しますが、接続前・切断中のイベントは保持されません。
画面左下に現在のstateと接続状態を表示します。

## イベントを送る

```sh
scripts/emit.sh thinking "コードを確認中"
scripts/emit.sh working "実装中"
scripts/emit.sh success "完了"
```

ポートを変えた場合は `PORT=8791 scripts/emit.sh thinking "確認中"` とします。
直接HTTPで送ることもできます。

```sh
curl -i -X POST http://localhost:8790/event \
  -H 'Content-Type: application/json' \
  -d '{"state":"thinking","detail":"コードを確認中"}'
```

イベントは `{ state, detail?, ts? }` のJSONです。
`state` は `idle` / `thinking` / `working` / `waiting_input` / `success` / `error`、
`detail` は任意の文字列、`ts` は任意の有限な数値です。
正常時は204、不正なJSONやイベントは400と `{"error":"理由"}` を返します。
検証済みイベントだけを接続中の全WebSocketクライアント（`ws://localhost:8790/ws`）へ配信します。

### Claude Codeのフック例

たとえばプロジェクトの `.claude/settings.local.json` のフックに以下を追加すると、
プロンプト投入時に `thinking` を送れます（既存設定にマージし、パスを実際の絶対パスに置き換えてください）。

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/agent-character/scripts/emit.sh thinking 'Claude Code prompt received'"
          }
        ]
      }
    ]
  }
}
```

フックは状態イベントを送るだけです。ハーネス本体やログ解析は行いません。
relayを起動してから利用してください。

## 検証

```sh
npm run typecheck
npm test
npx vite build
```

ビルド出力は `dist/` です。`npx vite preview` で確認する場合もrelayを別途起動してください。
静的ファイルだけを別のサーバーへ配置する場合、`/ws` のWebSocketプロキシも必要です。

これはローカル開発用PoCです。relayは `127.0.0.1` にのみバインドし、CORSはlocalhost/127.0.0.1のみ許可します。
認証・履歴・再送はなく、インターネットへ公開する用途は想定していません。
