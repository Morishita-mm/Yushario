# Reproducing the trailer

Development-only tools for the final **49.5-second, 30fps** trailer: Japanese/English, 1920×1080 and 1080×1080. They are not part of the npm package. Run commands from the repository root.

## Inputs

- `recordings/report/`: the original Japanese six-file repair and test report.
- `recordings/report-en/`: the separately recorded English request/reply, used only for the English treasure scene; six file edits, one successful test run, thirteen tools.
- `recordings/party/`: a real four-profession Claude battle and the two existing pi sessions.
- `recordings/rest/`: compaction and more than ten minutes of recorded inactivity.
- `pv/shots.mjs`: the final cut schedule and effect anchors.
- `pv/score.mjs` and `pv/front-score.mjs`: the adopted B arrangement. Project-produced, AI-assisted accompaniment and connecting phrases; the closing melody quotes Beethoven’s *Symphony No. 9, Op. 125, IV*.

These are reviewed, anonymized demo fixtures, not users’ session histories. Only the used prefixes and verification boundaries are retained. Hooks, text, results, and receipt intervals inside each selected prefix are preserved. Party session/terminal/helper IDs are consistently replaced with neutral demo IDs; unused internal notifications and private transcripts are not included. The five world-map projects use approved filming-only project/name aliases into real temporary folders; independently recorded town sessions use per-recording receipt translations for simultaneous playback. These mappings are saved in `video/presentation-map.json` and never change a result. Historical source labels remain stable for traceability. Capture edits presentation clocks and camera, never starts an agent, and never rewinds the animation clock.

## Requirements

Install the repository dependencies with `npm install`; also provide `ffmpeg` and `ffprobe` on `PATH`. Capture requires an active host-IDE embedded-browser CLI session. It uses that session’s browser only and never falls back to an external browser. Audio rendering and verification run offline with Node.

## Optional: deliberately re-record the party fixture

`node tools/demo/pv/record-party.mjs` **launches one real Claude Code PTY and exactly four helpers**. Run it only with explicit approval for this live recording. It uses port **8879**, a `/tmp/yushario-party-*` project/data/config directory, the existing app session API and Claude hooks, and a temporary copy of authentication only—not user settings or histories. It never writes `~/.claude` or uses 8790. The reviewed fixture is tiny-quest: three one-line arithmetic bugs and three additional boundary tests; only the main agent edits and runs `npm test` once.

The first request requires **four Agent calls in one assistant response**: Explore → thief (quest), Plan → priest (pack), general-purpose → warrior (health), and the project-local `.claude/agents/quest-mage.md` → mage (boundary review). Every helper reads README and the six source/test files. The custom definition exposes only Read/Glob/Grep; a project hook also prevents built-in helpers from editing or running commands while allowing their internal report handback. The complete request, custom definition, helper requests, and same-response proof are in `recordings/party/manifest.json`.

The recorder validates real starts/stops, overlap, read-only helper tools, one successful test execution and a final Stop. It exits Claude, checks its descendants, stops the relay, removes the temporary directory, and writes `.art-work/pv/party-recording/cleanup.json`. Inspect the output before replacing fixtures. Keep only the battle prefix through the four-helper dispatch and its final verification Stop; anonymize all IDs/paths consistently, preserve the existing two pi sessions with neutral aliases, and retain the recording manifest. The camera only replays these fixtures and never launches agents.

## Optional: deliberately re-record the English report

`node tools/demo/pv/record-report-en.mjs <new-evidence-directory>` launches **one real Claude Code PTY and one Explore helper**; run only with explicit approval, never as part of normal filming. Like the party recorder, it uses 8879 and temporary project/data/config folders, copies authentication only, checks process cleanup, and never writes normal user settings. It keeps the exact approved English tiny-quest request. The helper's actually executed (`PostToolUse`) tools must be read-only; a denied attempt is recorded, not silently removed. Six real file-tool events and a separately recognizable successful test event are needed for the app's genuine chest; compound shell edits may be real work but are not observable as file edits by the app.

Review and anonymize the events through the final Stop, retain the manifest and original receipt intervals, and place only the reviewed fixture in `recordings/report-en/`. Do not rewrite requests, replies or results. The adopted first take includes a helper `Bash ls -la` attempt blocked by the project hook (no corresponding execution); its final reply describes that denial. The full recorded English reply remains in the fixture; the PV clips at the measured end of its first paragraph without editing the text. Japanese and party recordings stay unchanged. Raw PTY evidence, rejected takes and cleanup evidence remain under ignored `.art-work/pv/`.

## 1. Capture the silent sources

