import equipmentJson from "../../server/equipment.json?raw";
import { addHero, demo, event, heroId, questPacket, reply } from "./mock-state";
import { questApi } from "./mock-quest-api";
import { diffs, review } from "./mock-review";
import { mockFingerprint } from "./mock-checks";

// Page-local implementation of the existing HTTP / WS contracts. No real server or terminal.
const clients = new Set<DemoSocket>();
let delivered = 0;
class DemoSocket extends EventTarget {
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  constructor(readonly pty: boolean) {
    super();
    queueMicrotask(() => {
      this.readyState = 1; clients.add(this); this.onopen?.(new Event("open"));
      if (pty) this.onmessage?.(new MessageEvent("message", { data: "\r\n【デモ】本物の端末には接続していません。入力・コマンドは実行しません。\r\n" }));
      else {
        this.packet({ type: "towns", towns: demo.towns }); this.packet({ type: "names", names: demo.names });
        this.packet(questPacket()); this.packet({ type: "replay", events: demo.events }); delivered = demo.events.length;
      }
    });
  }
  packet(value: unknown): void { if (!this.pty && this.readyState === 1) this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(value) })); }
  send(text: string): void {
    if (this.pty) return;
    const message = JSON.parse(text);
    if (message.type === "permission-decision") this.packet({ type: "permission-resolved", id: message.id });
  }
  close(): void { clients.delete(this); this.readyState = 3; this.onclose?.(new Event("close")); }
}
export function publishMock(): void {
  for (const client of clients) {
    client.packet({ type: "towns", towns: demo.towns }); client.packet({ type: "names", names: demo.names });
    for (const item of demo.events.slice(delivered)) client.packet({ type: "event", ...item, live: false });
    client.packet(questPacket());
  }
  delivered = demo.events.length;
}
function route(url: URL, method: string, body: Record<string, any>): unknown {
  const parts = url.pathname.split("/").filter(Boolean), resource = parts[1], id = decodeURIComponent(parts[2] ?? ""), action = parts[3];
  if (resource === "settings") {
    if (method === "PUT") Object.assign(demo.settings, body);
    return { ...demo.settings, startupCwd: demo.towns[0].path };
  }
  if (resource === "names") {
    if (method === "PUT") { if (body.name) demo.names[id] = body.name; else delete demo.names[id]; }
    return demo.names;
  }
  if (resource === "towns") {
    if (method === "PATCH") { const town = demo.towns.find((item) => item.key === id); if (town) Object.assign(town, body, body.archived === false ? { archivedAt: undefined } : {}); return town; }
    return demo.towns;
  }
  if (resource === "agents") return ["claude", "pi", "codex", "shell"].map((key) => ({ id: key, label: { claude: "Claude Code", pi: "pi", codex: "Codex", shell: "shell" }[key], installed: true, hero: key !== "shell", resume: true, compact: true, equipWeapon: key === "claude", equipAccessory: key === "claude" || key === "pi" }));
  if (resource === "equipment") return JSON.parse(equipmentJson);
  if (resource === "sessions") {
    if (!id) {
      if (method === "POST") return addHero(undefined, demo.towns.some((town) => town.key === body.cwd) ? body.cwd : demo.towns[0].key, body.preset);
      return demo.sessions;
    }
    const session = demo.sessions.find((item) => item.id === id);
    if (!session) throw new Error("デモの端末が見つかりません");
    if (action === "say") { reply(id, body.text); return { delivered: true }; }
    if (action === "equip") {
      session.weapon = body.weapon; session.accessory = body.accessory;
      for (const client of clients) client.packet({ type: "equipped", session });
      return { delivered: true };
    }
    if (action === "action") {
      if (body.action === "farewell") { session.exited = { code: 0, at: Date.now() }; event(id, { hook: "SessionEnd" }); }
      else event(id, { hook: body.action === "compact" ? "PostCompact" : "InterruptConfirmed", state: "idle" });
      return {};
    }
    if (method === "DELETE") { session.exited = { code: 0, at: Date.now() }; event(id, { hook: "SessionEnd" }); }
    return session;
  }
  if (resource === "quests") return questApi(url, method, body);
  if (resource === "party-notices") return { requests: [], warnings: [] };
  if (resource === "roster") {
    if (method === "POST") return addHero(demo.names[id]);
    return demo.sessions.filter((session) => session.exited).map((session) => ({ ...session, sessionId: heroId(session.id), name: demo.names[heroId(session.id)], leftAt: session.exited!.at }));
  }
  if (resource === "previews") {
    if (method !== "GET") throw new Error("デモでは外部・ローカルのプレビューに接続しません");
    return { links: [], candidates: [] };
  }
  if (resource === "worktrees") {
    if (method !== "GET") throw new Error("デモでは本物のworktreeは作成・削除しません");
    const cwd = url.searchParams.get("cwd") ?? demo.towns[0].path;
    return { cwd, root: cwd, worktrees: [{ path: cwd, branch: "quest/demo", head: "abc1234", main: true }], branches: ["main", "quest/demo"], current: "quest/demo", defaultParent: "/demo" };
  }
  if (resource === "review") {
    if (id === "verdict") return { ok: true };
    if (id === "diff") return diffs[url.searchParams.get("path") ?? "src/a.ts"] ?? { text: "【デモ】差分はありません" };
    return { ...review, comparison: { ...review.comparison, mode: url.searchParams.get("mode") === "branch" ? "branch" : "uncommitted", base: url.searchParams.get("base") ?? "origin/main", mergeBase: "0123456789abcdef" } };
  }
  throw new Error("この操作はデモ対象外です。実データには接続しません。");
}
export function installMockServer(): void {
  const originalFetch = window.fetch.bind(window), OriginalSocket = window.WebSocket;
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return originalFetch(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    try {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const result = route(url, method, body);
      if (method !== "GET") queueMicrotask(publishMock);
      return Response.json(result ?? null);
    } catch (error) { return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 }); }
  };
  window.WebSocket = new Proxy(OriginalSocket, { construct(target, args) {
    const url = new URL(String(args[0]), location.href);
    if (url.host === location.host && (url.pathname === "/ws" || url.pathname === "/pty")) return new DemoSocket(url.pathname === "/pty");
    return Reflect.construct(target, args);
  } });
}
