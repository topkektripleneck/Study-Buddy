# Study Buddy

Local-first desktop productivity app (Tauri 2 + React + TypeScript).

## Setup

```bash
npm install
npm run tauri dev
```

## Implemented

### Phase 1
- React + Vite + HashRouter (`/`, `/calendar`, `/hud`)
- Originkit UI kit in `src/ui/kit/`
- Tri-window shell

### Phase 2
- Rust `AppState` + file-based `StorageEngine` (atomic JSON writes)
- Typed commands for tasks, matrix, calendar, config, layout, metrics
- Data stored in `%APPDATA%/study-buddy/` (Windows)

### Phase 3
- `window-state` persistence, single-instance focus, system tray menu
- Monitor position validation on startup
- Lazy calendar + HUD window spawning

### Phase 4
- Rust timer actor (200ms ticks, anchor-based elapsed time)
- `timer_subscribe` Channel IPC + `timer:*` events
- Session checkpoint to `session.json`
- Live HUD readout (timer, streak, today %)

### UI (from wireframes)
- Top nav: **Widgets | Schedule / Calendar | Eisenhower Matrix**
- Widget library with `+` add flow
- Schedule view: tasks sidebar + timeline with current-time arrow
- Eisenhower 2×2 quadrant grid

## Scripts

- `npm run dev` — Vite frontend only
- `npm run tauri dev` — full desktop app
- `npm run tauri build` — production build
- `cargo test --manifest-path src-tauri/Cargo.toml` — Rust tests

Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
