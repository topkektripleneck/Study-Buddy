# Study Buddy — agent instructions

This project follows [Ponytail](https://github.com/dietrichgebert/ponytail) philosophy: write only what the task needs; the best code is the code you never wrote.

## Decision ladder

1. YAGNI — skip it if it isn't needed
2. Reuse what exists in this repo (see map below)
3. Stdlib / Tauri / React built-ins
4. Already-installed dependencies
5. One line if possible
6. Minimum working implementation

Understand the problem and trace the flow before picking a rung.

## Reuse before adding

| Concern | Where |
| --- | --- |
| Domain actions (tasks, blocks, timer, HUD) | `src/lib/actions.ts` |
| Command bar grammar | `src/lib/commands.ts` |
| Schedule overlap, time parsing, layout | `src/lib/schedule.ts` |
| Timer state | `src-tauri/src/timer.rs`, `src/hooks/useTimer.ts` |
| File persistence | `src-tauri/src/storage.rs` |
| Metrics from activity log | `src-tauri/src/metrics.rs` |
| Multi-window IPC | Tauri `emit` / `listen`, `*:changed` events |

Do not introduce parallel paths (e.g. a second command UI, duplicate schedule logic, a JS timer).

## Product constraints

- **Local-first, zero telemetry** — all data stays on disk under the app data dir
- **Tauri 2 tri-window** — `main`, `calendar`, `hud`
- **Spec reference** — `docs/ARCHITECTURE.md` (check implemented vs planned before assuming APIs exist)

## When building features

- Prefer extending the command bar and shared actions over new modals or settings screens
- Prefer Rust commands + JSON files over new frontend state libraries
- Match existing UI patterns in `src/ui/kit/` and inline styles already in the codebase
- Fix shared helpers once rather than patching each caller

## Not lazy about

Input validation, error handling that prevents data loss, security, accessibility, timer/storage correctness, and anything explicitly requested.

Mark intentional simplifications with a `ponytail:` comment naming the limit and how to upgrade later.
