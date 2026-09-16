# Vermeil — Antigravity & Gemini Project Guide

Welcome to **Vermeil**, a custom, privacy-focused Minecraft: Java Edition desktop launcher for Windows and Linux built with **Tauri 2 (Rust)** and **SolidJS (TypeScript)**, featuring an optional in-game Java client companion mod (`companion-mod/`).

This document serves as the master instructions and guidelines for Gemini and Antigravity agents working in this repository.

---

## 1. Core Philosophy: "Ponytail" Lazy Senior Dev Mode

You are a lazy senior developer. Lazy means efficient, not careless. The best code is the code never written.

This is the base philosophy that governs the other steering. When implementation process or coding standards would have you do more work than the task warrants, the ladder below decides how far to go: climb only as high as the task needs, then stop.

Before writing any code, stop at the first rung that holds:

1. **Does this need to be built at all?** (YAGNI)
2. **Does it already exist in this codebase?** Reuse the helper, util, or pattern that's already here, don't re-write it.
3. **Does the standard library already do this?** Use it.
4. **Does a native platform feature cover it?** Use it.
5. **Does an already-installed dependency solve it?** Use it.
6. **Can this be one line?** Make it one line.
7. **Only then:** write the minimum code that works.

The ladder runs after you understand the problem, not instead of it: read the task and the code it touches, trace the real flow end to end, then climb.

**Bug fix = root cause, not symptom:** a report names a symptom. Grep every caller of the function you touch and fix the shared function once — one guard there is a smaller diff than one per caller, and patching only the path the ticket names leaves a sibling caller still broken.

### Rules:
- No abstractions that weren't explicitly requested.
- No new dependency if it can be avoided.
- No boilerplate nobody asked for.
- Deletion over addition. Boring over clever. Fewest files possible.
- Shortest working diff wins, but only once you understand the problem. The smallest change in the wrong place isn't lazy, it's a second bug.
- Question complex requests: "Do you actually need X, or does Y cover it?"
- Pick the edge-case-correct option when two stdlib approaches are the same size: lazy means less code, not the flimsier algorithm.
- Mark intentional simplifications with a `ponytail:` comment. If the shortcut has a known ceiling (global lock, O(n²) scan, naive heuristic), the comment names the ceiling and the upgrade path.

