<p align="center">
  <img src="Vermeil/src-tauri/icons/128x128.png" alt="Vermeil" width="80" />
</p>

<h1 align="center">Vermeil</h1>

<p align="center">
  <strong>A tactile, privacy-focused Minecraft: Java Edition launcher for Windows and Linux.</strong><br/>
  Microsoft sign-in, major mod loaders, modpack imports, 3D Character Studio, Google Drive settings sync, and zero telemetry.
</p>

<p align="center">
  <a href="https://github.com/Davekb1976/Vermeil-Launcher/releases/latest"><img src="https://img.shields.io/github/v/release/Davekb1976/Vermeil-Launcher?style=flat-square&label=release&color=8b5cf6&labelColor=181622" alt="Release" /></a>
  <a href="https://github.com/Davekb1976/Vermeil-Launcher/releases"><img src="https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Davekb1976/Vermeil-Launcher/badges/download-count.json&style=flat-square&color=8b5cf6&labelColor=181622" alt="Downloads" /></a>
  <img src="https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Davekb1976/Vermeil-Launcher/badges/lines-of-code.json&style=flat-square&color=8b5cf6&labelColor=181622" alt="Lines of Code" />
  <a href="https://github.com/Davekb1976/Vermeil-Launcher/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Davekb1976/Vermeil-Launcher/ci.yml?branch=main&style=flat-square&label=ci%20checks&color=10b981&labelColor=181622" alt="CI Checks" /></a>
  <a href="https://github.com/Davekb1976/Vermeil-Launcher/actions"><img src="https://img.shields.io/github/actions/workflow/status/Davekb1976/Vermeil-Launcher/release.yml?style=flat-square&label=build&color=10b981&labelColor=181622" alt="Build" /></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20Linux-2c2738?style=flat-square&labelColor=181622" alt="Platform" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2c2738?style=flat-square&labelColor=181622" alt="License" /></a>
  <img src="https://img.shields.io/badge/status-stable-8b5cf6?style=flat-square&labelColor=181622" alt="Status" />
</p>

<p align="center">
  <a href="https://vermeillauncher.app/">Website</a> · <a href="https://github.com/Davekb1976/Vermeil-Launcher/releases/latest">Download</a> · <a href="PRIVACY.md">Privacy</a> · <a href="TERMS.md">Terms</a> · <a href="https://github.com/Davekb1976/Vermeil-Launcher/issues">Issues</a>
</p>

---

> **Vermeil 1.x.** General availability stable release of Vermeil Launcher.
>
> **AI-generated codebase.** Built with AI assistance (Claude, Gemini, and GPT models). May contain bugs or incomplete features. See [DISCLAIMER.md](DISCLAIMER.md).
>
> **Not code-signed.** Some antivirus software may flag the installer. No funds for a signing certificate — use as-is or build from source.

## Table of Contents

