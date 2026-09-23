# Vermeil — Master Agent & Developer Guide

**Vermeil** is a custom, privacy-focused Minecraft: Java Edition desktop launcher for Windows and Linux built with **Tauri 2 (Rust)** and **SolidJS (TypeScript)**, featuring an optional in-game Java client companion mod (`companion-mod/`).

This document is the single source of truth for AI agents (Antigravity, Gemini) and human contributors.

---

## 1. Core Philosophy: "Ponytail" Lazy Senior Dev Mode

Lazy means efficient, not careless. The best code is the code never written.

### The Ladder (stop at the first rung that holds):
1. **Does this need to be built at all?** (YAGNI)
2. **Does it already exist in this codebase?** Reuse existing helpers, utils, or patterns.
3. **Does the standard library already do this?** Use it.
4. **Does a native platform feature cover it?** Use it.
5. **Does an already-installed dependency solve it?** Use it.
6. **Can this be one line?** Make it one line.
7. **Only then:** write the minimum code that works.

- **Bug fix = root cause, not symptom:** Grep every caller of the touched function; fix the shared root once rather than patching one surface.
- **Rules:** No unrequested abstractions. No new dependencies if avoidable. Deletion over addition. Boring over clever. Fewest files possible. Shortest working diff wins once understood.
- **Visual & UI Restraint:** The Ponytail ladder applies equally to pixels. *Does this visual affordance need to exist at all?* If an element's state is already communicated by a colored border, background tint, or 3px left accent, do not stack redundant checkmark boxes, icons, or badges.
- **Intentional shortcuts:** Mark with `// ponytail: <ceiling> -> <upgrade path>`.
- **Not lazy about:** Understanding the problem and tracing real flow before editing. Input validation at trust boundaries. Data loss prevention. Security. Accessibility. Cross-platform calibration. Zero warnings. Non-trivial logic must leave one runnable check/test behind.

---

## 2. Project Architecture

```
Vermeil/
├── src/                          # SolidJS frontend
│   ├── components/               # Reusable UI components (Icons.tsx, Dropdown, etc.)
│   ├── screens/                  # Full-page views (Home, Settings, Mods, etc.)
│   ├── modals/                   # Modal dialogs
│   ├── ipc/commands.ts           # ALL Tauri invoke wrappers (single source of truth)
│   ├── services/                 # Frontend services (updater, etc.)
│   ├── styles/                   # Modular CSS: base, components, layout, screens, modals, dock, logs, notifications
│   ├── App.tsx                   # Global state, signals, screen routing
│   └── index.tsx                 # Entry point
├── src-tauri/
│   └── src/
│       ├── commands/             # Thin Tauri command handlers (validate -> call service -> return)
│       ├── services/             # Heavy business logic
│       ├── models/               # Shared data structures
│       ├── util/                 # Shared helpers (paths, http, etc.)
│       ├── lib.rs                # Command registration & app setup
│       └── main.rs               # Entry point
└── companion-mod/                # Optional Minecraft companion mod (Fabric/Forge Java, separate build)
```

---

## 3. Rust Backend Rules

- **Commands:** Every command uses `#[tauri::command] pub async fn`. Thin layer only. Returns `Result<T, String>` or `Result<T, AppError>`. Register all commands in `lib.rs` -> `invoke_handler`.
- **Services:** Heavy business logic lives in `src-tauri/src/services/`. `pub async fn`, accept specific arguments rather than entire structs. Do not depend on Tauri types unless `AppHandle` is required for events. Use `tracing::info!`, `tracing::error!`, `tracing::debug!` — never `println!`.
- **HTTP:**
  - Use shared `reqwest::Client` from managed state (`crate::util::http::HTTP`).
  - Always set header `User-Agent: "Vermeil/{version}"`.
  - Verify downloads with SHA-1 when available. Use `.part` files; rename only after successful hash verification.
  - Retry failed downloads up to 3 times with 500ms delay.
  - **API vs CDN concurrency:** APIs (Modrinth, CurseForge, Mojang) are rate-limited -> batch calls (`POST /v1/mods` up to 50 IDs, etc.), do not blindly parallelize. CDNs (static assets) tolerate bounded parallel downloads. User settings `concurrent_downloads` (max 20) and `concurrent_writes` (max 50) govern install batches via `services::download::download_all`. Background enrichment uses fixed internal limits.
