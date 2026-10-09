import type { AgentEvent } from "../../core/events";
import { moods, type Room, type RoomAgent } from "../../core/room";
import { battleMonster, damage, jobOf, stats, type MonsterKind } from "../../core/story";
import { FRAME_H, FRAME_W, type Pose } from "./art/people";
import { battleLook, destination, isBattle, look, move, Places, walkLook, type Actor, type Look } from "./actors";
import { drawBalloon, Effects, outlined } from "./effects";
import { heroColors, monster, person, silhouette } from "./sprites";
import { drawWorld, H, SIGNS, SPOTS, W } from "./world";

const SCALE = 3;
const PARTY = [[-24, -12], [-24, 12], [-42, -4], [-42, 10]];
interface Foe { kind: MonsterKind; target?: string; hp: number; hitAt: number; born: number; x: number; y: number; dyingAt?: number }

export class Scene {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly world = drawWorld();
  private readonly actors = new Map<string, Actor>();
  private readonly foes = new Map<string, Foe>();
  private dying: Foe[] = [];
  private readonly places = new Places();
  private readonly effects = new Effects();
  private readonly hurtAt = new Map<string, number>();
  private readonly cheerAt = new Map<string, number>();
  selected: string | undefined;
  private settling = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    this.ctx = canvas.getContext("2d")!;
  }

  // Live events become hits, wounds and fanfares.
  event(event: AgentEvent, agent: RoomAgent | undefined, levelUp: boolean, now: number): void {
    if (!agent) return;
    const key = event.subagent ? `${agent.id}/${event.subagent.id}` : agent.id;
    const actor = this.actors.get(key) ?? this.actors.get(agent.id);
    const failed = event.state === "error"
      && ["PostToolUse", "PostToolUseFailure", "StopFailure"].includes(event.hook ?? "");
    if (failed && actor) {
      this.hurtAt.set(key, now);
      this.effects.add({ kind: "number", text: `-${damage(event)}`, color: "#ff6b5b", x: actor.x, y: actor.y - 22, born: now });
    }
    const foe = this.foes.get(agent.id);
    if (event.hook === "PostToolUse" && !failed && !event.subagent && foe) {
      foe.hitAt = now;
      foe.hp = Math.max(0.08, foe.hp - 0.22);
      this.effects.add({ kind: "number", text: String(damage(event)), x: foe.x, y: foe.y - 20, born: now });
      if (agent.activity === "test" || agent.activity === "delegate") this.defeat(agent.id, now);
    }
    if (event.hook === "PreToolUse" && agent.activity === "git") {
      this.effects.add({ kind: "sparkle", color: "#9fe8ff", x: SPOTS.crystal.x, y: SPOTS.crystal.y - 18, born: now });
    }
    if (event.hook === "TaskCompleted" && actor) {
      this.cheerAt.set(agent.id, now);
      this.effects.add({ kind: "text", text: "クエストクリア！", color: "#ffe066", x: actor.x, y: actor.y - 28, born: now, life: 1600 });
    }
    if (levelUp && actor) {
      this.cheerAt.set(agent.id, now);
      this.effects.add({ kind: "text", text: "レベルアップ！", color: "#ffe066", x: actor.x, y: actor.y - 34, born: now, life: 1800 });
      this.effects.add({ kind: "sparkle", x: actor.x, y: actor.y - 12, born: now });
    }
    if (event.hook === "SubagentStart" && actor) this.effects.add({ kind: "sparkle", color: "#c8f0ff", x: actor.x, y: actor.y - 10, born: now });
    if (event.hook === "PreCompact") this.effects.add({ kind: "pillar", x: SPOTS.church.x, y: SPOTS.church.y, born: now, life: 2500 });
    if (event.hook === "PostCompact" && actor) {
      this.effects.add({ kind: "text", text: "MP かいふく", color: "#7fd4ff", x: actor.x, y: actor.y - 28, born: now, life: 1500 });
    }
  }

  // After a reload, characters already in town appear in place instead of walking in from the gate.
  settle(): void {
    this.settling = true;
  }

  pick(event: MouseEvent): string | undefined {
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * W / rect.width;
    const y = (event.clientY - rect.top) * H / rect.height;
    for (const [key, actor] of this.actors) {
      if (!key.includes("/") && Math.abs(actor.x - x) <= 8 && y <= actor.y + 2 && y >= actor.y - 24) return key;
    }
  }

  private defeat(id: string, now: number): void {
    const foe = this.foes.get(id);
    if (!foe) return;
    foe.dyingAt = now;
    this.dying.push(foe);
    this.foes.delete(id);
    this.effects.add({ kind: "poof", x: foe.x, y: foe.y - 8, born: now, life: 600 });
  }

  frame(room: Room, now: number, dtMs: number): void {
    const present = new Set(room.agents.keys());
    this.places.release(present);
    const targets = new Map<string, { x: number; y: number }>();
    const slots = new Map<string, number>();
    for (const agent of room.agents.values()) {
      const agentMoods = moods(agent, now);
      const slot = slots.get(agent.activity) ?? 0;
      slots.set(agent.activity, slot + 1);
      const target = destination(agent, agentMoods, this.places, slot);
      targets.set(agent.id, target);
      agent.helpers.forEach((helper, index) => {
        const [dx, dy] = isBattle(agent.activity) ? PARTY[index % PARTY.length] : [-12 * (index + 1), 2];
        targets.set(`${agent.id}/${helper.id}`, { x: target.x + dx, y: target.y + dy });
      });
    }
    for (const [key, target] of targets) {
      let actor = this.actors.get(key);
      if (!actor) {
        const leader = this.actors.get(key.split("/")[0]);
        const start = this.settling ? target : key.includes("/") && leader ? { x: leader.x, y: leader.y } : SPOTS.gate;
        actor = { ...start, walking: false, dx: 1, dy: 0, seed: key.length * 977 % 2000 };
        this.actors.set(key, actor);
      }
      move(actor, target, dtMs);
    }
    for (const [key, actor] of this.actors) {
      if (targets.has(key)) continue;
      if (key.includes("/")) {
        this.effects.add({ kind: "poof", x: actor.x, y: actor.y - 8, born: now, life: 400 });
        this.actors.delete(key);
        continue;
      }
      move(actor, SPOTS.gate, dtMs);
      if (!actor.walking) this.actors.delete(key);
    }
    this.settling = false;
    this.updateFoes(room, now);
    this.draw(room, now);
  }

  private updateFoes(room: Room, now: number): void {
    for (const [id] of this.foes) if (!room.agents.has(id)) this.defeat(id, now);
    for (const agent of room.agents.values()) {
      const kind = battleMonster(agent.activity);
      const actor = this.actors.get(agent.id);
      const foe = this.foes.get(agent.id);
      const arrived = actor && !actor.walking && kind;
      if (foe && (!arrived || foe.kind !== kind || foe.target !== agent.target)) this.defeat(agent.id, now);
      if (arrived && !this.foes.has(agent.id)) {
        this.foes.set(agent.id, { kind, target: agent.target, hp: 1, hitAt: -Infinity, born: now, x: actor.x + 80, y: actor.y });
      }
    }
    this.dying = this.dying.filter((foe) => now - foe.dyingAt! < 450);
  }

  private draw(room: Room, now: number): void {
    const ctx = this.ctx;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.world, 0, 0);
    this.drawProps(room, now);
    const items: { y: number; draw: () => void }[] = [];
    for (const foe of [...this.foes.values(), ...this.dying]) items.push({ y: foe.y, draw: () => this.drawFoe(foe, now) });
    for (const [key, actor] of this.actors) items.push({ y: actor.y, draw: () => this.drawActor(room, key, actor, now) });
    for (const item of items.sort((a, b) => a.y - b.y)) item.draw();
    this.effects.draw(ctx, now);
    for (const sign of SIGNS) outlined(ctx, sign.text, sign.x, sign.y + 8, "#fff7d6", 5);
    for (const [key, actor] of this.actors) this.drawLabel(room, key, actor);
    for (const foe of this.foes.values()) {
      if (foe.target) outlined(ctx, foe.target.length > 14 ? `${foe.target.slice(0, 13)}…` : foe.target, foe.x, foe.y - 25, "#ffe7a3", 5);
    }
    this.effects.drawText(ctx, now);
  }

  private drawActor(room: Room, key: string, actor: Actor, now: number): void {
    const ctx = this.ctx;
    const [id, helperId] = key.split("/");
    const agent = room.agents.get(id);
    const helper = helperId ? agent?.helpers.find((item) => item.id === helperId) : undefined;
    let view: Look;
    if (!agent) view = walkLook(actor, now);
    else if (helper) {
      const battling = isBattle(agent.activity) && !actor.walking;
      const pose: Pose = actor.walking ? walkLook(actor, now).pose
        : battling ? (jobOf(helper.type) === "mage" || jobOf(helper.type) === "priest" ? (Math.floor((now + actor.seed) / 700) % 2 ? "cast" : "side")
          : battleLook("edit", [], now, actor.seed)) : helper.activity === "read" ? "read" : "stand";
      view = { pose, flip: actor.walking && actor.dx < 0, bob: 0 };
    } else view = look(agent, actor, now, now - (this.cheerAt.get(id) ?? -Infinity) < 1500);
    const job = helper ? jobOf(helper.type) : "hero";
    let sprite = person(job, view.pose, helper ? 0 : heroColors(id));
    const hurt = now - (this.hurtAt.get(key) ?? -Infinity);
    const knock = hurt < 400 ? -2 : 0;
    const lunge = view.pose === "slash" ? 6 : view.pose === "windup" ? 2 : 0; // step in on the swing
    if (hurt < 500 && Math.floor(hurt / 80) % 2 === 0) sprite = silhouette(sprite, `${job}:${view.pose}:${id}`, "#ff5b4f");
    const x = Math.round(actor.x + knock + lunge);
    const y = Math.round(actor.y);
    if (view.pose !== "sleep") {
      ctx.fillStyle = "rgba(20, 16, 28, 0.25)";
      ctx.beginPath();
      ctx.ellipse(x, y - 1, 6, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (key === this.selected) {
      ctx.strokeStyle = "#ffe066";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y - 1, 9, 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(x, y - FRAME_H - view.bob);
    if (view.flip) ctx.scale(-1, 1);
    ctx.drawImage(sprite, -FRAME_W / 2, 0);
    ctx.restore();
    const foe = agent && !helper ? this.foes.get(id) : undefined;
    if (foe && view.pose === "slash") this.effects.add({ kind: "slash", x: foe.x - 4, y: foe.y - 10, born: now, life: 160 });
    if (foe && view.pose === "cast") {
      const t = ((now + actor.seed) % 700) / 700;
      ctx.fillStyle = Math.floor(now / 60) % 2 ? "#d6a6ff" : "#ffffff";
      for (let i = 0; i < 3; i++) ctx.fillRect(Math.round(x + 10 + (foe.x - x - 16) * t) - i * 3, Math.round(y - 16 + Math.sin(t * Math.PI) * -6) + i, 2, 2);
    }
    if (view.balloon) drawBalloon(ctx, view.balloon, view.pose === "sleep" ? x + 8 : x, y - (view.pose === "sleep" ? 18 : 25));
  }

  private drawFoe(foe: Foe, now: number): void {
    const ctx = this.ctx;
    let sprite = monster(foe.kind, Math.floor((now + foe.born) / 500) % 2 as 0 | 1);
    const hit = now - foe.hitAt;
    if (foe.dyingAt !== undefined || hit < 150) sprite = silhouette(sprite, `monster:${foe.kind}`, "#ffffff");
    const shake = hit < 250 ? (Math.floor(hit / 40) % 2 ? 2 : -2) : 0;
    const appear = Math.min(1, (now - foe.born) / 300);
    ctx.globalAlpha = foe.dyingAt !== undefined ? Math.max(0, 1 - (now - foe.dyingAt) / 450) : appear;
    ctx.fillStyle = "rgba(20, 16, 28, 0.25)";
    ctx.beginPath();
    ctx.ellipse(foe.x, foe.y - 1, sprite.width / 2.5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(sprite, Math.round(foe.x - sprite.width / 2 + shake), Math.round(foe.y - sprite.height));
    ctx.globalAlpha = 1;
    if (foe.dyingAt === undefined) {
      ctx.fillStyle = "#1d1726";
      ctx.fillRect(foe.x - 11, foe.y + 2, 22, 4);
      ctx.fillStyle = foe.hp > 0.5 ? "#7ee08a" : foe.hp > 0.25 ? "#ffd35a" : "#ff6b5b";
      ctx.fillRect(foe.x - 10, foe.y + 3, Math.max(1, Math.round(20 * foe.hp)), 2);
    }
  }

  private drawLabel(room: Room, key: string, actor: Actor): void {
    const [id, helperId] = key.split("/");
    const agent = room.agents.get(id);
    if (!agent) return;
    if (helperId) {
      const helper = agent.helpers.find((item) => item.id === helperId);
      outlined(this.ctx, helper?.type ?? "なかま", actor.x, actor.y + 7, "#d8f0ff", 4);
      return;
    }
    const sleeping = moods(agent, Date.now()).includes("dozing");
    outlined(this.ctx, `${agent.name} Lv${stats(agent, Date.now()).level}`, actor.x, actor.y + (sleeping ? 4 : 8), "#ffffff", 5);
  }

  private drawProps(room: Room, now: number): void {
    const ctx = this.ctx;
    // Campfire flames.
    const flicker = Math.floor(now / 120) % 3;
    const fx = SPOTS.campfire.x, fy = 150;
    ctx.fillStyle = "#ff7b2e"; ctx.fillRect(fx - 3, fy - 6 - flicker, 6, 6 + flicker);
    ctx.fillStyle = "#ffd35a"; ctx.fillRect(fx - 2 + (flicker % 2), fy - 4 - flicker, 3, 4 + flicker);
    ctx.fillStyle = "#fff6c8"; ctx.fillRect(fx - 1, fy - 2, 2, 2);
    // Floating crystal of records.
    const cy = SPOTS.crystal.y - 28 + Math.round(Math.sin(now / 400) * 1.5);
    const cx = SPOTS.crystal.x;
    ctx.fillStyle = "rgba(120, 220, 255, 0.25)"; ctx.fillRect(cx - 6, cy - 2, 12, 14);
    ctx.fillStyle = "#1d1726"; ctx.fillRect(cx - 4, cy, 8, 10); ctx.fillRect(cx - 2, cy - 2, 4, 14);
    ctx.fillStyle = "#62d0ff"; ctx.fillRect(cx - 3, cy + 1, 6, 8); ctx.fillRect(cx - 1, cy - 1, 2, 12);
    ctx.fillStyle = "#c8f4ff"; ctx.fillRect(cx - 2, cy + 2, 2, 3);
    // Quest notes: the planner's (or anyone's) tasks pinned to the board.
    const agents = [...room.agents.values()].filter((agent) => agent.tasks.length);
    const owner = agents.find((agent) => agent.activity === "plan") ?? agents[0];
    owner?.tasks.slice(0, 6).forEach((task, index) => {
      const nx = 115 + (index % 3) * 16, ny = 53 + Math.floor(index / 3) * 11;
      ctx.fillStyle = "#1d1726"; ctx.fillRect(nx, ny, 14, 10);
      ctx.fillStyle = task.status === "completed" ? "#d9d2bd" : "#f4ead0"; ctx.fillRect(nx + 1, ny + 1, 12, 8);
      ctx.fillStyle = "#c0504d"; ctx.fillRect(nx + 6, ny, 2, 2);
      ctx.fillStyle = "#8a7a5a";
      for (let line = 0; line < 3; line++) ctx.fillRect(nx + 3, ny + 3 + line * 2, 8 - line * 2, 1);
      if (task.status === "completed") { ctx.fillStyle = "#d24a3c"; ctx.fillRect(nx + 8, ny + 5, 3, 3); }
      if (task.status === "in_progress") { ctx.fillStyle = "#ffd35a"; ctx.fillRect(nx + 1, ny + 1, 2, 8); }
    });
    if (owner) {
      const done = owner.tasks.filter((task) => task.status === "completed").length;
      outlined(ctx, `${done}/${owner.tasks.length}`, 137, 82, "#ffe7a3", 5);
    }
  }
}