- [Screenshots](#screenshots)
- [Features](#features)
- [Download](#download)
- [Development](#development)
- [Privacy](#privacy)
- [AI Disclosure](#ai-disclosure)
- [License](#license)

## Screenshots

> Animated previews from **Vermeil v1.3.0**.

<p align="center">
  <img src="docs/images/screenshots/home.gif" alt="Vermeil Home Screen" width="100%" />
</p>
<p align="center">
  <em>Operator Hub with interactive 3D character stage (roam & look-around physics), lifetime player telemetry, Minecraft Java news reader, and Quick Play world resumption</em>
</p>

<p align="center">
  <img src="docs/images/screenshots/library.gif" alt="Vermeil Instance Library" width="49%" />
  <img src="docs/images/screenshots/skin.gif" alt="Vermeil 3D Character Studio" width="49%" />
</p>
<p align="center">
  <em>Dual-shelf Instance Library (Pinned shelf, category filters, batch delete) and the 3D Character Studio (unlocked for Microsoft & offline accounts with 2-tone CAD mannequin dummy skins, Crafty.gg sync, and custom cape editor)</em>
</p>

<p align="center">
  <img src="docs/images/screenshots/settings.gif" alt="Vermeil Settings Screen" width="49%" />
  <img src="docs/images/screenshots/accounts.gif" alt="Vermeil Account Management" width="49%" />
</p>
<p align="center">
  <em>Tactile Settings (Dual-Channel Release Control & Client GC calibration) alongside Account Management (Google Drive Settings Sync & DPAPI/AES-256-GCM encrypted profiles)</em>
</p>

<p align="center">
  <a href="docs/SCREENSHOTS.md"><strong>Explore the full 8-screen animated gallery and walkthrough &rarr;</strong></a>
</p>

## Features

- **Microsoft & Offline Accounts**: Multi-account OAuth 2.0 PKCE authentication and local offline profiles encrypted on-device (Windows DPAPI / Linux Secret Service + AES-256-GCM)
- **Dual-Shelf Instance Library**: Isolated instance sandboxes, Pinned quick-launch shelf, live category filters (`All`, `Modded`, `Vanilla`, `Pinned`), floating dock carousel, and parallel batch deletion
- **All Major Mod Loaders**: Fabric, Quilt, NeoForge, and Forge with automatic version resolution and scratch-isolated installers
- **Mod, Resource Pack, Shader & Datapack Browser**: Unified Modrinth and CurseForge search with inline version picker, bulk install mode, and automatic dependency resolution
- **Modpack Browser & Archive Import**: 1-click Modrinth and CurseForge modpack installs plus local `.mrpack` and `.zip` archive imports
- **Instant Instance Sharing (Cloud & Offline)**: Share modpack setups and customized instances in 1 click using 8-character 3-minute ephemeral cloud codes (`VML-XXXX-XXXX`) or serverless offline codes (`VML...`). 100% anonymized metadata—no personal accounts, credentials, or save files
- **Automatic Java Provisioning**: Detects local JDKs and automatically provisions required Adoptium runtimes (Java 8, 17, 21, 25) with atomic staging
- **Adaptive Memory & Client GC Calibration**: Tiered system RAM ceilings and version-aware JVM Garbage Collection presets (G1GC, Generational ZGC, Shenandoah)
- **3D Character Studio & Local Wardrobe**: Unlocked for both Microsoft and offline/guest accounts with pre-baked 2-tone CAD mannequin dummy skins (`Classic` & `Slim`), animated elytra preview, and on-demand Crafty.gg skin history sync
- **In-Game Custom Cape Editor & Companion Mod**: Design static or animated custom capes in-app and render them in-game via Vermeil's Fabric/Forge companion mod
- **Dual-Channel Auto-Updater**: Switch seamlessly between **Stable** and **Experimental** release channels with Fastly CDN manifest checks and safe version rollback
- **Google Cloud Settings Sync**: Zero-telemetry cross-device backup and restore of portable preferences (`drive.appdata` sandbox) with single-use loopback OAuth and CSRF state verification
- **Global Video & Audio Synchronization**: Apply FPS, VSync, FOV, GUI Scale, FOV Effects, and sound levels across instances before launch
- **Storage & Shared Engine Cleanup**: Inspect and purge download caches or unreferenced shared Minecraft engine assets, with real-time Windows Installed Apps footprint reporting
- **Zero Telemetry**: No analytics, no tracking, and no intermediate servers

## Download

Get the latest release from the [Releases page](https://github.com/Davekb1976/Vermeil-Launcher/releases/latest).

### Windows

Download and run the `.exe` installer. Per-user install, no admin required. Uninstall from Settings > Apps.

### Linux (one-liner)

```bash
curl -fsSL https://raw.githubusercontent.com/Davekb1976/Vermeil-Launcher/main/install.sh | bash
```

Downloads the AppImage to `~/.local/bin` and creates a desktop entry. Remove with `vermeil-uninstall`.

## Development

Built with [Tauri 2](https://tauri.app/) (Rust) and [SolidJS](https://www.solidjs.com/) (TypeScript).

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for setup instructions and build commands.

## Privacy & Terms

- **Privacy Policy:** No data is collected or sent anywhere. Local-first storage with sandboxed Google Drive settings backup. See [PRIVACY.md](PRIVACY.md).
- **Terms of Service:** Open-source MIT guidelines, acceptable use, and third-party integration policies. See [TERMS.md](TERMS.md).

## AI Disclosure

This project was built entirely with AI assistance. The author directed architecture and feature choices; AI generated the code.

**Models:**

- Claude Opus 5 / Claude Sonnet 5 — primary code generation and architecture
- Gemini 3.8 Flash / Claude Opus 4.6 (Thinking) — ongoing development, agentic workflows, and architecture
- GPT 5.6 (Terra / Luna) — miscellaneous tasks
- Earlier development used Claude Opus 4.6–4.8 and Sonnet 4.6

**IDEs & Platforms:** Kiro, Antigravity 2.0

See [DISCLAIMER.md](DISCLAIMER.md) for the full disclosure.

## License

Source code: [MIT License](LICENSE). Logo and icons: All Rights Reserved. See [LICENSES.md](LICENSES.md).

This repository is public for transparency. External contributions are not accepted. Bug reports and feature suggestions via [Issues](https://github.com/Davekb1976/Vermeil-Launcher/issues) are welcome.