- **File I/O:**
  - Always use `crate::util::paths` — never hardcode paths.
  - Create parent directories before writing: `fs::create_dir_all(parent)`.
  - Format human-readable JSON files with `serde_json::to_string_pretty`.
  - Strip Windows `\\?\` extended prefix using `services::java::strip_extended_prefix` before sending paths across IPC.
- **Platform Integrations (Windows Storage Footprint):** To ensure Windows "Installed Apps" reports genuine disk usage instead of the installer's static binary size, call `crate::util::platform::update_windows_estimated_size()`. It calculates `%LOCALAPPDATA%\Vermeil` size in KB and writes `EstimatedSize` under `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Vermeil`. Guarded by an atomic flag (`IS_UPDATING_ESTIMATED_SIZE`) and executed asynchronously via `std::thread::spawn` to avoid duplicate I/O or blocking the runtime. On non-Windows platforms, it compiles into an empty inline no-op without dead code warnings. Trigger on instance creation/deletion, modpack/Java install, cache purge, settings load, and during app close/tray exit.
- **Error Handling:** Descriptive error messages with context (`format!("Failed to download {}: {}", url, e)`). Log errors at point of origin. Never silently swallow errors with `let _ =` without an explanatory comment. Zero compiler warnings at all times (no `#[allow(dead_code)]` workarounds).

---

## 4. TypeScript Frontend Rules

