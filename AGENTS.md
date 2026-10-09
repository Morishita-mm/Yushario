# AGENTS.md

このリポジトリは PoC。設計は `docs/ARCHITECTURE.md` が正。

## 実装ルール（過剰設計の禁止）

- タスクで指示された範囲だけを実装する。「将来のため」の拡張点・抽象化・設定項目を足さない。
- インタフェースは `docs/ARCHITECTURE.md` に書かれたもの（Decider / Renderer 等）だけ。それ以外にファクトリ、DIコンテナ、プラグイン機構、イベントバス、ジェネリックな基底クラスを作らない。
- 依存パッケージは必要最小限。追加する場合は理由を完了報告に書く。状態管理ライブラリ・UIフレームワーク（React等）・ロガー・バリデーションライブラリは入れない。
- ファイルは小さく、関数は素直に。1ファイル300行を超えそうなら設計を見直す。
- `src/core` は DOM・Node API に依存しない純粋 TypeScript にする。
- Live2D Cubism Core とモデルファイルはコミットしない（`.gitignore` で除外）。
- テストは `src/core` の振る舞いに絞る（vitest）。描画やWSのモックだらけのテストは書かない。

## スタック

- TypeScript (strict), Node 22+, pnpm
- web: Vite（フレームワーク無し）
- server: Node 標準 `http` + `ws`
- test: vitest

## 完了条件の共通項

- `pnpm typecheck` と `pnpm test` が通ること
- 変更したファイルと、追加した依存とその理由を報告すること
