# Vermeil — Animated Gallery & UI Walkthrough (v1.3.0)

This gallery showcases the tactile SloppyKeys UI language, 3D WebGL character physics, dual-shelf library hierarchy, and core workflows in **Vermeil v1.3.0**.

---

## 1. Home Screen & Operator Hub

The primary command center for your Minecraft sessions. Combines an interactive 3D WebGL character stage, lifetime player telemetry, official Minecraft Java news, and instant Quick Play world resumption.

![Vermeil Home Screen](images/screenshots/home.gif)

### Key Features Shown:
- **Interactive 3D Character Stage**: WebGL player model with continuous ambient roam & look-around animation cycles. Automatically renders your active Mojang skin, local preview skin, or the 2-tone CAD mannequin dummy skin for offline profiles.
- **Tactical Telemetry Base Plate**: Instant readout of active account status (Microsoft vs. Offline), total instance count, cumulative lifetime playtime across all instances, and relative last-played timestamp.
- **Continue Where You Left Off**: Hero card featuring your most recently played singleplayer world with direct 1-click **Play** resumption (Minecraft 1.20+ Quick Play support) and a 2×2 sub-grid for recent worlds.
- **Minecraft News Station**: Live Java Edition release notes and news articles with categorized tactile badges (`Release`, `Snapshot`, `Pre-Release`, `RC`) and an in-app article reader modal.

---

## 2. Instance Library (Dual-Shelf Hierarchy)

Organize, filter, and launch your isolated Minecraft instances with chunky mechanical keycap controls and high-concurrency batch management.

![Instance Library](images/screenshots/library.gif)

### Key Features Shown:
- **Dual-Shelf Layout**: Separates **Pinned Instances** (top quick-access shelf synced with the sidebar and `Ctrl+P` dock carousel) from your main **All Instances** collection.
- **Live Category Filtering & Search**: Instant filtering by **All**, **Modded**, **Vanilla**, and **Pinned**, paired with fuzzy search and sort controls.
- **Batch Selection & Parallel Deletion**: Multi-select mode for removing multiple instances concurrently with single-pass settings cleanup and automatic Windows storage footprint recalculation.
- **Tactile Instance Cards**: 3D beveled cards with 3px accent borders, styled loader pills (`Fabric`, `Quilt`, `NeoForge`, `Forge`, `Vanilla`), minimalist icon-only pin keycaps, and direct Play triggers.

---

## 3. Create & Import Instance Wizard

Provision custom modded or vanilla instances, browse curated modpacks, or import local archive packages in seconds.

![Create Instance Wizard](images/screenshots/create-instance.gif)

### Key Features Shown:
- **Three Creation Pathways**: Switch between **Custom Instance**, **Browse Modpacks** (Modrinth & CurseForge), or **Import Archive** (`.mrpack` and CurseForge `.zip`).
- **Loader Radio Cards**: Tactile single-select cards for Vanilla, Fabric, Quilt, NeoForge, and Forge with live loader version selectors and Vermeil Companion Mod compatibility indicators.
- **Automatic Runtime & Memory Calibration**: Auto-selects the required Adoptium Java runtime (8, 17, 21, 25) and adaptive system RAM allocation.

---

## 4. 3D Character Studio & Local Skin Wardrobe

A local-first 3D WebGL character showcase, skin wardrobe, and custom cape studio — fully unlocked for both **Microsoft** and **Offline / Guest** accounts.

![3D Character Studio & Wardrobe](images/screenshots/skin.gif)

### Key Features Shown:
- **Unlocked Offline & Guest Studio**: Features a non-intrusive **Offline Preview Banner** with 1-click Microsoft sign-in and account switching, plus pre-baked **2-Tone CAD Mannequin Dummy Skins** (`Classic` 4px and `Slim` 3px) when no skin is equipped.
- **3D WebGL Orbital Stage**: Full 360° camera control, depth-layered voxel ember particle stage, Zen showcase mode, and animated elytra wing breath preview.
- **Local Skin Wardrobe & Crafty.gg Sync**: Import local `.png` skins for immediate 3D previewing or equip them to Mojang, plus 1-click historical skin synchronization from **Crafty.gg**.
- **In-Game Custom Cape Designer**: Create, crop, and animate custom capes in-app (`CustomCapeEditor`) and render them directly inside Minecraft via Vermeil's companion mod.

---

## 5. Mod, Resource Pack, Shader & Datapack Browser

Discover, filter, and install content from both **Modrinth** and **CurseForge** inside a unified instance workspace.

![Instance Content & Mod Browser](images/screenshots/browse-mods.gif)

### Key Features Shown:
- **Unified Multi-Source Browser**: Switch seamlessly between **Modrinth** and **CurseForge** across *Mods*, *Resource Packs*, *Shaders*, and *Datapacks*.
- **Inline Version Picker & Dependency Engine**: Click any project card to inspect changelogs and select specific versions/channels, or click **Install** for automatic compatible version and dependency resolution.
- **Bulk Selection & Update Tracking**: Batch-install or batch-remove multiple mods at once and check for 1-click mod updates across your instance.

---

## 6. Tactile Settings, Cloud Sync & Release Control

Fine-tune launcher behavior, JVM garbage collection, network throughput, cloud backups, and update channels across 6 dedicated sections.

![Settings Screen](images/screenshots/settings.gif)

### Key Features Shown:
- **6 Dedicated Navigation Tabs**: Organized into *All*, *General*, *Resources*, *Instance Defaults*, *Keybinds*, and *About*.
- **About & Dual-Channel Release Control**: Dedicated **About Vermeil** tab featuring live switching between **Stable** and **Experimental** update channels with Fastly CDN manifest checks and safe version rollback.
- **Google Drive Settings Sync**: Zero-telemetry cloud backup and restore of portable preferences (`drive.appdata` sandbox) protected by single-use loopback OAuth 2.0 PKCE and CSRF `state` verification.
- **Client GC Presets & Rate Limiter**: Version-aware JVM Garbage Collection presets (*G1GC*, *Generational ZGC*, *Shenandoah*), live token-bucket download speed throttling, and shared Minecraft engine asset cleanup.

---

## 7. Account Vault & Hardware-Backed Security

Manage multiple Microsoft accounts and offline profiles with hardware-backed local credential encryption.

![Account Management](images/screenshots/accounts.gif)

### Key Features Shown:
- **Multi-Account Switcher**: Seamlessly add and switch between official **Microsoft** accounts and local **Offline** profiles.
- **Avatar & Session Status**: Live 2D skin head crops for Microsoft profiles and deterministic initial badges for offline accounts, with automatic token refresh indicators.
- **Encrypted Local Vault**: Credentials and OAuth tokens are encrypted at rest via **Windows DPAPI** (`CryptProtectData`) and **Linux Secret Service** with **AES-256-GCM** protection.

---

## 8. Download Manager & Transfer History

Monitor active mod, modpack, and runtime installations in real time with instant cancellation and persistent history tracking.

![Download Manager](images/screenshots/downloads.gif)

### Key Features Shown:
- **In-Flight Transfer Cards**: Real-time progress bars, download speed readouts, loader badges (`Fabric`, `Forge`, `NeoForge`, `Quilt`), and target game version pills.
- **One-Click Cancellation**: Abort active mod or modpack installations cleanly with automatic `.part` staging file cleanup.
- **Persistent Download Log**: Searchable history of completed and cancelled transfers with direct shortcuts to the target instance.