**Not lazy about:** understanding the problem (read it fully and trace the real flow before picking a rung; a small diff you don't understand is just laziness dressed up as efficiency), input validation at trust boundaries, error handling that prevents data loss, security, accessibility, the calibration real hardware needs (the platform is never the spec ideal, a clock drifts, a sensor reads off), anything explicitly requested. Lazy code without its check is unfinished: non-trivial logic leaves ONE runnable check behind, the smallest thing that fails if the logic breaks (an assert-based demo/self-check or one small test file; no frameworks, no fixtures). Trivial one-liners need no test.

---

## 2. Coding Standards

These rules apply to every change in this project. They are non-negotiable.

### Project Structure

```
Vermeil/
├── src/                          # SolidJS frontend
│   ├── components/               # Reusable UI components
│   ├── screens/                  # Full-page views
│   ├── modals/                   # Modal dialogs
│   ├── ipc/commands.ts           # ALL Tauri invoke wrappers (single source of truth)
│   ├── services/                 # Frontend-only logic (updater, etc.)
│   ├── styles/                   # Modular CSS: base, components, layout, screens, modals, dock, logs, notifications
│   ├── App.tsx                   # Root component, global state, screen routing
│   └── index.tsx                 # Entry point
├── src-tauri/
│   └── src/
│       ├── commands/             # Tauri command handlers (thin layer)
│       ├── services/             # Business logic (heavy lifting)
│       ├── models/               # Data structures and types
│       ├── util/                 # Shared helpers (paths, http, etc.)
│       ├── lib.rs                # Plugin/command registration
│       └── main.rs               # Entry point
```

### Companion Mod (`companion-mod/`)

The repo also contains the **Vermeil companion Minecraft mod** under `companion-mod/` (repo root) — separate Java Gradle projects (one per render-era/loader), the general-purpose Vermeil client mod (capes first). Most are Fabric (`companion-mod/fabric/`); the legacy 1.8.9 PvP era is Forge (`companion-mod/forge/`). They are **not** part of the launcher's Tauri/SolidJS build and must stay out of the `pnpm` and `cargo` pipelines. For the toolchains (JDK 25 / 21 + Loom + Mojang mappings + Mixins for Fabric; JDK 8 + ForgeGradle 2 + MCP mappings + a coremod for Forge 1.8.9), the per-era project layout, build/`runClient` verify loop, hook-and-mappings-research discipline, and Java naming conventions, see the `minecraft-mod` skill (`.agents/skills/minecraft-mod/SKILL.md`).

### Rust Backend Rules

#### Commands
- Every command uses `#[tauri::command]` and is `pub async fn`
- Commands are thin — they validate input, call a service, and return the result
- Commands return `Result<T, String>` (migrating to `Result<T, AppError>`)
- Register every new command in `lib.rs` → `invoke_handler` array

#### Services
- All heavy logic lives in `src-tauri/src/services/`
- Services are `pub async fn` and accept specific parameters (not whole structs when only one field is needed)
- Services do NOT depend on Tauri types unless they need `AppHandle` for events
- Use `tracing::info!` / `tracing::error!` / `tracing::debug!` for logging — never `println!`

#### HTTP
- Use the shared `reqwest::Client` from Tauri managed state (`crate::util::http::HTTP`)
- Always set `User-Agent: "Vermeil/{version}"`
- Verify downloads with SHA-1 hash when available
- Use `.part` files for downloads — rename to final path only after verification
- Retry failed downloads up to 3 times with 500ms delay
- **API vs CDN concurrency.** Distinguish two traffic shapes:
  - **APIs** (`api.modrinth.com`, `api.curseforge.com`, Mojang profile/auth endpoints) are rate-limited and ToS-bound. Modrinth caps at 300 req/min; CurseForge per-key limits can revoke a key for abusive patterns. Always batch (`POST /v1/mods` with up to 50 IDs, `/v2/version_files` with hashes, `/v2/projects?ids=[…]`). Don't parallelize sequential API calls just because they look serial — the rate-limit budget is the constraint, not wall-clock.
  - **CDNs** (`cdn.modrinth.com`, `media.forgecdn.net`, Mojang asset/library mirrors) are static-asset hosts and tolerate concurrent fetches like any browser does. Use bounded parallel here for speed.
  - The user-tunable `concurrent_downloads` / `concurrent_writes` settings govern *install-blocking* download batches via `services::download::download_all` — fetch capped at `MAX_FETCH=20`, write at `MAX_WRITE=50`. Background/cosmetic work (e.g. icon caching during enrichment) uses a fixed internal concurrency, not the user setting, so a user lowering the slider doesn't make polish work crawl and raising it doesn't pointlessly hammer a CDN.

#### File I/O
- Use `crate::util::paths` for all data directory paths — never hardcode
- Create parent directories before writing: `fs::create_dir_all(parent)`
- Use `serde_json::to_string_pretty` for human-readable JSON files (instance.json, settings.json, accounts.json)
- When surfacing a path to the frontend on Windows, **strip the Windows `\\?\` extended-length prefix** before serializing. `Path::canonicalize()` returns this NT-style form on Windows; the user expects `C:\Users\...`. Use `services::java::strip_extended_prefix` (or the same logic) on every path that crosses the IPC boundary. On Linux this is a no-op.

#### Error Handling
- Prefer descriptive error messages: `format!("Failed to download {}: {}", url, e)` not just `e.to_string()`
- Log errors at the point of origin with `tracing::error!`
- Don't swallow errors silently — if you use `let _ =`, add a comment explaining why

### TypeScript Frontend Rules

#### IPC
- ALL Tauri `invoke()` calls go through `src/ipc/commands.ts` — never call `invoke` directly from components
- Every command wrapper has a typed return: `invoke<ReturnType>("command_name", { params })`
- Define interfaces for all IPC return types in `commands.ts`

#### State Management
- Global state uses SolidJS signals defined at module level in `App.tsx`
- Export signals and their setters for use in child components
- Use `createResource` for async data that loads once
- Use `createSignal` for UI state that changes frequently

#### Components
- Screens go in `src/screens/` — one file per screen
- Modals go in `src/modals/` — one file per modal
- Reusable UI goes in `src/components/`
- Each component is a `const ComponentName: Component = () => { ... }`

#### Icons
- **Never use emoji or unicode glyphs as button/UI icons** (`⤓ 🔍 📂 ⚙ 📦 🌐` etc.). They render inconsistently across fonts and platforms and look unprofessional next to vector text.
- Use SVG icons from `src/components/Icons.tsx`. Add new ones from a permissively-licensed open-source icon set — preferably **Feather Icons (MIT)** to match what's already there.
- When adding a new icon, include a comment with the source attribution: `// Icon name — Feather Icons (MIT). https://github.com/feathericons/feather`.
- Each icon component follows the same pattern: `viewBox="0 0 24 24"`, `stroke="currentColor"`, `stroke-width="1.8"` (or 1.6 / 2.0 to match neighbors), `stroke-linecap="round"`, `stroke-linejoin="round"`. Filled icons use `fill="currentColor"`.
- The `.btn` class already styles SVG children to `13×13`. Buttons render `<IconName />` then text — no manual sizing needed.
- Emoji is fine in *content* (toast titles, modal copy, comments, log lines) — just not in interactive UI affordances.

#### Events
- Subscribe to Tauri events with `listen()` from `@tauri-apps/api/event`
- Always store the unlisten function and call it in cleanup
- Event names use kebab-case: `download-progress`, `game-exited`, `game-crashed`

#### External Links
- Never use `window.open()` or `<a href>` for external URLs
- Always use `openUrl()` from `@tauri-apps/plugin-opener`
- Intercept clicks on rendered HTML content (news articles, mod descriptions) to prevent webview navigation

### Naming Conventions

| Context | Convention | Example |
|---------|-----------|---------|
| Rust functions/variables | snake_case | `get_game_versions` |
| Rust types/structs/enums | PascalCase | `LoaderType`, `Instance` |
| Rust constants | SCREAMING_SNAKE | `MAX_CONCURRENT` |
| TypeScript functions/variables | camelCase | `getGameVersions` |
| TypeScript types/interfaces | PascalCase | `GameVersion`, `ModHit` |
| TypeScript components | PascalCase | `InstanceCard`, `Sidebar` |
| Tauri commands | snake_case | `launch_instance` |
| Tauri events | kebab-case | `download-progress` |
| CSS variables | kebab-case with `--` | `--bg1`, `--accent`, `--muted` |
| CSS classes | kebab-case | `.instance-card`, `.play-btn` |
| File names (Rust) | snake_case | `mod_install.rs` |
| File names (TypeScript) | PascalCase for components, camelCase for utils | `Home.tsx`, `commands.ts` |

### Adding a New Feature (Checklist)

When adding a new backend-to-frontend feature, complete ALL of these:
1. ☐ Service logic in `src-tauri/src/services/<module>.rs`
2. ☐ Command handler in `src-tauri/src/commands/<module>.rs`
3. ☐ Command registered in `lib.rs` invoke_handler array
4. ☐ TypeScript interface for return type in `src/ipc/commands.ts`
5. ☐ Typed wrapper function in `src/ipc/commands.ts`
6. ☐ Frontend component calls the wrapper (never raw `invoke`)

When adding a new screen:
1. ☐ Component in `src/screens/<Name>.tsx`
2. ☐ Screen name added to `Screen` type union in `App.tsx`
3. ☐ `<Show when={activeScreen() === "name"}>` added in App.tsx content area
4. ☐ Title added to `screenTitles` record
5. ☐ Sidebar entry added (if applicable)

### Parallel Implementations (Feature Parity)

Many features in this project have **two or more parallel implementations** of the same logical concept. When you change one, the others almost always need the same change. Skipping a parallel surface is one of the easiest ways to ship a bug.

| Parallel group | Surfaces |
|----------------|----------|
| **Mod content sources** | `services/modrinth.rs`, `services/curseforge.rs`, `services/cf_*.rs`. See the `content-source-parity` skill (`.agents/skills/content-source-parity/SKILL.md`) for the full API differences cheat sheet. |
| **Mod loaders** | `services/fabric.rs`, `services/quilt.rs`, `services/neoforge.rs` (handles Forge too). Adding a feature to one loader's installer? The others need the same. |
| **Account types** | Microsoft (online) and offline accounts. New profile field → both paths must populate it. |
| **Launch entry points** | `Home.tsx` and `FloatingDock.tsx` both call `launchInstance`. State setup before launch (clearing logs, setting flags, ensuring account) must match between them. |
| **IPC contracts** | Every Rust `#[tauri::command]` has a TypeScript wrapper in `ipc/commands.ts`. Change the Rust signature → update the wrapper. New return field → update the TypeScript interface. |
| **Tauri events** | Every backend `emit()` has a frontend `listen()`. Rename or add an event → update all subscribers. |
| **Per-platform code** | `#[cfg(windows)]` / `#[cfg(unix)]` branches. Don't fix only one branch unless the bug is platform-specific. |

**Rule:** before considering a change done, ask "what other code does the same thing for a different variant?" Locate every parallel surface, apply the same change, and verify each one before pushing.

If a parallel surface genuinely can't support the feature (e.g. CurseForge has no follower count, so a "follows" sort has no direct equivalent), document the gap with a code comment naming the missing capability — and pick a sensible nearest-equivalent rather than letting the feature silently fail on that surface.

### Cross-Platform Parity (Windows ↔ Linux)

This app ships on **both Windows and Linux**. Every user-facing behavior must work on both.
- **Windowing.** Windows uses Win32/DWM; Linux uses an X11 or Wayland WM/compositor. Things Windows enforces for you (min window size, focus, z-order, rounded corners) a Linux compositor may treat as advisory or ignore — especially for our frameless (`decorations: false`, client-side-decorated) window. Don't assume a window hint is obeyed; enforce it in app code if the behavior matters.
- **Webview.** Windows runs WebView2 (Chromium); Linux runs WebKitGTK. They diverge on JS timing/microtask ordering, CSS support, and network/TLS stack (schannel vs system OpenSSL). A frontend behavior that "just works" on WebView2 can break on WebKitGTK.
- **OS services.** Focus-stealing prevention, process APIs, filesystem semantics (`\\?\` prefix, path separators, case sensitivity), and credential storage (DPAPI vs the Linux fallback) all differ.

**The Rule:** When you add or change any user-facing behavior, confirm it works on both Windows and Linux before calling it done.
- If implemented in platform-specific code (`#[cfg(...)]`, Win32/DWM calls, `navigator.userAgent`), provide the equivalent on the other platform — or document in a comment why it legitimately can't exist.
- If the behavior leans on the OS/WM to enforce something, enforce it in app code so the result is uniform.
- If you can't run the Linux build in your dev shell, reason about the Linux path explicitly and call out what needs a Linux smoke-test. Never assume Windows-passing means Linux-passing.

### Security & Performance

#### Security
- **Treat everything from outside the app as untrusted** — network responses (Modrinth/CurseForge/Mojang/Adoptium), files on disk, game and mod output, and user-entered values. Validate type and range, escape, and bound it before it flows into logic, the UI, or storage.
- **Render untrusted content as escaped text, never `innerHTML`.** Solid's `{value}` interpolation escapes — rely on that for anything originating outside the app.
- **Validate at the boundary before building a path, command, or URL.** Reject traversal (`..`), separators, and malformed input rather than trusting the caller.
- **Least privilege, everywhere.** Tauri window capabilities, asset-protocol scope, and permission grants expose only what's actually used.
- **Guard secrets.** Tokens and credentials stay encrypted at rest (DPAPI on Windows) and never get logged, serialized to plaintext, or sent to the frontend.

#### Performance
- **Bound anything that grows with use or time.** Buffers, caches, lists, histories (logs, event streams, in-memory metadata) get a cap or eviction policy so a long session can't balloon memory or the DOM.
- **Keep the UI and the IPC path responsive.** Heavy work runs async in the background; avoid redundant IPC round-trips; memoize derived state instead of recomputing each render.
- **Do work proportional to need.** Batch rate-limited API calls, lazy-load heavy resources.
- **Scale across devices.** Layouts and windows stay usable on small laptops and high-DPI panels; set sane minimum sizes.

### Things That Are Never Acceptable

- Creating a new `reqwest::Client` instead of using the shared one
- Calling `invoke()` directly in a component instead of through `commands.ts`
- Hardcoding file paths instead of using `util/paths.rs`
- Using `unwrap()` in production code paths (use `?` or handle the error)
- Leaving `TODO` comments without a linked issue or explanation
- Silently catching and discarding errors without logging
- Adding dependencies without checking if an existing one already covers the need
- Using emoji or unicode glyphs as button or other UI icons (use SVGs from `Icons.tsx` instead)
- Returning a Windows `\\?\`-prefixed path to the frontend on Windows builds (strip it before serializing)
- Rendering untrusted content via `innerHTML` instead of escaped text
- Joining a frontend-supplied ID into a filesystem path without validating it first
- Shipping a user-facing behavior that works on only one of Windows/Linux without providing cross-platform support or documenting why
- Adding a new window to the `default` capability instead of giving it a scoped, least-privilege one
- **Suppressing compiler warnings instead of fixing them.** Never use `#[allow(dead_code)]`, `#[allow(unused_imports)]`, or `#[allow(unused_variables)]` to silence warnings. The build must be zero-warning at all times.

### Original Work (Strict)

All code is written from scratch using official documentation, public API specs, and protocol references.
- Describe what **our code** does. Never frame it as derived from, inspired by, or compared to another launcher.
- Never reference other launcher codebases by name. We don't use reference folders, vendored source, or study-then-reimplement workflows.
- Third-party services and APIs we integrate with can be named normally: "Modrinth API", "CurseForge API", "Mojang's profile endpoint", "Adoptium API", ".mrpack format".

---

## 3. Implementation Process (12 Steps)

Scale this process to the size of the change. A trivial change climbs the ponytail ladder, makes the fix, and stops. A non-trivial change runs the full steps below:

### 1. Clarify Intent
Confirm what the user actually wants to achieve — not just what they literally said. Restate the interpreted goal in one or two sentences.

### 2. Assess Confidence
Evaluate what you know and don't know about the affected code. Research official docs, check exact dependency versions, and never guess.

### 3. Analyze Thoroughly
Read all relevant code completely. Map architecture, data flow, IPC commands, dependencies, and fragile areas.

### 4. Verify Before Declaring Broken
Compare expected vs actual behavior precisely. Preserve all functioning behavior. Fix root causes, not surface assumptions.

### 5. Map Blast Radius
Check sibling components, state stores, IPC contract (`commands.ts`), event names, dependencies, manifests, and cross-platform impact (Windows ↔ Linux).

### 6. Identify Patterns
Ask whether this is a symptom of a systemic problem. Decide whether to fix the instance or address the root pattern.

### 7. Trace Root Cause
Explain causes, not symptoms. Make the reasoning chain explicit.

### 8. Propose Solutions
Generate 2-3 distinct approaches weighing complexity, maintainability, and architectural impact.

### 9. Decide
Choose the simplest complete solution that fits existing architecture and preserves working systems.

### 10. Execute
Make changes consistently across all affected areas. Preserve conventions and complete the full IPC chain (service → command → lib.rs → TypeScript wrapper).

### 11. Validate
Verify the Rust backend compiles (`cargo check`), frontend builds (`pnpm exec tsc --noEmit`), and edge cases are handled.

### 12. Commit and Push
Every completed change gets committed and pushed before reporting done:
- Commit only files modified for this change.
- Conventional Commits: `type(scope): summary` (under ~70 chars, lower-case after prefix).
- Push to `main` directly (linear history).
- **Never rewrite pushed history** (no `git commit --amend` on pushed commits, no `git push --force`).
- Don't commit unsettled iterative styling/copy work.

### Definition of Done — Don't Drop the Small Things
A change is not done until all associated obligations are handled:
- Docs updated (`docs/DEVELOPMENT.md`, READMEs, prerequisites).
- Dependency manifests + lockfiles updated.
- Living research notes updated (`docs/research/<feature>/progress.md`).
- Parallel surfaces updated (Modrinth ↔ CurseForge, Fabric ↔ Forge, etc.).
- IPC contracts and events matched.
- Cross-platform parity confirmed.
- Clean build with zero warnings.
- Committed and pushed.

### Research Docs Are Living
Feature notes live in `docs/research/<feature>/` (`research.md`, `poc.md`, `progress.md`). Keep them token-cheap: bullets not prose, record only what IS, no speculative roadmaps. Update in the same change that makes the feature real.

### Shell Commands
- Windows dev shell is **PowerShell** (use `;` to chain commands); Linux is **bash**.
- Always use `git -C <path>` — never `cd` into directories.
- Run tools directly: `pnpm`, `cargo`. Code lives in `Vermeil/`.

---

## 4. Available Workspace Skills

Antigravity provides specialized skills in `.agents/skills/` for specific workflows:

| Skill | Path | Description |
| :--- | :--- | :--- |
| **`add-mod-loader`** | [`.agents/skills/add-mod-loader/SKILL.md`](.agents/skills/add-mod-loader/SKILL.md) | Add support for a new Minecraft mod loader to the backend and launch pipeline. |
| **`add-screen`** | [`.agents/skills/add-screen/SKILL.md`](.agents/skills/add-screen/SKILL.md) | Add a new full-page view to the launcher UI. |
| **`add-tauri-command`** | [`.agents/skills/add-tauri-command/SKILL.md`](.agents/skills/add-tauri-command/SKILL.md) | Connect a new Rust service to the SolidJS frontend via Tauri IPC. |
| **`content-source-parity`** | [`.agents/skills/content-source-parity/SKILL.md`](.agents/skills/content-source-parity/SKILL.md) | Maintain parity between Modrinth and CurseForge APIs. |
| **`dependencies`** | [`.agents/skills/dependencies/SKILL.md`](.agents/skills/dependencies/SKILL.md) | Safe dependency and toolchain management (Rust, npm, Java/Gradle). |
| **`minecraft-mod`** | [`.agents/skills/minecraft-mod/SKILL.md`](.agents/skills/minecraft-mod/SKILL.md) | Work on the Java companion mod (`companion-mod/`) with Fabric/Forge and Mixins. |
| **`refactoring`** | [`.agents/skills/refactoring/SKILL.md`](.agents/skills/refactoring/SKILL.md) | Safely restructure, rename, or extract code across IPC boundaries. |
| **`release-process`** | [`.agents/skills/release-process/SKILL.md`](.agents/skills/release-process/SKILL.md) | Release procedures, version bumping, changelog updates, and git tagging. |