- **IPC:** ALL `invoke()` calls go through `src/ipc/commands.ts`. Never call `invoke` directly in components. Every wrapper must have typed parameters and return type interfaces.
- **State Management:** Module-level SolidJS signals in `App.tsx` for global state. Use `createResource` for async data loaded once; `createSignal` for active UI state; `createMemo` for derived state.
- **Components:** Screens in `src/screens/` (1 file per screen), Modals in `src/modals/` (1 file per modal), Reusable UI in `src/components/`. Format: `const ComponentName: Component = () => { ... }`.
- **Icons:** **NEVER use emoji or unicode glyphs for UI buttons or interactive affordances.** Use SVGs from `src/components/Icons.tsx` (Feather Icons MIT, `viewBox="0 0 24 24"`, `stroke-width="1.8"`).
- **Events:** Listen via `listen()` from `@tauri-apps/api/event`. Always store unlisten handle and invoke in `onCleanup()`. Kebab-case naming (`download-progress`, `game-crashed`).
- **External Links:** Never use `window.open()` or raw `<a href>`. Always use `openUrl()` from `@tauri-apps/plugin-opener`. Intercept link clicks in rendered HTML descriptions.
- **Design System & SloppyKeys Reference:** Vermeil's tactile UI language is adopted from the creator's companion project, **SloppyKeys** (visual reference in `docs/images/sloppykeys_reference.png`). Features chunky 3D bevel buttons (`--bevel`, `--bevel-strong`, lift/scale hover, press active), framed section panels (`.card-gamemode-section`) with distinct category tag badge tints (`.tag-settings-*`), recessed sunken wells (`.card-section-body` `#0f0e13`), interactive setting plates (`.setting-row` with 3px left border), and square checkboxes (`.check.check--lg`). Reference between the creator's two projects is authorized and intentional.
- **UI Affordances & The Necessity Test (Restraint over Clutter):**
  - **No redundant affordances:** If an interactive card or plate already communicates its active/selected state through a colored outline, 3px left border, and background tint, **never add a floating checkbox or checkmark icon to it**. One clear affordance is superior to three stacked on top of each other.
  - **Semantics (Radio vs Checkbox):** Mutually exclusive 1-of-N choices (e.g. Modrinth vs CurseForge import formats, loader selection) are **tab / radio cards**, NOT checkboxes. Never put a square checkbox or `<IconCheck>` on a single-select card. Checkboxes are strictly for multi-selection (0 to N items).
  - **Buttons:** Before adding a button, ask: *is the whole card or row already clickable?* If clicking the card selects or opens it, do not embed redundant "Select" or "Choose" buttons.
  - **Badges:** Badges are for concise, non-obvious metadata (`.mrpack`, `.zip`, `Fabric`, `1.20.1`). Never add badges that repeat what is already stated in the title or communicate state already visible from a color tint.
  - **Dynamic Version Resolution:** Never hardcode application version strings (e.g. `v1.0.0`) in modals, headers, or badges. Always query Tauri's runtime app version dynamically (`const [appVersion] = createResource(getVersion);` from `@tauri-apps/api/app`) so UI badges stay in sync across all releases automatically.
  - **Spatial flow & Labeled Dividers:** Never use absolute positioning (e.g. `position: absolute; top: 8px; right: 8px;`) that collides with header tags, titles, or badges. For labeled dividers (e.g. `// OR OFFLINE PROFILE`), never use fragile pixel-offset math (`width: calc(50% - 30px)`); always use flexbox (`display: flex; align-items: center; gap: 12px; white-space: nowrap`) with `flex: 1` hairline divider pseudo-elements (`::before`, `::after`) that automatically stretch to fill space without intersecting or cutting through text.
  - **Tactile Tooltips (`data-tip`) & The Absolute Prohibition of Native `title`:**
    - **NEVER use the native HTML `title="..."` attribute anywhere.** Native `title` triggers the browser/OS default tooltip popup (e.g. Windows white-bordered black boxes with sluggish hover delay) that completely clashes with Vermeil's tactile design.
    - **ALWAYS use Vermeil's tactile tooltip system with `data-tip="..."`.**
    - **Styles & Mechanics**: Defined in `src/styles/layout.css` on `[data-tip]`. Features sharp corners (`border-radius: 0`), dark surface (`var(--surface-panel)`), 1px border (`var(--border-strong)`), 2.5px purple accent left edge (`border-left: 2.5px solid var(--accent)`), and deep drop shadow (`box-shadow: 0 4px 16px rgba(0,0,0,0.65)`).
    - **Positioning Classes**:
      - Default (centered above element): `data-tip="..."`
      - Below element: `class="... tip-below" data-tip="..."`
      - Left-anchored: `class="... tip-left" data-tip="..."`
      - Right-anchored: `class="... tip-right" data-tip="..."` (prevents right-edge viewport clipping)
      - Bottom-right: `class="... tip-below tip-right" data-tip="..."`
      - Bottom-left: `class="... tip-below tip-left" data-tip="..."`
    - **Restraint Rule**: Only add `data-tip` to discrete interactive affordances (icon buttons, status badges, chips). Never place `data-tip` on large containers (e.g. full cards, panels, or telemetry plates) or buttons that already have clear visible text.
  - **Chunky 3D Bevels (`--bevel`, `--bevel-strong`) — Strict Restraint & Purpose:**
    - **Physical Keycap Metaphor**: In SloppyKeys, `--bevel` represents the mechanical bevel of a physical keycap or pushable button.
    - **WHEN TO USE `--bevel`:**
      - **Action Buttons & Triggers**: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost:active`, `.modal-close`, icon buttons that perform actions.
      - **Interactive Keycaps & Chips**: Physical hotkey pills (like SloppyKeys `F1`/`F2` pills), clickable channel pills (`.mod-channel-pill.active`), selectable mode chips.
      - **Interactive Toggles / Inputs**: Square checkboxes (`.check-box`).
      - **Clickable Cards that Press Down**: Only cards with explicit click handlers and physical `:active` depression (`transform: translateY(1px)`).
    - **WHEN NEVER TO USE `--bevel`:**
      - **Informational / Telemetry Plates**: Setting rows, telemetry cards, telemetry plates, and info boxes are non-clickable display surfaces. Giving them bevels makes them look like bloated, unclickable fake buttons.
      - **Data Grid Cells & Table Rows**: Cells inside a data grid or recessed well (`#0f0e13`) must be flat tiles with hairline borders (`1px solid var(--border)` / `#23202f`), subtle backgrounds, and hover tints—never button bevels.
      - **Status Badges & Category Tags**: Badges (`[BASE]`, `[OPTIMAL]`, `[CAPPED]`, `Fabric`, version badges) are metadata labels, NOT keys. They must be flat with hairline borders and soft background tints.
      - **Footers, Headers & Banners**: Summary rows, calculation footers, and progress banners are static readouts. Use hairline dividers (`border-top: 1px solid var(--border)`).
    - **The Gold Rule**: *If the user cannot click and physically depress the element to execute an action or toggle state, it MUST NOT have a bevel shadow.*
  - **Stay within the theme without overdoing it:** Adhere to SloppyKeys tactile tokens (`--bevel`, `--surface-panel`, `--surface-raised`, `#0f0e13` wells, hairline borders). Do not invent novel decorative doodads, corner stickers, or unneeded containers. Boring, clean, and restrained beats busy and cluttered every time.

