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

> Animated previews from the official **v1.0.0** release.

<p align="center">
  <img src="docs/images/screenshots/home.gif" alt="Vermeil Home Screen" width="100%" />
</p>
<p align="center">
  <em>Interactive 3D character stage, telemetry stats, Minecraft news, and recent worlds continue station</em>
</p>

<p align="center">
  <img src="docs/images/screenshots/library.gif" alt="Vermeil Instance Library" width="49%" />
  <img src="docs/images/screenshots/skin.gif" alt="Vermeil 3D Character Studio" width="49%" />
</p>
<p align="center">
  <em>Tactile instance management with floating dock, and the 3D Character Studio with skin history sync</em>
</p>

<p align="center">
  <img src="docs/images/screenshots/settings.gif" alt="Vermeil Settings Screen" width="49%" />
  <img src="docs/images/screenshots/accounts.gif" alt="Vermeil Account Management" width="49%" />
</p>
<p align="center">
  <em>Tactile launcher preferences, storage management, and encrypted local account profiles</em>
</p>

<p align="center">
  <a href="docs/SCREENSHOTS.md"><strong>Explore the full animated gallery and screen details &rarr;</strong></a>
</p>

## Features

- Microsoft account authentication (multiple accounts + offline)
- Instance management with per-instance settings
- Mod loader support: Fabric, Quilt, NeoForge, Forge
- Mod browsing and installation from Modrinth and CurseForge — click any result card to open its details and pick a specific version, or hit Install to get the newest compatible one
- Modpack import (.mrpack and CurseForge zip)
- Automatic Java detection and download (Adoptium)
- Adaptive RAM allocation per instance
- Discord Rich Presence
- 3D skin viewer with upload, cape, and elytra support
- Skin Wardrobe with on-demand historical skin synchronization from Crafty.gg
- Companion mod for in-game custom capes
- Auto-updater (Windows and Linux AppImage)
- Global video settings & live Minecraft options synchronization (FPS, VSync, FOV, GUI Scale, FOV Effects)
- Google Cloud Settings Sync (cross-device preference backup and restore to Google Drive's sandboxed app storage with zero telemetry)
- Real-time uninstaller storage footprint synchronization (Windows Installed Apps disk usage reporting)
- Download history
- Zero telemetry

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
