# Vermeil — Project Summary

## What Is This

Vermeil is a custom Minecraft: Java Edition launcher built with **Rust (Tauri 2)** backend and **SolidJS + TypeScript** frontend. It's a desktop app for Windows and Linux that manages Minecraft instances, mods, accounts, and game launches.

**Repository:** https://github.com/Davekb1976/Vermeil-Launcher
**Website:** https://vermeillauncher.app/
**Author:** Vermeil-Launcher
**License:** MIT
**Current Version:** 1.3.0
**Status:** General Availability Release (1.3.0 GA)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Rust, Tauri 2 |
| Frontend | SolidJS, TypeScript, Vite |
| Styling | Modular CSS in `src/styles/` (base, components, layout, screens, modals, dock, logs, notifications) — dark theme, custom design system |
| Package manager | pnpm |
| Build system | Tauri CLI + Vite |
| CI/CD | GitHub Actions (Windows + Linux matrix) |
| Installer | NSIS (Windows), .AppImage (Linux) |
| Auto-updater | Tauri updater plugin (Windows NSIS + Linux AppImage) |

---

## Project Structure

```
Vermeil-Launcher/               # Repo root
├── .agents/                    # Antigravity 2.0 agent skills
│   └── skills/                 # add-screen, add-mod-loader, release-process, etc.
├── .github/workflows/          # CI/CD (release.yml)
├── .kiro/                      # Kiro AI IDE configuration & steering
│   ├── skills/                 # Kiro agent skills
│   └── steering/               # Coding standards, implementation process, etc.
├── Vermeil/                  # The actual app
│   ├── src/                    # SolidJS frontend
│   │   ├── components/         # Reusable UI (FloatingDock, Titlebar, Icons, Dropdown, etc.)
│   │   ├── screens/            # Full-page views (Home, Library, Settings, Skins, etc.)
│   │   ├── modals/             # Modal dialogs (CreateCustom, BrowseModpacks, etc.)
│   │   ├── ipc/commands.ts     # ALL Tauri invoke wrappers (single source of truth)
│   │   ├── services/           # Frontend-only logic (updater)
│   │   ├── styles/             # Modular CSS (base, components, layout, screens, modals, dock, logs, notifications)
│   │   ├── App.tsx             # Root component, global state, routing
│   │   └── index.tsx           # Entry point
│   ├── src-tauri/              # Rust backend
│   │   ├── src/
│   │   │   ├── commands/       # Tauri command handlers (thin layer)
│   │   │   ├── services/       # Business logic (launch, auth, mods, etc.)
│   │   │   ├── models/         # Data structures (Instance, Settings, etc.)
│   │   │   ├── util/           # Helpers (paths, http, credentials, platform)
│   │   │   ├── lib.rs          # Plugin/command registration
│   │   │   └── main.rs         # Entry point
│   │   ├── Cargo.toml          # Rust dependencies
│   │   ├── tauri.conf.json     # Tauri config (window, bundle, updater)
│   │   └── icons/              # App icons (all sizes)
│   ├── public/                 # Static assets (logo)
│   └── package.json            # Frontend deps + scripts
├── docs/                       # Documentation
├── CHANGELOG.md                # Current release notes only
└── README.md                   # Public-facing readme
```

---

## Features Implemented

*Representative feature set as of v0.5.9 — not an exhaustive per-release log. See git history for full detail.*

