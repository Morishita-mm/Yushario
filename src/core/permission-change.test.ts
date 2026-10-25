import { describe, expect, it } from "vitest";
import { permissionChange } from "./permission-change";
import { permissionSummary } from "./permissions";

const change = (tool_name: string, tool_input: object, length = 20) => permissionChange({ tool_name, tool_input }, length);
describe("mobile-only tool input snapshot", () => {
  it("keeps Write/Edit/MultiEdit literal text, order and replace_all without changing the Mac summary", () => {
    expect(change("Write", { content: "\u0000\n\t😀", secret: "not exported" })).toEqual({ kind: "write", text: "\u0000\n\t😀", omitted: 0 });
    expect(change("Write", { content: "" })).toEqual({ kind: "write", text: "", omitted: 0 });
    const edit = { old_string: "old", new_string: "new", replace_all: true };
    expect(change("Edit", edit)).toEqual({ kind: "edit", edits: [{ before: "old", after: "new", replaceAll: true }], omitted: 0, omittedEdits: 0 });
    expect(change("MultiEdit", { edits: [edit, { old_string: "", new_string: "append" }] })).toEqual({ kind: "edit",
      edits: [{ before: "old", after: "new", replaceAll: true }, { before: "", after: "append", replaceAll: false }], omitted: 0, omittedEdits: 0 });
    expect(change("Bash", { command: "echo test" })).toBeNull();
    expect(change("Read", { path: "a" })).toBeNull();
    expect(permissionSummary({ hook_event_name: "PermissionRequest", tool_name: "Write", tool_input: { file_path: "a", content: "private body" } }))
      .toEqual({ tool: "Write", summary: "Write: a", content: "a", omitted: 0 });
  });
  it("caps a shared UTF-16 text budget and edit count, never splits a pair, counts even empty omitted edits", () => {
    expect(change("Write", { content: "x".repeat(1999) + "😀" })).toEqual({ kind: "write", text: "x".repeat(1999), omitted: 2 });
    expect(change("Write", { content: "x".repeat(2000) }, 2000)).toEqual({ kind: "write", text: "x".repeat(1000), omitted: 1000 });
    const result = change("MultiEdit", { edits: Array(17).fill({ old_string: "", new_string: "" }) });
    expect(result).toMatchObject({ kind: "edit", omitted: 0, omittedEdits: 1 });
    if (result?.kind === "edit") expect(result.edits).toHaveLength(16);
    expect(change("Edit", { old_string: "a".repeat(1200), new_string: "b".repeat(1200) })).toMatchObject({ omitted: 400 });
  });
  it("fails closed on missing, malformed, and invalid-surrogate inputs, including hidden edits", () => {
    for (const [tool, fields] of [["Write", {}], ["Write", { content: "\ud800" }], ["Edit", { old_string: "a" }],
      ["Edit", { old_string: "a", new_string: "b", replace_all: "false" }], ["MultiEdit", { edits: [] }],
      ["MultiEdit", { edits: [...Array(16).fill({ old_string: "", new_string: "" }), {}] }]] as const) {
      expect(change(tool, fields)).toEqual({ kind: "unavailable" });
    }
  });
});
