import "./app-layout";
import { language, tr } from "../language";
import "@fontsource/dotgothic16/400.css";
import type { AgentEvent } from "../../core/events";
import { parsePermission, parseRelayEvent } from "./relay-message";
import { staleSessionEnd } from "../../core/session-actions";
import { Room } from "../../core/room";
import { narrate, stats } from "../../core/story";
import { heroPortrait } from "../town/hero-portrait";
import { heroDoing } from "./status-card";
import { Messages, Status } from "./hud";
import { Scene } from "./scene";
import { loadTowns, type TownRecord } from "./ledger";
import type { Session } from "../terminal";
import { initHeroActions } from "./hero-commands";
import { initEquipment } from "./equipment";
import { initRoster } from "./roster";
import { initExpedition } from "./expedition";
import { initTerminals } from "./terminals";
import { initHelp } from "./help";
import { initTitleScreen } from "./title-screen";
import { initSound, notifySound } from "./sound";
import { initTalk } from "./talk";
import { markReviewed, openReview } from "./review-window";
import { initQuests } from "./quests";
import { initPreview } from "./preview";
import "./quests.css";
import { initNotices } from "./notices";
import { pickPartyNotice, setPartyNotices } from "./party-notices";
import { initSideTabs } from "../town/side-tabs";
import { loadNames, parseNames } from "./names";
import "./rpg.css";
import "./talk.css";

const token = new URLSearchParams(location.search).get("token") ?? "";
const canvas = document.querySelector<HTMLCanvasElement>("#world")!;
const connectionLabel = document.querySelector<HTMLElement>("#connection")!;
const launchButton = document.querySelector<HTMLButtonElement>("#expedition")!;
export const scene = new Scene(canvas, document.querySelector<HTMLElement>("#town-layer")!,
  (id, at) => talk.open(id, at), (terminal) => void expedition.openTerminal(terminal),
  (id) => status.openDetails(room, Date.now(), id, scene.names),
  (text, at) => messages.say(text, at), (id) => actions.options(id), (terminal) => equipment.tiers(terminal));
const messages = new Messages(document.querySelector<HTMLElement>("#messages")!, (id) => scene.names.get(id));
const soundLoaded = initSound((text) => messages.say(text));
initTitleScreen();
let room = new Room();
let socket: WebSocket | undefined;
const expedition = initExpedition(() => scene.currentTown, (terminal) => {
  const agent = [...room.agents.values()].find((item) => item.terminal === terminal);
  return agent && (scene.names.get(agent.id) ?? agent.name);
}, (session, towns, quiet) => arrived(session, towns, false, quiet), (terminal) => [...room.agents.values()].find((agent) => agent.terminal === terminal)?.id,
  (id) => talk.open(id), scene.townName);
function arrived(session: Session, towns: TownRecord[], recalled = false, quiet = false): void {
  equipment.remember(session);
  // Launch and recall both register the town before the hero reaches its gate.
  scene.setTowns(towns); scene.expectArrival(session.id);
  // A launch from a quest or the party window returns there instead of opening the talk window.
  scene.enterTown(session.project, () => { if (!quiet) talk.openSession(session.id, recalled, session.preset); });
}
initRoster((session, towns) => arrived(session, towns, true), scene.townName);
initHelp();
initTerminals((terminal) => {
  const agent = [...room.agents.values()].find((item) => item.terminal === terminal);
  return agent && (scene.names.get(agent.id) ?? agent.name);
}, (terminal) => void expedition.openTerminal(terminal), scene.townName);
const talk = initTalk((id) => room.agents.get(id), (id) => scene.names.get(id),
  (terminal) => void expedition.openTerminal(terminal),
  (terminal) => [...room.agents.values()].find((agent) => agent.terminal === terminal), scene.art, reviewHero);
