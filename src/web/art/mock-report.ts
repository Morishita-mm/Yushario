// Mock reports: what an agent tells you when a piece of work is done. In the real app these come
// from the Stop hook (the last reply) plus the turn's tally of tools, files, tests and failures.
import { tr } from "../language";
import type { Report } from "../town/report";

export const REPORTS: Record<string, Report> = {
  "t19-search": {
    title: tr("せんとうけっか", "Battle results"), who: tr("t19-search は スライム「room.ts」を たおした！", 't19-search defeated the Slime "room.ts"!'),
    rows: [
      [tr("かかった時間", "Time"), tr("4分12秒", "4m 12s")], [tr("こうどう", "Actions"), tr("ツール 23回（へんしゅう 8・よむ 9・テスト 3・コマンド 3）", "23 tools (8 edits, 9 reads, 3 tests, 3 commands)")],
      [tr("しっぱい", "Failures"), tr("2回（テスト 1・コマンド 1）→ さいごは せいこう", "2 (1 test, 1 command) → success")], [tr("さわったファイル", "Files touched"), "room.ts / room.test.ts / scene.ts"],
      [tr("テスト", "Tests"), tr("npm test ○（1回目は ×）", "npm test ○ (first try ×)")], [tr("けいけんち", "EXP"), "+32（Lv 4 → 5）　MP 64 → 58"],
    ],
    reply: tr("Room に wins と quests の数を足し、レベルの計算に使うようにしました。テストを3件追加し、npm test は通っています。scene.ts のラベル表示も Lv を出すように直しています。\n\n" +
      "変更の内訳:\n- src/core/room.ts: RoomAgent に wins（成功したツール数）と quests（達成タスク数）を追加。TaskCompleted は同じタスクで二重に数えないようにしています。\n" +
      "- src/core/story.ts: stats() で Lv = 1 + (wins + quests × 5) / 10、HP は直近5分の失敗数、MP はコンテキストの残りから計算。\n" +
      "- src/core/story.test.ts: レベルアップ、HP の回復、二重カウントしないことのテストを追加。\n- src/web/rpg/scene.ts: 名前の横に Lv を表示。\n\n" +
      "気になった点:\n1回目の npm test で、PostToolUse の到着順が前後すると wins が1つ多く数えられるケースがありました。ts で順序を見るように直してあります。\n" +
      "次にやるなら、レベルアップ時のファンファーレを戦闘フォーカス画面にも出すのがよさそうです。",
      "Added wins and quests to Room for level calculation. Added three tests; npm test passes. The scene.ts labels now show Lv.\n\n" +
      "Changes:\n- src/core/room.ts: Added successful tool and completed quest counts to RoomAgent, without counting a completed task twice.\n" +
      "- src/core/story.ts: Lv = 1 + (wins + quests × 5) / 10; HP follows failures in the last 5 minutes; MP follows remaining context.\n" +
      "- src/core/story.test.ts: Added tests for levels, HP recovery and duplicate counting.\n- src/web/rpg/scene.ts: Show Lv beside the name.\n\n" +
      "Notes:\nThe first npm test found that out-of-order PostToolUse hooks could add an extra win. Fixed ordering with ts.\n" +
      "Next, a level-up fanfare in battle focus could be nice."),
  },
  "t20-tests": {
    title: tr("せんとうけっか", "Battle results"), who: tr("t20-tests は しれんのゴーレムを たおした！", "t20-tests defeated the trial Golem!"),
    rows: [
      [tr("かかった時間", "Time"), tr("1分48秒", "1m 48s")], [tr("こうどう", "Actions"), tr("ツール 7回（テスト 4・よむ 2・へんしゅう 1）", "7 tools (4 tests, 2 reads, 1 edit)")],
      [tr("しっぱい", "Failures"), tr("3回（型検査 3）→ さいごは せいこう", "3 typechecks → success")], [tr("さわったファイル", "Files touched"), "events.ts"],
      [tr("テスト", "Tests"), tr("npm run typecheck ○（3回 ×）", "npm run typecheck ○ (3 tries ×)")], [tr("けいけんち", "EXP"), "+12　MP 40 → 37"],
    ],
    reply: tr("型エラーは task の status が union になっていなかったのが原因でした。TaskStatus を追加して型検査が通るようにしました。", "The task status lacked a union type. Added TaskStatus; typecheck now passes."),
  },
  "t21-build": {
    title: tr("せんとうけっか", "Battle results"), who: tr("t21-build は おばけを たおした！", "t21-build defeated the Ghost!"),
    rows: [
      [tr("かかった時間", "Time"), tr("52秒", "52s")], [tr("こうどう", "Actions"), tr("ツール 4回（コマンド 3・よむ 1）", "4 tools (3 commands, 1 read)")], [tr("しっぱい", "Failures"), tr("なし", "None")],
      [tr("さわったファイル", "Files touched"), tr("なし", "None")], [tr("テスト", "Tests"), "—"], [tr("けいけんち", "EXP"), "+6　MP 71 → 70"],
    ],
    reply: tr("npm run build は成功しました。チャンクが 500KB を超える警告が1件ありますが、動作には影響ありません。", "npm run build passed. One chunk exceeds 500KB; it does not affect operation."),
  },
  "t5-hooks": {
    title: tr("ちょうさ ほうこく", "Exploration report"), who: tr("t5-hooks は しらべものを おえた。", "t5-hooks finished exploring."),
    rows: [
      [tr("かかった時間", "Time"), tr("2分05秒", "2m 05s")], [tr("しらべたもの", "Explored"), tr("よむ 6（hook.mjs / relay.ts / permissions.ts ほか）・さがす 4・Web 1", "6 reads (hook.mjs / relay.ts / permissions.ts and more), 4 searches, 1 Web")],
      [tr("わかったこと", "Findings"), tr("下の へんじ を みてください", "See the reply below")],
    ],
    reply: tr("PermissionRequest は http フックで受けていて、答えが無いまま 120 秒たつとターミナルに戻ります。ターミナル側で答えた場合は、同じセッション・同じサブエージェントのツール完了か Stop で吹き出しを閉じています。", "PermissionRequest uses the HTTP hook. After 120 seconds without an answer it returns to the terminal. A matching tool completion or Stop closes the prompt."),
  },
  "t2-docs": {
    title: tr("へんじ", "Reply"), who: tr("t2-docs が はなしかけてきた。", "t2-docs came to talk."),
    rows: [[tr("かかった時間", "Time"), tr("8秒", "8s")], [tr("こうどう", "Actions"), tr("ツールなし", "No tools")]],
    reply: tr("README の起動手順は3つです。npm install、npm run build、npm start のあと、表示された URL をブラウザで開いてください。", "Run npm install, npm run build, then npm start. Open the printed URL in your browser."),
  },
};
