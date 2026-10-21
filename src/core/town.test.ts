import { describe, expect, it } from "vitest";
import type { Activity } from "./activity";
import { MOOD_RULES, Room } from "./room";
import { townView, type HeroPlace, type TownNames } from "./town";

function arrive(room: Room, id: string, name = "main-2", project?: string) {
  return room.apply({ state: "idle", hook: "SessionStart", agent: id, name, project }, 0)!;
}

describe("townView", () => {
  it("returns no projects for an empty room and retains departed names", () => {
    expect(townView(new Room(), 0)).toEqual({ projects: [], names: [] });
    const previous: TownNames = [{ id: "old", project: "repo", base: "main-2", name: "main-2" }];
    expect(townView(new Room(), 0, previous)).toEqual({ projects: [], names: previous });
  });

  it("groups by project with name fallback, preserving Map arrival order", () => {
    const room = new Room();
    arrive(room, "z", "main-2", "repo-b");
    arrive(room, "a", "main-2", "repo-a");
    arrive(room, "b", "feature", "repo-b");
    arrive(room, "c", "external");
    arrive(room, "d", "empty").project = "";
    const { projects, names } = townView(room, 0);
    expect(projects.map((project) => [project.name, project.heroes.map((hero) => hero.id)]))
      .toEqual([["repo-b", ["z", "b"]], ["repo-a", ["a"]], ["external", ["c"]], ["", ["d"]]]);
    expect(names.map((entry) => entry.id)).toEqual(["z", "a", "b", "c", "d"]);
    expect(projects[0].heroes[0]).toMatchObject({ name: "main-2", project: "repo-b" });
    expect(projects[1].heroes[0].name).toBe("main-2");
  });

  it("assigns duplicates in arrival order without renumbering or reusing departed names", () => {
    const room = new Room();
    arrive(room, "first", "main-2", "repo");
    arrive(room, "second", "main-2", "repo");
    let view = townView(room, 0);
    expect(view.projects[0].heroes.map((hero) => hero.name)).toEqual(["main-2", "main-2 (2)"]);
    room.apply({ state: "idle", hook: "SessionEnd", agent: "first" }, 1);
    arrive(room, "third", "main-2", "repo");
    view = townView(room, 1, view.names);
    expect(view.projects[0].heroes.map((hero) => hero.name)).toEqual(["main-2 (2)", "main-2 (3)"]);
    room.apply({ state: "idle", hook: "SessionEnd", agent: "second" }, 2);
    room.apply({ state: "idle", hook: "SessionEnd", agent: "third" }, 2);
    view = townView(room, 2, view.names);
    expect(view.projects).toEqual([]);
    arrive(room, "fourth", "main-2", "repo");
    arrive(room, "first", "main-2", "repo");
    view = townView(room, 3, view.names);
    expect(view.projects[0].heroes.map((hero) => hero.name)).toEqual(["main-2 (4)", "main-2"]);
    expect(view.names.map((entry) => entry.id)).toEqual(["first", "second", "third", "fourth"]);
  });

  it("keeps a display name for the same ID even if its source name or project changes", () => {
    const room = new Room();
    arrive(room, "a", "main-2", "repo");
    const previous = townView(room, 0).names;
    room.apply({ state: "idle", agent: "a", name: "renamed", project: "other" }, 1);
    const view = townView(room, 1, previous);
    expect(view.projects[0].heroes[0]).toMatchObject({ id: "a", name: "main-2", project: "other" });
    expect(view.names).toEqual(previous);
  });

  it.each<[Activity, string, HeroPlace]>([
    ["edit", "slime", "meadow"], ["delegate", "dragon", "meadow"],
    ["test", "golem", "cave"], ["run", "ghost", "forest"],
  ])("places %s battles in their field even when dozing", (activity, monster, place) => {
    const room = new Room();
    const agent = arrive(room, "a");
    agent.activity = activity;
    agent.running = false;
    expect(townView(room, MOOD_RULES.dozingMs).projects[0].heroes[0]).toMatchObject({ monster, place });
  });

  it.each<Activity>(["idle", "think", "web", "git", "plan", "ask"])
    ("places nonbattle %s in town until the dozing threshold", (activity) => {
      const room = new Room();
      arrive(room, "a").activity = activity;
      const awake = townView(room, MOOD_RULES.dozingMs - 1).projects[0].heroes[0];
      expect(awake.place).toBe("town");
      expect(awake).not.toHaveProperty("monster");
      expect(townView(room, MOOD_RULES.dozingMs).projects[0].heroes[0].place).toBe("inn");
    });

  it.each<[string, HeroPlace, boolean]>([["Read", "library", false], ["Grep", "library", true], ["mcp__demo__inspect", "shop", false]])
    ("puts %s inside and retains its place for eight seconds after the last matching activity", (tool, place, librarySearch) => {
      const room = new Room(); arrive(room, "a");
      room.apply({ state: "working", agent: "a", hook: "PreToolUse", tool }, 1000);
      expect(townView(room, 60_000).projects[0].heroes[0]).toMatchObject({ place, librarySearch });
      room.apply({ state: "working", agent: "a", hook: "PreToolUse", tool: "TaskUpdate" }, 2000);
      expect(townView(room, 8999).projects[0].heroes[0].place).toBe(place);
      expect(townView(room, 9000).projects[0].heroes[0].place).toBe("town");
      room.apply({ state: "working", agent: "a", hook: "PreToolUse", tool }, 10_000);
      room.apply({ state: "idle", agent: "a", hook: "Stop" }, 11_000);
      expect(townView(room, 17_999).projects[0].heroes[0].place).toBe(place);
      expect(townView(room, 18_000).projects[0].heroes[0].place).toBe("town");
    });
  it("switches interiors immediately and preserves battle/rest/dozing priority", () => {
    const room = new Room(); arrive(room, "a");
    const change = (tool: string, at: number) => {
      room.apply({ state: "working", agent: "a", hook: "PreToolUse", tool }, at);
      return townView(room, at).projects[0].heroes[0];
    };
    expect(change("Read", 1000).place).toBe("library");
    expect(change("Grep", 2000)).toMatchObject({ place: "library", librarySearch: true });
    expect(change("mcp__demo__inspect", 3000).place).toBe("shop");
    expect(change("Edit", 4000).place).toBe("meadow");
    change("Read", 5000);
    room.apply({ state: "working", agent: "a", hook: "PreCompact" }, 6000);
    expect(townView(room, 6000).projects[0].heroes[0].place).toBe("church");
    change("Read", 7000);
    expect(townView(room, 7000 + MOOD_RULES.dozingMs).projects[0].heroes[0].place).toBe("inn");
  });
  it("maps all helpers to jobs in their existing order and retains the source agent", () => {
    const room = new Room();
    const agent = arrive(room, "a");
    agent.helpers = ["Explore", "Plan", "general-purpose", "custom", undefined]
      .map((type, index) => ({ id: String(index), type, activity: "think" }));
    const hero = townView(room, 0).projects[0].heroes[0];
    expect(hero.party).toEqual(["thief", "priest", "warrior", "mage", "mage"]);
    expect(hero.agent).toBe(agent);
  });

  it("does not mutate the room or the supplied naming history", () => {
    const room = new Room();
    arrive(room, "a", "main-2", "repo");
    const previous = townView(room, 0).names;
    Object.freeze(previous[0]);
    Object.freeze(previous);
    arrive(room, "b", "main-2", "repo");
    const before = [...room.agents.values()].map((agent) => structuredClone(agent));
    const view = townView(room, 0, previous);
    expect(previous).toHaveLength(1);
    expect(view.names).toHaveLength(2);
    expect(view.names).not.toBe(previous);
    expect([...room.agents.values()]).toEqual(before);
    expect(townView(room, 0, previous)).toEqual(view);
  });
});