const equipment = initEquipment((id) => room.agents.get(id), (id) => scene.names.get(id),
  (text) => messages.say(text, Date.now()), (terminal) => [...room.agents.values()].find((agent) => agent.terminal === terminal), scene.townName);
const sideTabs = initSideTabs();
const previews = initPreview(talk.draft);
const quests = initQuests(() => scene.currentTown, () => scene.projects, (id) => room.agents.get(id), (id) => scene.names.get(id),
  (id) => { sideTabs.show("party"); scene.select(id, true); }, (id, at) => talk.open(id, at), (n) => sideTabs.count("quests", n), expedition.openLaunch, scene.townName, previews.section, (session) => void expedition.openTerminal(session),
  (session, text) => talk.draft(session, text), (town) => [...room.agents.values()].filter((agent) => agent.project === town), (hero) => void actions.farewell(hero),
  (session) => {
    const agent = [...room.agents.values()].find((item) => item.terminal === session), now = agent && stats(agent, Date.now());
    return { portrait: heroPortrait(scene.art, agent?.id), gear: equipment.brief(session), mp: now?.mp, level: now?.level, here: Boolean(agent), doing: agent && heroDoing(agent, Date.now()), talk: agent?.talk };
  }, equipment.briefGear);
talk.setQuestControls(quests.current, quests.choose, quests.reportTitle);
scene.openQuests = () => sideTabs.show("quests");
const status = new Status(
  document.querySelector<HTMLElement>("#party")!,
  (id, decision) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "permission-decision", id, decision }));
  },
  (agent) => scene.select(agent),
  (terminal) => void expedition.openTerminal(terminal),
  namesChanged,
  (id) => scene.select(id, true),
  equipment.describe,
  (n) => sideTabs.count("party", n), scene.townName, reviewHero, equipment.brief, (id) => talk.open(id), quests.membership,
);
function namesChanged(names: Record<string, string>): void {
  scene.savedNames.clear();
  for (const [id, name] of Object.entries(names)) scene.savedNames.set(id, name);
  scene.sync(room, Date.now()); talk.update();
}

const actions = initHeroActions((id) => room.agents.get(id), talk,
  (id) => scene.prepareDeparture(id), () => status.closeDetails(), (text) => messages.say(text, Date.now()),
  (id) => scene.names.get(id), equipment.open, reviewHero);
function reviewHero(id: string, at?: number): void {
  const agent = room.agents.get(id), terminal = agent?.terminal;
  if (!terminal) return;
  const reportAt = at ?? [...agent.talk].reverse().find((entry) => entry.report?.files.length)?.at;
  talk.close(); status.closeDetails();
  openReview(scene.names.get(id) ?? agent.name, terminal, (draft) => draft ? talk.draft(terminal, draft) : talk.open(id, reportAt),
    () => void expedition.openTerminal(terminal), () => { if (reportAt !== undefined) markReviewed(id, reportAt); });
}

const notices = initNotices(document.querySelector<HTMLElement>("#herald")!, (notice) => {
  if (pickPartyNotice(notice, quests.open)) return;
  if (notice.hero) sideTabs.show("party");
  scene.visitNotice(notice.repo, notice.hero, notice.kind === "report" ? notice.at : undefined);
}, (n) => sideTabs.count("herald", n), scene.townName);

const endedTerminals = new Set<string>();
const endedAgents = new Set<string>(); // Sound only: Room may recreate a hero from a late hook.
function currentTerminal(event: AgentEvent, at: number): boolean {
  if (staleSessionEnd(event, at, room.agents.get(event.agent ?? "default")?.lastEventAt)) return false;
  if (event.terminal) {
    if (endedTerminals.has(event.terminal)) return false;
    const previous = room.agents.get(event.agent ?? "default")?.terminal;
    if (previous && previous !== event.terminal) {
      if (event.hook !== "SessionStart" || event.subagent) return false;
      endedTerminals.add(previous);
    }
    if (event.hook === "SessionEnd" && !event.subagent) endedTerminals.add(event.terminal);
  }
  if (!event.subagent) {
    const id = event.agent ?? "default";
    if (event.hook === "SessionEnd") endedAgents.add(id);
    if (event.hook === "SessionStart") endedAgents.delete(id);
  }
  return true;
}