Before replacing the v7 delivery, preserve both existing directories (never overwrite an existing backup):

```sh
test ! -e .art-work/pv/v7-backup && mkdir .art-work/pv/v7-backup && mv .art-work/pv/final .art-work/pv/video .art-work/pv/v7-backup/
```

Then capture:

```sh
npm run build
node tools/demo/pv/film.mjs .art-work/pv/video
node --import tsx tools/demo/pv/verify.mjs .art-work/pv/video
node tools/demo/pv/frames.mjs .art-work/pv/video
```

Capture uses port **8878**, a random token, and a temporary `/tmp/yushario-pv-*` data directory. It refuses to use another port when occupied and closes its own browser page/server and deletes its temporary data on completion or failure. It never uses your normal data directory or port 8790. Check `video/cleanup.json` after capture. Each variant explicitly saves temporary settings with `language: "en"` or `"ja"` (never `"auto"`), with app sound off. The filming iframe inherits the token-bearing page URL so the genuine language initialization reads these settings; capture asserts `<html lang>`. Report UI, place/theme matching, level-up selection and measured text bounds are checked in the selected language. The English treasure shot uses `report-en/`; Japanese uses the unchanged `report/`. No recorded reply is translated or rewritten by the camera.

The five town appearances form **one continuous 7.5-second walk**, with no cuts, fades, clock seeks, or camera changes between themes. Capture waits once off-camera for an actual east-lane walk, then uses the real appearance chooser every 1.5 seconds and saves only into temporary data; it never assigns a Walker position, path or direction. Verification checks all 225 frames across theme boundaries, unchanged positions at each chooser action, monotonic clocks, fixed crop, and opaque head/sword/foot pixels plus name bounds with at least 24px margin. The world map shows five towns across all five regions, while the town has four distinct real sessions. All town/introduction feet are checked against the actual village road graph and fountain clearance. S14 (31.5–33.5s) holds the hero's back with “Not alone”; S15 (33.5–34.5s) shows the dragon with “When the going gets tough”; S16 (34.5–35.5s) pulls continuously from that exact dragon crop to the full party with “Face it together”, and S17 holds that wide crop until 37.5s. The dragon remains visible throughout the pullback; the hero plus thief, priest, warrior and mage fit after it and throughout S17/S20/S23. No explanatory footnotes remain. The ending logo wipes left-to-right on its six-pixel source grid from 43.6–44.7s, with nearest-neighbor sampling; the tagline pops in at **46.6s (frame 1398)**, when the closing melody’s third phrase (`titleEase`) begins, and remains absent through frame 1397. The complete logo holds alone from 44.7–46.6s; the wipe, music and other cuts are unchanged. For the wide battle shots it photographs the genuine canvas just before the bottom HUD is drawn, retaining the feet and ground underneath; the app still draws its HUD unchanged. The treasure sequence clicks the actual unread report badge and captures the actual report DOM, clipped at the measured end of its first paragraph without editing text. Both genuine reports have six files, one successful test run, zero failed test runs, and thirteen tools—not six test runs; verification derives the English tally from its own recorded events. The boss sequence does not invent a victory.

Capture replays the reviewed event packets into the current web app's WS receiver; it does not POST synthetic hooks to `/event` or `/hooks/permission`, create PTYs, or claim authenticated quest/check evidence. Thus stage 19.5's terminal Bearer requirement does not affect these shots. No permission/quest-window shots are added to the approved cut. Historical fixtures lack today's full shell-command field: the tally is the current core's interpretation of their recorded targets, not a fresh test execution. Town aliases are resolved to the temporary folder keys returned by the current server so the genuine appearance chooser can still persist its PATCH.

The report camera measures the genuine rendered Markdown first paragraph (including inline code), never the old flat span. It scales code with the enlarged filming text and remeasures after clipping changes the history scroll position. Source verification checks the current last-test result and “Test runs” labels against the original events.

The reshoot camera uses the current canvas accessibility label instead of the removed `#place-name` DOM element, and fixes the filming-only map area at 1920×1080 despite the responsive app layout. It measures top-of-map place titles separately from hero labels (the two can share a name). Town/interior crops retain the new title plates, the church priest and the inn's six complete bed sprites; verification checks all 120 interior frames per variant without changing the recorded one-person occupancy or the actor safety margin.

The level-up strip is the genuine notification DOM line, not a recreated caption. Capture measures that line with a DOM Range, disables wrapping and fits it to the viewport before cropping; source verification checks its text and actual bounds in both aspect ratios.

For a composition preview only:

```sh
node tools/demo/pv/film.mjs .art-work/pv/preview source-en-1x1 --stills-only
```

