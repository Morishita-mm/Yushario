// Mock reports: what an agent tells you when a piece of work is done. In the real app these come
// from the Stop hook (the last reply) plus the turn's tally of tools, files, tests and failures.
import type { Report } from "../town/report";

export const REPORTS: Record<string, Report> = {
  "t19-search": {
    title: "せんとうけっか", who: "t19-search は スライム「room.ts」を たおした！",
    rows: [
      ["かかった時間", "4分12秒"], ["こうどう", "ツール 23回（へんしゅう 8・よむ 9・テスト 3・コマンド 3）"],
      ["しっぱい", "2回（テスト 1・コマンド 1）→ さいごは せいこう"], ["さわったファイル", "room.ts / room.test.ts / scene.ts"],
      ["テスト", "npm test ○（1回目は ×）"], ["けいけんち", "+32（Lv 4 → 5）　MP 64 → 58"],
    ],
    reply: "Room に wins と quests の数を足し、レベルの計算に使うようにしました。テストを3件追加し、npm test は通っています。scene.ts のラベル表示も Lv を出すように直しています。\n\n" +
      "変更の内訳:\n- src/core/room.ts: RoomAgent に wins（成功したツール数）と quests（達成タスク数）を追加。TaskCompleted は同じタスクで二重に数えないようにしています。\n" +
      "- src/core/story.ts: stats() で Lv = 1 + (wins + quests × 5) / 10、HP は直近5分の失敗数、MP はコンテキストの残りから計算。\n" +
      "- src/core/story.test.ts: レベルアップ、HP の回復、二重カウントしないことのテストを追加。\n- src/web/rpg/scene.ts: 名前の横に Lv を表示。\n\n" +
      "気になった点:\n1回目の npm test で、PostToolUse の到着順が前後すると wins が1つ多く数えられるケースがありました。ts で順序を見るように直してあります。\n" +
      "次にやるなら、レベルアップ時のファンファーレを戦闘フォーカス画面にも出すのがよさそうです。",
  },
  "t20-tests": {
    title: "せんとうけっか", who: "t20-tests は しれんのゴーレムを たおした！",
    rows: [
      ["かかった時間", "1分48秒"], ["こうどう", "ツール 7回（テスト 4・よむ 2・へんしゅう 1）"],
      ["しっぱい", "3回（型検査 3）→ さいごは せいこう"], ["さわったファイル", "events.ts"],
      ["テスト", "npm run typecheck ○（3回 ×）"], ["けいけんち", "+12　MP 40 → 37"],
    ],
    reply: "型エラーは task の status が union になっていなかったのが原因でした。TaskStatus を追加して型検査が通るようにしました。",
  },
  "t21-build": {
    title: "せんとうけっか", who: "t21-build は おばけを たおした！",
    rows: [
      ["かかった時間", "52秒"], ["こうどう", "ツール 4回（コマンド 3・よむ 1）"], ["しっぱい", "なし"],
      ["さわったファイル", "なし"], ["テスト", "—"], ["けいけんち", "+6　MP 71 → 70"],
    ],
    reply: "npm run build は成功しました。チャンクが 500KB を超える警告が1件ありますが、動作には影響ありません。",
  },
  "t5-hooks": {
    title: "ちょうさ ほうこく", who: "t5-hooks は しらべものを おえた。",
    rows: [
      ["かかった時間", "2分05秒"], ["しらべたもの", "よむ 6（hook.mjs / relay.ts / permissions.ts ほか）・さがす 4・Web 1"],
      ["わかったこと", "下の へんじ を みてください"],
    ],
    reply: "PermissionRequest は http フックで受けていて、答えが無いまま 120 秒たつとターミナルに戻ります。ターミナル側で答えた場合は、同じセッション・同じサブエージェントのツール完了か Stop で吹き出しを閉じています。",
  },
  "t2-docs": {
    title: "へんじ", who: "t2-docs が はなしかけてきた。",
    rows: [["かかった時間", "8秒"], ["こうどう", "ツールなし"]],
    reply: "README の起動手順は3つです。npm install、npm run build、npm start のあと、表示された URL をブラウザで開いてください。",
  },
};