// A live event: update the world, then tell it as a story.
function live(event: AgentEvent, at: number, audible: boolean): void {
  if (!currentTerminal(event, at)) return;
  const before = room.agents.get(event.agent ?? "default");
  const level = before ? stats(before, at).level : 1;
  const previousContext = before?.context;
  actions.observe(event, at);
  const agent = room.apply(event, at);
  if (event.hook === "SessionStart") void equipment.refresh().catch((error: Error) => messages.say(error.message));
  if (agent?.terminal && !event.subagent) talk.clearAttention(agent.terminal);
  const levelUp = agent !== undefined && stats(agent, at).level > level;
  scene.sync(room, at);
  talk.update();
  // A second SessionEnd (the hook arriving after the server's own) has no hero left to see off.
  if (event.hook !== "SessionEnd" || before) messages.event(event, at, false, previousContext);
  if (levelUp) {
    const name = scene.names.get(agent!.id) ?? agent!.name;
    messages.say(tr(`${name}は レベル${stats(agent!, at).level}に あがった！`, `${name} reached level ${stats(agent!, at).level}!`), at, false, { id: agent!.id, name });
  }
  notifySound({ type: "event", event, levelUp, ended: endedAgents.has(event.agent ?? "default") }, audible, scene.followedId);
}

function replay(events: { event?: unknown; at?: unknown }[]): void {
  // Rebuild who is in town; retell only the last few lines.
  room = new Room();
  talk.resetPending(); actions.reset(); equipment.reset(); endedTerminals.clear(); endedAgents.clear();
  void equipment.refresh().catch((error: Error) => messages.say(error.message));
  const told: [AgentEvent, number][] = [];
  for (const item of events) {
    const parsed = parseRelayEvent(item?.event, item?.at);
    if (!parsed || !currentTerminal(parsed.event, parsed.at)) continue;
    actions.observe(parsed.event, parsed.at);
    const present = room.agents.has(parsed.event.agent ?? "default");
    room.apply(parsed.event, parsed.at);
    scene.sync(room, parsed.at, true);
    const line = parsed.event.hook === "SessionEnd" && !present ? undefined
      : narrate({ ...parsed.event, name: scene.names.get(parsed.event.agent ?? "default") ?? parsed.event.name }, undefined, language);
    if (line) told.push([parsed.event, parsed.at]);
  }
  scene.sync(room, Date.now());
  for (const [event, at] of told.slice(-3)) messages.event(event, at, true);
  if (!told.length) messages.say(tr("はじめに：「しゅつじん」で 作業フォルダ（町）を えらび、勇者（CLI）を 出す。\nつぎに：クエストを書く → 勇者に任せる → 報告と変更を見る → 採用する。\nくわしくは 右上の「ヘルプ」へ。", "First: Embark — choose a work folder (town) and a hero (CLI).\nThen: write a quest → assign a hero → read the report and changes → adopt.\nMore under Help (top right)."), undefined, true);
}

