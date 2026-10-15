---
name: yushario-party
description: Use when you are a hero in a Yushario quest party (your terminal has AGENT_CHARACTER_SESSION set) and need to read the quest, leave a note, or — as the commander — send requests to party members, invite heroes, or hand the quest to the person for review.
---

# Yushario party tools

Yushario shows coding agents as RPG heroes. A person writes a **quest** and forms a **party** of heroes for it.
You were launched by Yushario, so your terminal can reach it with `yushario quest …`
(if `yushario` is not on PATH, run `node "$AGENT_CHARACTER_QUEST_TOOL" quest …`).

## Roles

- **Owner (担当)**: the only hero who changes files.
- **Helpers (手伝い)**: research, review or test. They do not change files; they report.
- **Commander (しき)**: sends requests to the party and invites heroes. Only one per quest.

How reports travel:
- Your final reply is your report. Yushario delivers it to whoever asked.
- When a tactic is set, Yushario also forwards it. Under "research first" it goes to the owner, under "review each other" it goes back and forth between the owner and reviewers, and under "leave it all" it goes to the commander.
- Helpers cannot message other heroes and do not need to. Write the report and stop.
- Only the person adopts a result. No hero can mark a quest done.

## Commands

Every hero can use:

| Command | What it does |
|---|---|
| `yushario quest read [--json]` | The quest: title, purpose, state, party (session id · name · role) and recent events. Event texts are not included. |
| `yushario quest note --text '…'` | Leave a short note (1–2000 characters) in the quest's log for the person. |

Only the commander can use:

| Command | What it does |
|---|---|
| `yushario quest send --session <id> --text '…'` | Send a request to a party member (session ids come from `read`). If that hero is busy, the request is held until it is free. |
| `yushario quest invite --session <id> --role <role> [--note '…']` | Invite a hero who is already in this town. |
| `yushario quest invite --preset <kind> --cwd <path> --role <role> [--note '…']` | Invite a new hero (for example `--preset claude`) whose folder is in this town. |
| `yushario quest review` | Tell the person the quest is ready for their review. |

Roles: `implement` (owner), `review`, `research`, `test`, `command`.
An invitation does nothing until the person presses yes at the herald (でんれい). Do not wait in a loop for the answer; go on with your work.

Commands act on the quest you are in. Add `--json` for machine-readable output.

## Commander's way of working

1. Run `yushario quest read --json` to see the party and the roles.
2. Send each member one clear request with `send`. Say what to look at and what to report. Do not ask helpers to change files or to message each other.
3. Read the reports as they reach you, then decide the next request.
4. When the owner's work is ready, run `yushario quest review` and summarise it in your reply. The person decides whether to adopt it.
