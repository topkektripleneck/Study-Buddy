<div align="center">

# 🌌 Study Buddy

**A distraction-free, local-first desktop companion for deep work, intentional time-blocking, and cosmic focus.**

[![Tauri 2](https://img.shields.io/badge/Tauri-2.0-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
[![React 19](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-2021-DEA584?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Local-First](https://img.shields.io/badge/Privacy-100%25_Local--First-4caf50)](docs/ARCHITECTURE.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

*Offline-first · Zero telemetry · No cloud accounts required · All data stays on your disk*

</div>

---

## ✨ Overview

**Study Buddy** is an intentional, distraction-free productivity workstation built with **Tauri 2, Rust, and React 19**. It unifies a rock-solid Pomodoro/Stopwatch focus engine, an Eisenhower task priority matrix, drag-and-drop calendar time-blocking, grounding breathwork, and a customizable widget workspace.

Every state transition and timer tick is authoritative in Rust, and all persistence uses atomic local JSON writes with automated daily backups.

---

## 🚀 Key Highlights

### 🔒 100% Local-First & Zero Telemetry
- **Your data belongs to you**: No external servers, no background analytics, and no mandatory sign-ups.
- **Transparent disk storage**: All tasks, schedule blocks, journal entries, and streak metrics live in readable JSON files under your local app data folder.
- **One-click backup & restore**: Export complete zip snapshots anytime and restore with automatic pre-flight safety backups.

### 🌌 Cosmic Astrology & Illuminated Artwork
- **12 Dynamic Zodiac Themes**: Tailored color palettes, generative starfields, and multi-layered CSS nebulas for each astrological sign.
- **Illuminated Medieval Artwork**: Floating manuscript illustrations integrated into the widget environment that harmonize with your active sign.
- **Alternative Themes**: Enjoy sleek Cosmic **Galaxy** or retro CRT-inspired **8-Bit** terminal aesthetics with custom colorways.

### ⏱️ Rock-Solid Rust Timer Actor & HUD
- **Authoritative Rust Engine**: 200ms precision ticks driven by an isolated background thread immune to JavaScript UI throttling.
- **Sleep & Suspend Recovery**: Automatically detects system sleep or hibernation, excludes suspend gaps from elapsed focus time, and prompts to resume.
- **Interruption Restore**: If closed unexpectedly or restarted, your active session is safely restored on next launch.
- **Always-on-Top Floating HUD**: Minimalist floating HUD window to monitor remaining time over other full-screen apps.

### 📅 Calendar & Smart Time-Blocking
- **Interactive Timeline**: Day and week views with drag-and-drop block placement, bottom-edge resizing, and automatic collision columns.
- **Google Calendar Import**: Seamlessly import `.ics` calendar files.
- **Minimized Start/End Banners**: Smart notifications (Windows Action Center + floating in-app toast card) fire reliably even when Study Buddy is minimized.

### 🧩 Modular Drag-and-Drop Widget Suite
- **Focus Widget**: Quick-start protocols (Pomodoro, 50/10, Deep Work, Custom Stopwatch).
- **Task List**: Fast task entry with due dates, priority tags, inline editing, and drag reordering.
- **Eisenhower Matrix**: Categorize tasks across 4 urgency/importance quadrants with a 5-second undo safety rail before archiving.
- **Consistency Bar**: 28-day GitHub-style activity grid and daily focus goal progress tracker.
- **Mindful Grounding**:
  - **Breathe**: Guided Box, 4-7-8, and Energizing breathing cycles with animated visual pacing.
  - **Energy Tracker**: Daily energy levels logger to map productivity peaks.
  - **Reflective Journal**: Quick gratitude and progress reflections.
  - **Vent Box**: Ephemeral brain dump that gently dissolves when submitted.

### ⚡ Command Bar (`Ctrl+K` / `Cmd+K`)
- Rapid keyboard-driven workflows: Start/stop timers, navigate between tabs, create tasks, stage calendar blocks, toggle windows, and trigger backups without touching the mouse.

### 🖥️ Native System Startup
- Toggle **Run on Startup** directly from Settings to have Study Buddy launch automatically on boot via native OS registry integration.

---

## 🪟 Tri-Window Architecture

Study Buddy leverages Tauri's multi-webview capabilities to provide a synchronized, lightweight multi-window experience:

| Window | Route | Purpose |
| :--- | :--- | :--- |
| **Main Workspace** | `index.html#/` | Primary workspace containing Widgets, Schedule, Matrix, and Settings. |
| **Calendar Window** | `index.html#/calendar` | Detached secondary window dedicated to schedule timeline review. |
| **HUD** | `index.html#/hud` | Compact, borderless, always-on-top timer HUD for unobtrusive monitoring. |
| **Toast Popup** | `index.html#/toast` | Borderless notification banner for alerts when the workspace is minimized. |

---

## 🛠️ Getting Started

### Prerequisites
- **Node.js**: `v18+` (or `v20+`)
- **Rust**: Latest stable toolchain ([rustup.rs](https://rustup.rs))
- **Build Tools**: Visual Studio C++ Build Tools (on Windows) or build-essential (on Linux)

### Installation & Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/topkektripleneck/Study-Buddy.git
   cd Study-Buddy
   ```

2. **Install frontend dependencies:**
   ```bash
   npm install
   ```

3. **Launch in development mode:**
   ```bash
   npm run tauri dev
   ```
   *This starts the Vite dev server and launches the native desktop window with live hot-reloading.*

---

## 📦 Building for Production

To compile the standalone desktop application and Windows installer:

```bash
npm run tauri build
```

The compiled binaries will be output to:
- **Executable**: `src-tauri/target/release/buddyup.exe`
- **Installer**: `src-tauri/target/release/bundle/nsis/`

---

## 🧪 Testing & Code Quality

Run frontend unit tests:
```bash
npm test
```

Run Rust backend unit tests:
```bash
cd src-tauri
cargo test
```

Run Rust clippy checks:
```bash
cd src-tauri
cargo clippy -- -D warnings
```

---

## ⌨️ Command Bar Quick Reference (`Ctrl+K`)

| Action | Syntax / Command |
| :--- | :--- |
| **Focus Protocols** | `focus`, `pomodoro`, `short break`, `long break`, `stopwatch` |
| **Timer Actions** | `pause`, `resume`, `reset`, `skip` |
| **Navigation** | `widgets`, `schedule`, `matrix`, `settings` |
| **Time Blocks** | `block <title> <HH:MM> [duration]` |
| **Windows** | `hud`, `calendar` |
| **Data & Backups** | `backup export`, `backup restore`, `data folder` |

---

## 🏛️ Philosophy & Architecture

This project follows the **[Ponytail](https://github.com/dietrichgebert/ponytail)** philosophy:
- **YAGNI**: Write only what the task needs; the best code is the code you never wrote.
- **Local-first, zero telemetry**: All state is owned by Rust and saved directly to disk.
- **Strict separation**: Webviews emit user intent; Rust guarantees state correctness and persistence.

For deep technical specifications, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 📄 License

Distributed under the **MIT License**.
