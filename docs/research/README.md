# Research & design notes

Committed, in-the-open notes behind Vermeil's features — what was investigated,
what the constraints are, and why the design went the way it did. These are part
of the repo on purpose: this is an open project, so the reasoning is public, not
just the code.

## Layout

- One subfolder per feature/topic (e.g. `ingame-capes/`, `secure-credentials-vault/`).
- A folder may hold a `research.md` (findings), a `poc.md` (proof-of-concept
  scope), and whatever else helps — design sketches, open questions, decisions.

## Topics

- [Secure Credential Vault](secure-credentials-vault/research.md): Operating-system-level encrypted vault, cross-platform AEAD, atomic writes, and token isolation
- [Google Cloud Settings Sync](google-cloud-sync/research.md): Zero-telemetry settings backup and restore using Google Drive appDataFolder
- [In-Game Capes](ingame-capes/research.md): Companion mod cape rendering and Mojang/Crafty sync
- [Companion Settings](companion-settings/research.md): In-game companion mod configuration and IPC
- [Mod Version Resolution](mod-version-resolution/research.md): Algorithm for resolving compatible mod files across loaders
- [FOV Effects 1.8.9](fov-effects-1.8.9/research.md): Legacy FOV effects backport and video options patching
- [Legacy LWJGL Linux](legacy-lwjgl-linux/research.md): Handling legacy LWJGL on modern Linux Wayland/X11
- [Uninstaller Optimization](uninstaller-optimization/research.md): Windows storage footprint synchronization
- [Client GC Calibration](client-gc-calibration/research.md): Modern client garbage collection presets and initial heap calibration across hardware tiers
- [Persistent Lifetime Telemetry](lifetime-telemetry/research.md): Dual-ledger activity persistence, monotonic playtime tracking, and single-pass NBT world telemetry
- [Concurrent Runtime Provisioning](concurrent-runtime-provisioning/research.md): Single-flight Java synchronization, atomic extraction staging, structural JRE validation, and loader installer scratch isolation
- [Library Architecture & Parallel Deletion](library-architecture/research.md): High-concurrency instance unlinking, single-pass settings consolidation, and dual-shelf hierarchy
- [Dual-Channel Release & Update Architecture](dual-channel-updater/research.md): Dynamic endpoint routing, Fastly CDN manifest synchronization, and cryptographic rollback mechanics
- [UI Modal Restraint & Popover Anchoring](ui-modal-restraint/research.md): Single-point footer dismissal, prohibition of redundant top-right close buttons, and dropdown anchoring invariants
- [Offline Character Studio & Local Wardrobe](offline-character-studio/research.md): Decoupled local wardrobe management, 3D WebGL studio viewing, client-side model variants, and tactile offline status banner

## Ground rules

- **Original.** Everything is written in our own words from official
  documentation and specifications, cited inline where it matters. Third-party
  *services and APIs* (Fabric, NeoForge, Quilt, Mojang, the Minecraft Wiki,
  Architectury, Adoptium, Modrinth, CurseForge) are named normally. Another
  launcher's, client's, or mod's *source code* is never a reference.
- **Honest about uncertainty.** If something needs verifying before building,
  it's listed as an open question, not stated as fact.
- These notes inform the code; when a decision lands, the code and its commit
  message are the source of truth.