function receiveMessage(message: MessageEvent): void {
  try {
    const data = JSON.parse(message.data);
    if (data.type === "replay" && Array.isArray(data.events)) {
      replay(data.events);
    } else if (data.type === "quests" && Array.isArray(data.quests) && Array.isArray(data.bindings)) {
      quests.set(data); previews.remember(data.quests); talk.update(); status.refresh();
    } else if (data.type === "party-notices") {
      setPartyNotices(data);
    } else if (data.type === "names") {
      const names = parseNames(data.names);
      if (names) namesChanged(names);
    } else if (data.type === "towns" && Array.isArray(data.towns)) {
      scene.setTowns(data.towns);
    } else if (data.type === "pending" && typeof data.terminal === "string" && Array.isArray(data.texts)
      && data.texts.every((text: unknown) => typeof text === "string")) {
      talk.setPending(data.terminal, data.texts);
      equipment.setPending(data.terminal, data.equipment);
    } else if (data.type === "attention" && typeof data.terminal === "string" && data.reason === "trust") {
      if (![...room.agents.values()].some((agent) => agent.terminal === data.terminal)) talk.attention(data.terminal);
      notifySound({ type: "attention", reason: data.reason }, data.live !== false, scene.followedId);
    } else if (data.type === "equipped" && typeof data.session?.id === "string") {
      equipment.changed(data.session);
    } else if (data.type === "event") {
      const parsed = parseRelayEvent(data.event, data.at);
      if (parsed) live(parsed.event, parsed.at, data.live !== false);
    } else if (data.type === "permission") {
      const request = parsePermission(data);
      if (request) {
        notifySound({ type: "permission", ...request }, data.live !== false, scene.followedId);
        status.permissions.set(request.id, request);
      }
    } else if (data.type === "permission-resolved") {
      status.permissions.delete(data.id);
    }
  } catch (error) {
    console.warn("Invalid relay message:", error);
  }
}

function connect(): void {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const current = new WebSocket(`${protocol}//${location.host}/ws?token=${encodeURIComponent(token)}`);
  socket = current;
  connectionLabel.textContent = tr("せつぞく中…", "Connecting…");
  current.onopen = () => { connectionLabel.textContent = ""; };
  current.onmessage = receiveMessage;
  current.onerror = () => current.close();
  current.onclose = () => { status.permissions.clear(); setPartyNotices({}); void reconnect(); };
}
async function reconnect(): Promise<void> {
  connectionLabel.textContent = tr("せつだん… さいせつぞく まち", "Disconnected… Reconnecting");
  try {
    // Browsers hide the WS handshake status. A read-only API distinguishes 403 from an outage.
    const response = await fetch(`/api/sessions?token=${encodeURIComponent(token)}`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (response.status === 403) {
      connectionLabel.textContent = tr("サーバーが 起動しなおした。ターミナルに出た 新しい URL を ひらいて", "Server restarted. Open the new URL shown in the terminal.");
      return;
    }
  } catch { /* An unreachable server is still a temporary disconnect. */ }
  setTimeout(connect, 3000);
}

let lastStatus = 0;
function frame(time: number): void {
  const now = Date.now();
  if (now - lastStatus > 250) {
    launchButton.classList.toggle("beckon", room.agents.size === 0); // No heroes yet: point at the launch.
    talk.update();
    scene.sync(room, now);
    notices(room, scene.projects, status.permissions, scene.names, now, scene.currentTown);
    status.render(room, now, scene.selected, scene.names, scene.currentTown);
    quests.render();
    previews.decorate(room.agents.values(), quests.current, scene.currentTown);
    expedition.updateTitle();
    lastStatus = now;
  }
  scene.frame(time, now);
  messages.tick();
  talk.tick(time);
  requestAnimationFrame(frame);
}

async function start(): Promise<void> {
  await scene.load();
  try { scene.setTowns(await loadTowns()); }
  catch (error) {
    messages.say(tr("町の台帳を よみこめませんでした。せつぞくを おたしかめください。", "Could not load towns. Check the connection."), undefined, true);
    console.warn(error);
  }
  try { namesChanged(await loadNames()); }
  catch (error) { messages.say(tr("勇者の なまえを よみこめませんでした。", "Could not load hero names."), undefined, true); console.warn(error); }
  await soundLoaded;
  connect();
  requestAnimationFrame(frame);
}
export const started = start().catch((error: unknown) => {
  connectionLabel.textContent = tr("町の絵を よみこめませんでした", "Could not load town art");
  console.error(error);
});