---

## 5. Naming Conventions

| Context | Convention | Example |
| :--- | :--- | :--- |
| Rust functions / variables / files | `snake_case` | `get_game_versions`, `mod_install.rs` |
| Rust types / structs / enums | `PascalCase` | `LoaderType`, `Instance` |
| Rust constants | `SCREAMING_SNAKE` | `MAX_CONCURRENT` |
| TypeScript functions / variables / utils | `camelCase` | `getGameVersions`, `commands.ts` |
| TypeScript types / components / screens | `PascalCase` | `GameVersion`, `InstanceCard.tsx`, `Settings.tsx` |
| Tauri commands | `snake_case` | `launch_instance` |
| Tauri events | `kebab-case` | `download-progress` |
| CSS variables / classes | `kebab-case` (`--*`) | `--accent`, `.setting-row` |

---

## 6. Feature Checklist & Parallel Implementations

### Adding a Feature (Full IPC Chain):
1. Service logic in `src-tauri/src/services/<module>.rs`
2. Command in `src-tauri/src/commands/<module>.rs`
3. Command registered in `lib.rs` `invoke_handler`
4. TypeScript interface in `src/ipc/commands.ts`
5. Typed wrapper function in `src/ipc/commands.ts`
6. UI component calls wrapper

### Adding a Screen:
1. `src/screens/<Name>.tsx`
2. Add to `Screen` type union in `App.tsx`
3. Add `<Show when={activeScreen() === "name"}>` in `App.tsx`
4. Add title to `screenTitles` in `App.tsx`
5. Add sidebar / dock button if applicable

### Parallel Implementation Rule:
When modifying one variant of a concept, update all parallel surfaces:
- **Content Sources:** Modrinth (`services/modrinth.rs`) ↔ CurseForge (`services/curseforge.rs`, `cf_*.rs`) ↔ Local Archives (`modpack.rs`, `cf_import.rs`).
- **Skin Archives:** Mojang (`services/skins.rs`) ↔ Crafty.gg (`services/skins.rs` `sync_crafty_skin_history`).
- **Loaders:** Fabric (`services/fabric.rs`) ↔ Quilt (`services/quilt.rs`) ↔ NeoForge/Forge (`services/neoforge.rs`).
- **Accounts:** Microsoft (online) ↔ Offline accounts.
- **Launch Entry Points:** `Home.tsx` ↔ `FloatingDock.tsx`.
- **IPC Contract:** Rust signature ↔ `commands.ts` wrapper and interface.
- **Events:** Backend `emit()` ↔ Frontend `listen()`.
- **Platform Code:** `#[cfg(windows)]` ↔ `#[cfg(unix)]`.

