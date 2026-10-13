<p align="center">
  <img src="public/logo/title.png" width="560" alt="Yushario" />
</p>

<p align="center">
  <strong>Turn dull work into adventure.</strong><br/>
  Your AI coding agents become heroes in a pixel-art RPG town.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A522.12-339933.svg" alt="Node ≥ 22.12" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey.svg" alt="macOS | Linux" />
</p>

<p align="center"><a href="README.ja.md">日本語</a></p>

---

> **Keep using Claude Code or pi as usual — every session walks into town as a hero, fights its work in battle, and comes back with a report.**

Yushario is a local browser app that watches your coding agents and plays their work as a small RPG. Each session is a hero. Each project is a town. Edits, tests and commands become battles; subagents join the party; finished work arrives as a treasure chest you can open.

<p align="center">
  <img src="docs/images/town.gif" alt="Heroes walking around towns of five styles" width="720" />
  <br/>
  <sub><em>Every project gets its own town — village, port, snow, desert or volcano.</em></sub>
</p>

<p align="center">
  <img src="docs/images/party.gif" alt="A hero and four companions facing a dragon" width="720" />
  <br/>
  <sub><em>Delegate work to subagents and they fight beside your hero.</em></sub>
</p>

## Why?

Agents work in a terminal: useful, but easy to lose track of once several are running. Yushario turns that invisible activity into something you can glance at — and makes the hours of waiting a little more fun.

## Features

- **One session, one hero** — launch an agent and a hero arrives in the town of its project.
- **Work as battles** — the field shows what the agent is doing; Lv, HP and MP sum up finished work, recent failures and remaining context.
- **Party of subagents** — each subagent joins as a companion: Explore is a thief, Plan a priest, general-purpose a warrior, and your own custom agents are mages.
- **Talk and reports** — send requests, read reports, and answer Claude Code permission requests without leaving the town.
- **Notification sounds** — top-bar button: all heroes / followed hero only (permissions from everyone) / off. Gentle cues for permissions, reports, failures and level-ups only.
- **Rest and pray** — idle heroes doze at the inn; context compaction happens at the church.
- **Your real terminal, built in** — open the same CLI session at any time. Yushario never replaces your agent.

## Supported agents

| Agent | Heroes and town | Embedded terminal |
| --- | :---: | :---: |
| Claude Code | ✅ | ✅ |
| [pi](https://pi.dev/) | ✅ | ✅ |
| Codex | — | ✅ |
| shell | — | ✅ |

Hooks are attached only to agents launched from Yushario. Your personal agent settings are not edited.

## Quick start

Requires Node.js 22.12+, macOS or Linux, and at least one agent CLI installed and logged in.

```sh
cd /path/to/your/project
npx yushario
```

Your browser opens the town. Choose **しゅつじん** (Launch) to start an agent, then click your hero.

Until the first npm release, run from a checkout:

```sh
git clone https://github.com/Morishita-mm/agent-character.git
cd agent-character
npm install && npm run build && npm start
```

Run `npx yushario --help` for the port and other options.

> The interface uses Japanese RPG labels for now.

## Privacy and security

- Runs only on `127.0.0.1`, protected by a random token for each launch. **Don't expose it through a public proxy or tunnel** — terminals run with your user's permissions.
- Conversations, reports and terminal output stay in memory and are gone when Yushario stops. Towns and settings are kept in `~/.config/agent-character/`.

## Development

```sh
npm install
npm run dev        # Vite + local server
npm run typecheck
npm test
```

See [architecture](docs/ARCHITECTURE.md), [platform design](docs/PLATFORM.md), [art pipeline](docs/ART.md) and [trailer tools](tools/demo/README.md).

## License and credits

- Code: [MIT](LICENSE).
- Artwork and logo were made with OpenAI image generation (ChatGPT and Codex) and edited for the app. The project claims no rights in them.
- Palette: [Resurrect 64](https://lospec.com/palette-list/resurrect-64) by Kerrie Lake. Font: [DotGothic16](https://github.com/fontworks-fonts/DotGothic16) (SIL OFL 1.1).
- Trailer: original 8-bit music with a melody from Beethoven's Symphony No. 9 (public domain); sound effects from [Sound Effect Lab](https://soundeffect-lab.info/), not included in this repository.

Claude Code, Codex and pi belong to their respective owners; Yushario is not affiliated with or endorsed by them. Full notices are in [NOTICE](NOTICE).
