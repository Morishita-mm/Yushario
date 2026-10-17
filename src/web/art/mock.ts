import { installMockServer, publishMock } from "./mock-server";
import { addHero, demo, event, heroId, reply } from "./mock-state";
import type { HeroPlace } from "../../core/town";
import type { AgentEvent } from "../../core/events";
import "./mock.css";

// The only substitution is the server boundary. The app's main, Scene, Status, dialogs and
// quest controller below are exactly the same modules used by index.html.
const initial = new URLSearchParams(location.search).get("scene");
if (initial?.startsWith("equipment-")) {
  demo.sessions.slice(0, 4).forEach((session, i) => { session.weapon = [undefined, "dagger", "steel", "legend"][i]; });
  if (initial === "equipment-battle") demo.sessions[0].weapon = "legend";
}
installMockServer();
const app = await import("../rpg/main");
await app.started;
document.querySelector<HTMLButtonElement>("#title-start")?.click();
const feedback = document.querySelector<HTMLElement>("#mock-feedback")!;
const controls = document.querySelector<HTMLElement>("#mock-controls")!;
// Settings reload the app; demo fixtures are intentionally reset on reload too.
controls.addEventListener("keydown", (event) => event.stopPropagation());
for (const button of controls.querySelectorAll<HTMLButtonElement>("[data-place]")) {
  button.addEventListener("click", () => {
    const place = button.dataset.place as "world" | HeroPlace;
    const battle = button.dataset.battle;
    const session = battle ? demo.sessions.find((item) => demo.names[heroId(item.id)] === battle) : undefined;
    if (session && button.hasAttribute("data-dragon")) {
      event(session.id, { state: "working", hook: "PreToolUse", tool: "Agent", target: "デモの仲間" });
      event(session.id, { state: "working", hook: "SubagentStart", subagent: { id: "demo-helper", type: "general-purpose" } });
      publishMock();
    }
    if (session) app.scene.select(heroId(session.id));
    if (place === "world") app.scene.go("world");
    else {
      const theme = new URLSearchParams(location.search).get("town");
      const town = session?.project ?? app.scene.currentTown ?? demo.towns.find((item) => item.theme === theme)?.key ?? demo.towns[0].key!;
      app.scene.enterTown(town, () => app.scene.go(place, false, session ? heroId(session.id) : undefined));
    }
    for (const item of controls.querySelectorAll("[data-place]")) item.classList.toggle("on", item === button);
  });
}
const form = document.querySelector<HTMLFormElement>("#mock-add-hero")!;
form.addEventListener("submit", (input) => {
  input.preventDefault();
  const name = new FormData(form).get("hero")?.toString().trim();
  const session = addHero(name, app.scene.currentTown ?? demo.towns[0].key!);
  publishMock(); app.scene.select(heroId(session.id)); form.reset();
  feedback.textContent = "架空の勇者を追加しました。CLIは起動していません。";
});
document.querySelector("#mock-add-quest")!.addEventListener("click", () => {
  document.querySelector<HTMLButtonElement>("#tab-quests")!.click();
  document.querySelector<HTMLButtonElement>("#quests .quest-new")?.click();
});
const activities: Record<string, Partial<AgentEvent>> = {
  idle: { state: "idle", hook: "Stop" }, edit: { state: "working", hook: "PreToolUse", tool: "Edit", target: "settings.ts" },
  test: { state: "working", hook: "PreToolUse", tool: "Bash", target: "npm test" },
  run: { state: "working", hook: "PreToolUse", tool: "Bash", target: "npm run build" },
  rest: { state: "working", hook: "PreCompact" }, ask: { state: "waiting_input", hook: "Notification" },
};
document.querySelector("#mock-apply")!.addEventListener("click", () => {
  const session = demo.sessions.find((item) => heroId(item.id) === app.scene.selected);
  if (!session) { feedback.textContent = "先に地図かサイドバーで勇者を選んでください。"; return; }
  const value = document.querySelector<HTMLSelectElement>("#mock-activity")!.value;
  if (value === "done") reply(session.id, "【デモ】報告画面の確認");
  else event(session.id, activities[value]);
  publishMock(); app.scene.select(heroId(session.id));
  feedback.textContent = "デモの状態を反映しました。実際の処理は実行していません。";
});
const aliases: Record<string, string> = { "b-meadow": "ミラ", "b-cave": "ルカ", "b-forest": "ノア", "b-boss": "アレン", "equipment-battle": "アレン" };
const button = aliases[initial ?? ""] ? controls.querySelector<HTMLButtonElement>(`[data-battle="${aliases[initial!]}"]`)
  : controls.querySelector<HTMLButtonElement>(`[data-place="${initial === "equipment-town" ? "town" : initial ?? "world"}"]:not([data-battle])`);
button?.click();