describe("townView rest", () => {
  it("puts compacting heroes in the church, never in the inn even after the dozing threshold", () => {
    const room = new Room();
    const agent = arrive(room, "a");
    room.apply({ state: "working", agent: "a", hook: "PreCompact" }, 1);
    expect(agent.activity).toBe("rest");
    expect(townView(room, 2).projects[0].heroes[0]).toMatchObject({ place: "church", party: [] });
    agent.running = false;
    expect(townView(room, MOOD_RULES.dozingMs + 1).projects[0].heroes[0].place).toBe("church");
  });

  it.each([undefined, "Compaction failed", "Compaction cancelled"])
    ("returns to town after PostCompact (%s), keeping ordinary dozing in the inn", (detail) => {
      const room = new Room();
      arrive(room, "a");
      room.apply({ state: "working", agent: "a", hook: "PreCompact" }, 1);
      room.apply({ state: "idle", agent: "a", hook: "PostCompact", detail }, 2);
      const hero = townView(room, 3).projects[0].heroes[0];
      expect(hero.agent.activity).toBe("idle");
      expect(hero.place).toBe("town");
      expect(hero).not.toHaveProperty("monster");
      expect(townView(room, MOOD_RULES.dozingMs + 2).projects[0].heroes[0].place).toBe("inn");
    });

  it("keeps prayer, dozing, and a battle in separate places in the same town", () => {
    const room = new Room();
    arrive(room, "sleep");
    arrive(room, "prayer");
    arrive(room, "fighter");
    room.apply({ state: "working", agent: "prayer", hook: "PreCompact" }, MOOD_RULES.dozingMs);
    room.apply({ state: "working", agent: "fighter", hook: "PreToolUse", tool: "Edit" }, MOOD_RULES.dozingMs);
    expect(townView(room, MOOD_RULES.dozingMs).projects[0].heroes.map((hero) => hero.place))
      .toEqual(["inn", "church", "meadow"]);
  });
});