### Content Source & Installation Blast Radius:
Content flows from three sources: **Modrinth API**, **CurseForge API**, and **Local Archives** (`.mrpack`, `.zip`). Any change to install, import, or browse flows must verify the entire 5-stage pipeline:
1. **Queueing (`modpackQueue.ts`, `trackDownload`)**: Set clean `title` and sanitized `meta` (`iconUrl`, `loader`, `gameVersion`, `versionNumber`, `author`). **Invariant**: `loader` must ONLY ever be a real Minecraft loader (`"fabric"`, `"forge"`, `"neoforge"`, `"quilt"`, `"vanilla"`, or `undefined`) — **never** a platform name like `"modrinth"` or `"curseforge"`.
2. **In-Flight UI (`installProgress.ts`, `FloatingDock.tsx`, `Downloads.tsx`)**: Verify `install-progress` events, dock badge count, toast messages, and `dl-active-card` fallback icons.
3. **Backend Resolution (`modpack.rs`, `cf_import.rs`, `icon_cache.rs`)**: Resolve icons through the hierarchy (embedded archive icon → API SHA-1 lookup → API title search → `"cube"` fallback). Set `LoaderConfig`, `source_project_id`, `source_platforms`, `source_version`, and auto-pin via `settings_service::auto_pin_instance`. Trigger `platform::update_windows_estimated_size()` to synchronize the Windows uninstaller storage footprint.
4. **Completion Contract (`completeDownload`)**: Pass `(id, nameOverride, versionNumber, metaUpdates)` containing `iconUrl`, `loader`, `gameVersion`, `author`, and `instanceId`. Trigger immediate disk persistence (`persistDownloads(true)`).
5. **Downstream UI (`Downloads.tsx`, `Library.tsx`, `InstanceMods.tsx`)**: History cards (`DownloadCard`) must dynamically resolve missing assets via `matchingInstance()`. Instance tiles and installed mod lists must reflect clean names, cached icons, and styled loader pills. Full details in `.agents/skills/content-source-parity/SKILL.md`.

---

## 7. Cross-Platform Parity (Windows ↔ Linux)

The launcher targets Windows (WebView2, Win32/DWM) and Linux (WebKitGTK, X11/Wayland).
- Enforce window constraints, focus, and sizing in application code rather than relying on OS window manager defaults.
- WebKitGTK differences: stroke rendering weight, CSS support, timing/microtasks.
- If physical testing on Linux is not possible in the current session, reason explicitly about the Linux execution path and verify cross-platform assumptions.
- **Platform-Specific Function Hygiene:** Never declare split `#[cfg(windows)]` and `#[cfg(not(windows))]` function signatures if callers gate the call site behind `#[cfg(windows)]` — doing so leaves the non-Windows stub unused and triggers `dead_code` compiler warnings on Linux CI. Instead, declare a single unified public function whose internal body uses `#[cfg(windows)] { ... }` and compiles down to an empty inline no-op on non-Windows, called uniformly across all platforms.

---

## 8. Security & Performance

- **Untrusted Input:** Sanitize all input before creating file paths, process arguments, or network requests. Reject path traversal (`..`). Render external text as escaped text, never `innerHTML`.
- **Least Privilege:** Narrow Tauri capabilities. Store credentials securely (DPAPI on Windows). Never log tokens.
- **Performance:** Cap in-memory logs, buffers, and event histories. Heavy operations must run asynchronously off the main UI thread. Batch network queries.

---

## 9. Things That Are Never Acceptable

