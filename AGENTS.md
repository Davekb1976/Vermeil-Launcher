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
- **Content Sources:** Modrinth (`services/modrinth.rs`) ↔ CurseForge (`services/curseforge.rs`, `cf_*.rs`).
- **Loaders:** Fabric (`services/fabric.rs`) ↔ Quilt (`services/quilt.rs`) ↔ NeoForge/Forge (`services/neoforge.rs`).
- **Accounts:** Microsoft (online) ↔ Offline accounts.
- **Launch Entry Points:** `Home.tsx` ↔ `FloatingDock.tsx`.
- **IPC Contract:** Rust signature ↔ `commands.ts` wrapper and interface.
- **Events:** Backend `emit()` ↔ Frontend `listen()`.
- **Platform Code:** `#[cfg(windows)]` ↔ `#[cfg(unix)]`.

---

## 7. Cross-Platform Parity (Windows ↔ Linux)

The launcher targets Windows (WebView2, Win32/DWM) and Linux (WebKitGTK, X11/Wayland).
- Enforce window constraints, focus, and sizing in application code rather than relying on OS window manager defaults.
- WebKitGTK differences: stroke rendering weight, CSS support, timing/microtasks.
- If physical testing on Linux is not possible in the current session, reason explicitly about the Linux execution path and verify cross-platform assumptions.

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
5. **Commit & Push (Per Change):**
   - Conventional Commits: `type(scope): summary` (under ~70 chars, lowercase).
   - Push directly to `main` (linear history).
   - **Never rewrite pushed history** (no amend, no force push).
6. **Definition of Done:** Code works, tests pass, zero warnings, parallel surfaces updated, living research docs (`docs/research/<feature>/progress.md`) updated, committed and pushed.

---

## 11. Available Workspace Skills

Specialized skill instructions live in `.agents/skills/`:
- `add-mod-loader`: Adding new mod loader support.
- `add-screen`: Adding a full-page view to the UI.
- `add-tauri-command`: Connecting Rust services to SolidJS via Tauri IPC.
- `content-source-parity`: Maintaining Modrinth ↔ CurseForge API parity.
- `dependencies`: Managing Rust crates, npm packages, and Java tools safely.
- `minecraft-mod`: Working on companion mod in `companion-mod/`.
- `refactoring`: Restructuring code across IPC and modules safely.
- `release-process`: Version bumping, changelogs, and release tags.
