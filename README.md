# Study Buddy

Local-first desktop productivity app (Tauri 2 + React 19 + TypeScript).

## Setup

```bash
npm install
npm run tauri dev
```

## Features

### Core
- Hash router: `/`, `/calendar`, `/hud`, `/toast`
- Tri-window shell (main, calendar, HUD) + toast popup
- Rust `StorageEngine` with atomic JSON writes, backup restore on parse failure, and schema migration hook
- Command bar (`Ctrl+K`) for timer, navigation, blocks, settings, export/import backup, and data reset

### Timer & focus
- Rust timer actor (200 ms ticks, anchor-based elapsed time)
- Suspend/sleep gaps excluded; auto-pause after wake with resume prompt
- **Session restore** on launch when `session.json` has an interrupted session
- HUD readout; `session.json` checkpoint on quit

### Widgets
- Focus, tasks (priority, due date, drag reorder, inline rename), Eisenhower matrix, breathing (box / 4-7-8 / energy), energy, journal, vent
- Widget drag-and-drop reorder; consistency bar + daily target ring

### Eisenhower matrix
- Drag between quadrants; **5s undo** before archiving dropped-on-eliminate tasks
- Schedule quadrant: due date + calendar staging
- Delegate / eliminate: inline notes on cards

### Calendar
- Day / week views; click-to-add and click-to-edit blocks
- Drag to move, drag bottom edge to resize, side-by-side overlap columns
- Matrix → calendar staging rail

### Themes & settings
- Galaxy, 8-bit palettes, and astrology with per-sign zodiac backdrop
- Sidebar settings: themes, zodiac, quiet hours, notifications, pomodoro, **export / restore backup zip**

### Notifications
- Timer phase and schedule block alerts
- **Streak at risk** (after 6 pm) and **daily target reached** nudges
- In-app toasts + OS notifications; respects quiet hours

## Scripts

- `npm run dev` — Vite frontend only
- `npm run tauri dev` — full desktop app
- `npm run tauri build` — production build
- `npm test` — Vitest unit tests
- `cargo test --manifest-path src-tauri/Cargo.toml` — Rust tests

Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