- Creating a new `reqwest::Client` instead of using the shared one.
- Calling `invoke()` directly in components instead of through `commands.ts`.
- Hardcoding paths instead of using `crate::util::paths`.
- Using `unwrap()` in production code paths (use `?` or error handling).
- Silently swallowing errors without logging.
- Adding dependencies without verifying existing dependencies don't cover the need.
- Using emoji or unicode glyphs as button or interactive icons.
- Using native HTML `title="..."` attributes for tooltips (always use `data-tip="..."` with appropriate `.tip-*` positioning).
- Exposing Windows `\\?\` prefix to frontend.
- Using `#[allow(dead_code)]` or suppressing compiler warnings. Build must remain zero-warning.
- Referencing other launcher codebases by name (original work policy; SloppyKeys is the creator's own companion project, not a launcher).

---

## 10. Implementation Workflow & Definition of Done

1. **Clarify Intent:** Restate goal clearly.
2. **Assess & Analyze:** Map architecture, blast radius, and parallel surfaces.
3. **Execute:** Complete full IPC chain, maintain styling and conventions.
4. **Validate:**
   - Frontend check: `pnpm exec tsc --noEmit`
   - Frontend build: `pnpm run build`
   - Backend check: `cargo check` (zero warnings)
   - Backend tests: `cargo test`
   - CI Matrix: `.github/workflows/ci.yml` runs full frontend and backend check/test suites on Ubuntu and Windows with auto-cancelling concurrency (`cancel-in-progress: true`).
5. **Commit & Push (Per Change):**
   - Conventional Commits: `type(scope): summary` (under ~70 chars, lowercase).
   - Push directly to `main` (linear history).
   - **Never rewrite pushed history** (no amend, no force push).
   - **Release Commits:**
     - Full release: `release: X.Y.Z` (e.g. `release: 1.1.0`).
     - Pre-release / Experimental build: When the user requests an experimental build or pre-release (e.g. "experimental build N"), the commit message **MUST explicitly include it**: `release: X.Y.Z (experimental build N)` (e.g., `release: 1.1.0 (experimental build 1)`).
6. **Definition of Done:** Code works, tests pass, zero warnings, parallel surfaces updated, living research docs (`docs/research/<feature>/progress.md`) updated, committed and pushed.

### Living Architecture Documentation & Visual Flowcharts:
- **When to document (`docs/research/<feature>/`)**: Any architectural feature, security/storage overhaul, or non-trivial refactor/optimization must have dedicated documentation:
  - `research.md`: Technical specification, data flows, and visual Mermaid node tree flowcharts.
  - `progress.md`: Living progress board and test suite coverage.
  - Indexed in `docs/research/README.md`.
- **Comparative Flowchart Requirement (Old vs. New)**:
  - When documenting an improvement, refactor, or optimization, **always include a comparative flowchart** showing both the previous/legacy flawed pipeline (illustrating bottlenecks/root causes) and the modern/calibrated pipeline (illustrating the solution).
  - Include a concise direct comparison table summarizing parameter/behavioral shifts and their user-facing impacts.
- **Node Tree Formatting Rules (Prevent Text Clipping)**:
  - **Explicit `<br/>` Line Breaks**: Always split text across lines with `<br/>` inside node labels (keep each line under ~35 characters). Never put long unbroken sentences in a node, as wide boxes clip in narrow viewports.
  - **Concise Affordances**: Use node boxes for concise titles and status; elaborate details belong in markdown text below the diagram.
  - **Quoted Syntax**: Always quote labels: `nodeId["Label Title<br/>(Brief detail)"]`.
- **Changelog Integration**:
  - Always link relevant research docs in `CHANGELOG.md` under `### Documentation` for both full releases and experimental builds so users and contributors have instant access to visual architecture blueprints.

---

## 11. Available Workspace Skills

Specialized skill instructions live in `.agents/skills/` (for Antigravity 2.0) and `.kiro/skills/` (for Kiro AI IDE):
- `add-mod-loader`: Adding new mod loader support.
- `add-screen`: Adding a full-page view to the UI.
- `add-tauri-command`: Connecting Rust services to SolidJS via Tauri IPC.
- `content-source-parity`: Maintaining Modrinth ↔ CurseForge API parity.
- `dependencies`: Managing Rust crates, npm packages, and Java tools safely.
- `minecraft-mod`: Working on companion mod in `companion-mod/`.
- `refactoring`: Restructuring code across IPC and modules safely.
- `release-process`: Version bumping, changelogs, and release tags.
- `stonecraft`: Working on multi-loader modern companion mod via Stonecraft/Stonecutter in `companion-mod/stonecutter/`.