Stills-only mode is not a substitute for full-video verification.

## 2. Acquire the three effects privately

Review [Sound Effect Lab’s terms](https://soundeffect-lab.info/agreement/) and obtain these materials from their official pages:

| Local filename | Material | Official page |
| --- | --- | --- |
| `sword.mp3` | 剣で斬る2 | https://soundeffect-lab.info/sound/battle/ |
| `level.mp3` | 決定ボタンを押す28 | https://soundeffect-lab.info/sound/button/ |
| `chest.mp3` | 宝箱を開ける | https://soundeffect-lab.info/sound/anime/ |

Place them in **`.art-work/pv/audio/sources/`**, which is ignored by Git. Alongside them, create `assets.json`, an array of three objects with `key` (`sword`, `level`, or `chest`), `name`, `page`, and `sourceSha256` (SHA-256 of the downloaded MP3). The preparation script verifies those hashes before processing. No third-party audio samples or recordings are bundled with this repository.

**Do not commit or distribute originals, processed effects, isolated SE stems, or diagnostic WAVs, and do not register the resulting soundtrack with Content ID or as a sound trademark.** Keep them in the ignored workspace. The effects are for incorporation into the completed audiovisual work, not redistribution as audio assets; recheck the provider’s current terms before publishing.

## 3. Render the adopted soundtrack and finish

```sh
node tools/demo/pv/effects.mjs
node tools/demo/pv/plan.mjs
node tools/demo/pv/audio.mjs
node tools/demo/pv/final.mjs
node tools/demo/pv/audio-qa.mjs
swift tools/demo/pv/boards.swift
# Seven UI groups at matching frames; requires the preserved v7-backup/final/
swift tools/demo/pv/compare.swift
# README GIFs: regenerate from the completed English-screen 16:9
ffmpeg -y -ss 7.6 -t 7.4 -i .art-work/pv/final/pv-en-16x9.mp4 -vf "fps=12,scale=720:-1:flags=neighbor,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" docs/images/town.gif
ffmpeg -y -ss 36.6 -t 7 -i .art-work/pv/final/pv-en-16x9.mp4 -vf "fps=12,scale=720:-1:flags=neighbor,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" docs/images/party.gif
```

`effects` preserves the approved crop/EQ/pitch/fade recipes and the seven anchors: **0.5, 19.5, 22, 25.5, 40, 41, and 42 seconds**. `audio` renders the B score with deterministic oscillators, applies the measured ducking/EQ, then one constant whole-program mastering gain. It does not use sampled drums, a limiter, or an existing recording of Beethoven.

`final` stream-copies the silent video and mastered AAC into:

```text
.art-work/pv/final/pv-ja-16x9.mp4
.art-work/pv/final/pv-en-16x9.mp4
.art-work/pv/final/pv-ja-1x1.mp4
.art-work/pv/final/pv-en-1x1.mp4
```

It checks duration, frame count, codec/streams, unchanged packets/PCM, loudness, effect synchronization, report-sign visibility, and the encoded tagline band on every frame from 43.6s through the end (absent before 1398, visible from 1398); it extracts **2,300 labeled frame samples from the completed sound videos**, including **1,980 samples every 0.1 seconds** across the entire 0–49.5s trailer (the `fix-fNNNN.png` files). This includes the entire opening, two-line reward caption, every frame-sampled transition after 31.5s, sword contacts, pixel-aligned logo wipe and tagline in all four variants. `audio-qa` independently compares planned/rendered notes and checks pitch, gaps, mono, DC, safety, and effect synchronization. Proofs stay under `.art-work/pv/`. To save disk space, duplicate sample labels are hardlinks; `final` independently extracts the completed MP4 frames, verifies their SHA-256 against the silent-source PNGs, then links the identical pixels rather than keeping a second copy. Do not edit QA PNGs in place.

Inspect the completed-video frames in `final/qa/` and the generated overview/0.1-second review sheets for all four variants, including the `qa-interiors-*` sheets (15.5–19.5s), `final/qa/comparison/` v7/current sheets (`town`, `church`, `inn`, `report`, `level`, `party`, `logo`, 32 same-time samples per variant, including frames 1397/1398), square framing, town transitions, 6–8s fountain clearance, the full dragon-to-five-person pullback, all four professions, reports, sword contacts and title wipe; listen to the final videos before publication. Numeric checks are not listening approval. Expected soundtrack loudness is approximately **−15.87 LUFS / −2.26 dBTP**; no animation/UI changes belong in these tools.

```sh
npm run typecheck
npm test
```

Do not commit videos or generated audio. The small README still lives in `docs/images/`, outside the app’s public assets and npm package.