### Core Launcher
- Microsoft account authentication (Xbox SISU/XSTS flow)
- Multiple account support (switch between accounts)
- Offline account support
- Instance creation (custom version + loader selection)
- Instance launching with full JVM argument construction
- Automatic Java detection and download (Adoptium Temurin)
- Java version matrix: Java 8, 17, 21, 25 (auto-selected per MC version)
- Game log capture and real-time display
- Crash report detection and display
- Local session metrics & playtime tracking (100% on-device, zero remote telemetry)
- 3D interactive character stage with ambient animation on Home screen
- Discord Rich Presence (shows what you're playing)
- Auto-updater (Windows NSIS, Linux AppImage)
- System tray with minimize-to-tray on game launch
- Real-time Windows uninstaller storage synchronization (`EstimatedSize` DWORD) reflecting true disk usage across instances, assets, cache, and Java runtimes

### Mod Loaders
- Fabric (all versions including Legacy Fabric)
- Quilt
- NeoForge (with installer processor support)
- Forge (with installer processor support)
- Parallel library downloads with progress streaming

### Mod Management
- Modrinth API integration (search, install, dependencies)
- CurseForge API integration (search, install, dependencies)
- Toggle between Modrinth/CurseForge in Browse tab
- Content types: mods, resource packs, shaders, datapacks
- Automatic dependency resolution
- Mod update checking and one-click updates
- Bulk select and install
- Enable/disable mods without deleting

### Modpack Support
- Browse modpacks modal with pagination, sort, loader filter
- Modrinth .mrpack import
- CurseForge zip import (manifest.json parsing)

### Instance Management
- Compact horizontal card layout with loader-colored icons
- Per-instance settings (memory, resolution, fullscreen, Java args)
- Custom instance icons (data URL cached)
- Instance cloning
- Multi-select with drag-select for bulk delete
- Rename on double-click
- Sidebar pins (up to 3 quick-launch shortcuts)

### Instance Sharing & Cloud Blueprints
- **Ephemeral 3-Minute Cloud Share Codes (`VML-XXXX-XXXX`)**: 1-click instance export generating an 8-character human-friendly alphanumeric code. Stored with a strict 3-minute self-expiring TTL on Cloudflare Workers and D1 edge storage.
- **Serverless Offline Blueprints (`VML...`)**: Self-contained Zlib-compressed Base62 share codes that encode the entire instance manifest without requiring any cloud storage or database.
- **Privacy & Anonymization Boundary**: Share codes exclusively serialize public mod identifiers (`(platform, project_id, version_id)` pairs, loader, and Minecraft version). Never transmits personal accounts, Microsoft tokens, UUIDs, gamertags, server IPs, world saves, or local file system paths.
- **Edge Architecture & Deduplication**: Backed by a serverless Cloudflare Worker with D1 SQL persistence, SHA-256 payload deduplication (identical exports yield the existing code with zero extra DB writes), Edge Cache API (`caches.default`) for instantaneous lookups, and decompressed payload size caps (64 KB ceiling) with built-in Adler32 verification.
- **Single-Slot State-Morphing UI**: Streamlined import interface featuring a morphing trailing action button (Paste clipboard ↔ Clear input) and single progressive scan/import CTA button.

### Skin Management & 3D Character Studio
- 3D skin viewer (`skinview3d` / `three.js`) unlocked for both Microsoft and Offline / Guest accounts
- Pre-baked 2-tone CAD mannequin dummy skins (`Classic` 4px and `Slim` 3px) synced between the Character Studio and Home 3D stage for offline accounts
- Skin upload to Mojang (Microsoft accounts) and local previewing (Offline & Microsoft accounts)
- Variant switch (Classic/Slim) and animated Elytra toggle
- Cape equip/unequip and custom local in-game cape designer (`CustomCapeEditor`) rendered via the Vermeil companion mod
- Local skin library (Wardrobe) with automatic capture, local caching, and Crafty.gg historical skin synchronization

### Accounts & Cloud Sync
- Multi-account management for Microsoft (Xbox SISU/XSTS OAuth 2.0 PKCE) and local Offline profiles
- Google Cloud Settings Sync (on the Accounts screen): cross-device synchronization of General, Display, Sound, and Keybind preferences via Google Drive's isolated `appDataFolder` with single-use local loopback OAuth gate, CSRF `state` verification, zero telemetry, and separate Sign Out vs. Disconnect (Revoke) actions

### Settings & Release Control
- 6 dedicated tabs: *All*, *General*, *Resources*, *Instance Defaults*, *Keybinds*, and *About*
- Dual-Channel Auto-Updater in *About Vermeil*: live switching between **Stable** and **Experimental** release channels with Fastly CDN manifest checks and safe version rollback
- Adaptive Memory calibration and Client GC preset selection (G1GC, Generational ZGC, Shenandoah)
- Global Instance tab with live video & audio settings synchronization into instance `options.txt`
- Java runtime management (detect, auto-provision Adoptium JDK 8/17/21/25 with single-flight locking and atomic staging)
- Storage management: download cache purge, unreferenced shared Minecraft engine asset cleanup, and $O(1)$ NSIS installer `EstimatedSize` preservation

### Security
- DPAPI credential encryption on Windows and Secret Service / AES-256-GCM (`0600`) on Linux
- Single-use local loopback OAuth gate (`/start?nonce=...` with `TCP RST` connection refusal on back-navigation) and cryptographic `state` CSRF validation (`RFC 8252 §8.9`)
- Google Drive sandbox isolation (`drive.appdata` scope prevents access to personal Drive files)

### UI/UX
- Tactile SloppyKeys design language: chunky keycap bevel buttons (`--bevel`, `--bevel-strong`), framed category sections, sunken tracks (`#0f0e13`), native system font stacks
- Custom tactile tooltips (`data-tip`) with zero border radius and purple left accent edge (no native OS tooltips)
- Auto-hiding floating dock with bottom-centered trigger zone and animated keycap press physics
- Multi-position pagination dock (bottom, left, right) with global mouse wheel scroll mode keybind (default: Z)
- Dynamic real-time download speed limiter in Settings with live token-bucket throughput throttling
- Custom dark theme with accent colors and sharp corners
- Frameless window with custom titlebar
- Custom styled dropdowns with strict popover anchoring invariants
- Single-point modal footer dismissal (no redundant top-right close buttons)
- Toast notification system and install progress popup with real-time streaming
- Onboarding wizard for first-run with dynamic version resolution and flexbox labeled divider styling
- News feed from Mojang launcher content API

### Download History
- Persisted to disk (survives app restarts)
- Capped at 200 entries
- Shows icon, loader, game version, category

### Cross-Platform
- Windows: NSIS installer with $O(1)$ update `EstimatedSize` preservation and atomic bulk uninstaller, auto-update
- Linux: .AppImage (auto-update)
- Platform-aware: Java exe names, classpath separators, Adoptium URLs, natives, OS rules
- Centralized platform helpers (util/platform.rs)

---

## Release History

| Version | Highlights |
|---------|-----------|
| 0.1.0 | Initial release — basic launcher, Fabric support |
| 0.1.1 | Sidebar pins, custom icons, download history |
| 0.1.2 | Forge/NeoForge install progress, escape key, cache purge |
| 0.1.3 | Modpack browser improvements (pagination, filters) |
| 0.1.4 | Skin changer rate limit fix, modpack browser polish |
| 0.1.5 | CurseForge integration (search, install, dependencies) |
| 0.1.6 | Instance card redesign, fullscreen fix, skin viewer elytra, new icon |
| 0.1.7 | Global video settings (FPS, VSync, FOV, GUI Scale, View Bobbing) |
| 0.1.8 | DPAPI credential encryption, download history persistence |
| 0.1.9 | Linux support (platform helpers, cross-platform code) |
| 0.2.0 | Custom dropdowns, slider fix, fullscreen sync, Ubuntu 24.04 build |
| 0.2.1 | FOV Effects slider, pin modal upgrade, Linux install script |
| 0.2.2 | Linux window resize, skin library auto-capture |
| 0.2.3 – 0.5.9 | Ongoing fixes and features (custom capes, Discord RPC, video settings) |
| 0.6.0 – 0.8.5 | CurseForge parity, modpack downloads, content browser overhaul |
| 1.0.0 | Milestone release: SloppyKeys tactile UI, 3D Character Studio, Crafty.gg skin sync, auto-hide dock, pagination island, download rate limiter |
| 1.1.0 – 1.2.1 | Google Cloud Settings Sync (`drive.appdata`), Client GC calibration, persistent lifetime telemetry, high-speed atomic NSIS uninstaller |
| 1.3.0 | Dual-channel updater (Stable & Experimental), Library dual-shelf hierarchy & batch delete, unlocked Offline 3D Character Studio with 2-tone CAD mannequin dummy skins, single-use OAuth loopback gate, $O(1)$ NSIS update preservation & shared engine cleanup |

---

## Key Architecture Decisions

1. **Single IPC file** — All Tauri invoke wrappers live in `src/ipc/commands.ts`. Components never call `invoke()` directly.
2. **Thin commands, heavy services** — `commands/*.rs` validate and delegate. `services/*.rs` do the work.
3. **Shared HTTP client** — One `reqwest::Client` in `util/http.rs`, never create new ones.
4. **Platform module** — `util/platform.rs` centralizes all OS detection (exe names, paths, URLs, separators).
5. **Credential encryption** — DPAPI on Windows, plaintext with file permissions on Linux.
6. **options.txt patching** — Global video settings written to each instance's options.txt before launch.
7. **Zero-warning builds** — Never suppress warnings. Fix or remove unused code.
8. **Ephemeral zero-login sharing** — Instances are shared via lightweight metadata blueprints using 3-minute ephemeral D1 records or self-contained Base62 zlib strings, eliminating user registration, telemetry, or server-side persistent profiles.

---

## Development Setup

See [DEVELOPMENT.md](DEVELOPMENT.md) for full prerequisites and build instructions.

---

## Important Files to Know

| File | Purpose |
|------|---------|
| `Vermeil/src/App.tsx` | Global state, screen routing, download tracking |
| `Vermeil/src/ipc/commands.ts` | ALL backend communication |
| `Vermeil/src-tauri/src/lib.rs` | Command registration, plugin setup |
| `Vermeil/src-tauri/src/services/share_code.rs` | Instance blueprint compression, resolution, and edge relay |
| `Vermeil/src-tauri/src/services/launch.rs` | Game launching (biggest file) |
| `Vermeil/src-tauri/src/services/auth.rs` | Microsoft/Xbox/Minecraft auth |
| `Vermeil/src-tauri/src/util/platform.rs` | Cross-platform helpers |
| `Vermeil/src-tauri/src/util/credentials.rs` | DPAPI encryption |
| `Vermeil/src-tauri/src/models/instance.rs` | Instance data model |
| `Vermeil/src-tauri/src/models/settings.rs` | Launcher settings + video settings |
| `.github/workflows/release.yml` | CI/CD pipeline |

---

## Git Conventions

- **Branch:** `main` only
- **Commits:** `release: X.Y.Z` for full releases, `release: X.Y.Z (experimental build N)` for experimental pre-releases, `feat:` / `fix:` / `chore:` / `docs:` for everything else
- **Tags:** `vX.Y.Z` for full releases, `vX.Y.Z-experimental-N` for experimental pre-releases (triggers CI)
- **Version cadence:** 0.X.0 through 0.X.9, then roll to 0.(X+1).0 (single-digit patches only)
- **Never** commit without explicit approval for releases
