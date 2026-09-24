---
name: content-source-parity
description: Implement or modify any feature that flows through content sources (Modrinth, CurseForge, local .mrpack/.zip imports) and understand their blast radius across queueing, download tracking, UI badges, icons, and instance lifecycle. Use when touching services/modrinth.rs, services/curseforge.rs, services/cf_*.rs, services/modpack.rs, commands/mods.rs, commands/instances.rs, BrowseModpacks.tsx, ImportInstance.tsx, InstanceMods.tsx, or Downloads.tsx.
---

# Content Sources & Blast Radius Guide

Vermeil ingests Minecraft content (mods, modpacks, resource packs, shaders, datapacks) through three distinct sources: **Modrinth API**, **CurseForge API**, and **Local Archive Imports** (`.mrpack`, `.zip`).

Whenever you implement, modify, or debug any content source feature, **you must consider the entire 5-stage lifecycle pipeline and its blast radius across the launcher**. Fixing only the backend fetch without verifying download tracking, history persistence, badges, and icon resolution results in broken cards, missing icons, or unstyled badges.

---

## 1. The Three Content Sources

| Source | Mod Types | Modpacks | File Format | Auth / Key | Primary Code Paths |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Modrinth API** | Mods, Packs, Shaders, Datapacks | Browse & Install | `.mrpack` (contains `modrinth.index.json`, direct CDN URLs) | None (Public API) | `services/modrinth.rs`, `services/mod_install.rs`, `services/modpack.rs` |
| **CurseForge API** | Mods, Packs, Shaders, Datapacks | Browse & Install | Zip (`manifest.json`, numeric `projectID`/`fileID` pairs) | `x-api-key` required | `services/curseforge.rs`, `services/cf_mod_install.rs`, `services/cf_import.rs` |
| **Local Archives** | N/A (Bundled in pack) | Local Import | `.mrpack` (Modrinth) or `.zip` (CurseForge) | Optional CF key for metadata | `modals/ImportInstance.tsx`, `services/modpack.rs`, `services/cf_import.rs` |

---

## 2. The 5-Stage Content Pipeline & Blast Radius Checklist

Every content addition or modification ripples through 5 connected stages. When touching any source, check off every stage:

### Stage 1: Enqueueing & Initial Metadata
- **Entry Points**: `BrowseModpacks.tsx` (`doInstall`), `InstanceMods.tsx` (`installMod`), `ImportInstance.tsx` (`handleImport`).
- **Function**: `enqueueInstallTask` or `enqueueModpack` in `services/modpackQueue.ts`.
- **Payload (`meta`)**:
  - `iconUrl`: Remote CDN URL if known upfront (e.g. from search hit). Set to `undefined` for local archive imports (archive is not extracted yet).
  - `loader`: **CRITICAL INVARIANT**: Must ONLY be a genuine Minecraft loader (`"fabric"`, `"forge"`, `"neoforge"`, `"quilt"`, `"vanilla"`, or `undefined`). **NEVER** set content platforms (`"modrinth"` / `"curseforge"`) as a loader.
  - `gameVersion`: e.g. `"1.20.1"` or version range string.
  - `versionNumber`: Release tag (e.g. `"v4.1.0"`, `"1.13.4"`).
  - `author`: Primary author display name.
- **Blast Radius Check**: Does the item appear in `queuedDownloads()` in `Downloads.tsx` with a clean title and without broken/unstyled badges?

### Stage 2: In-Flight Tracking & Active UI
- **Events**: Backend emits `"install-progress"` (`InstallProgressPayload`) and `"download-progress"` (`completed`/`total`).
- **Active Install Card (`Downloads.tsx`)**:
  - `activeInstallEntry()` matches the active orchestrator task by `task.id` or title.
  - `dl-active-icon-badge` displays the pack's icon if available, falls back to `activeIcon()` (resolving dynamically from disk instance if created), or `<IconDownload />`.
- **Dock Indicator (`FloatingDock.tsx`)**: Active download count badge increments/decrements.
- **Toast Notifications (`updateDownloadQueueToast`)**: Displays batch status and current downloading item title.
- **Blast Radius Check**: Does starting an install show an immediate progress indicator without freezing, and does the dock/toast counter reflect active items?

### Stage 3: Backend Execution & Asset Resolution
- **Icon Resolution Hierarchy** (in `modpack.rs` & `cf_import.rs`):
  1. Embedded icon inside archive (`icon.png`, `pack.png`, `logo.png`, `icon.webp`, `overrides/icon.png`, etc.) cached via `icon_cache::cache_icon_bytes`.
  2. Modrinth SHA-1 lookup: Compute archive SHA-1, query `GET /v2/version_file/{sha1}?algorithm=sha1`, resolve `project_id`, fetch project logo, cache via `icon_cache::cache_remote_icon`.
  3. API Name Search fallback: Query Modrinth/CurseForge search by pack title to find the matching project logo.
  4. Only fall back to `"cube"` placeholder if all resolution passes fail.
- **Instance Metadata (`instance.json`)**:
  - `name`: Deduplicated clean title via `unique_instance_name(&manifest.name)`.
  - `icon`: The durable instance icon path inside the instance directory (`<instance_dir>/icon.<ext>`) via `icon_cache::persist_instance_icon()`. **Invariant**: Never point `instance.icon` directly into volatile `%LOCALAPPDATA%\Vermeil\cache\` (wiped on cache purge). If resolution fails, fall back to `"cube"`.
  - **Auto-Healing Invariant**: `sanitize_instance_json()` verifies that any local path in `instance.icon` exists on disk. If pointing outside the instance directory (e.g. in `cache/icons/`), it migrates it durably into `<instance_dir>/icon.<ext>`. If missing on disk, it heals to an existing icon or cleanly falls back to `"cube"`, preventing Tauri `tauri::protocol::asset` 404 console errors.
  - `loader`: `LoaderConfig` with actual `LoaderType`.
  - `game_version`: Target Minecraft version.
  - `source_project_id` & `source_platforms` & `source_version`.
- **Auto-Pinning**: Newly created instances call `settings_service::auto_pin_instance(&instance.id)`.
- **Storage Footprint Synchronization**: Content additions must invoke `crate::util::platform::update_windows_estimated_size()` so Windows Settings ("Installed Apps") accurately updates its uninstaller `EstimatedSize` registry DWORD.
- **Blast Radius Check**: Does `instance.json` on disk contain the actual modpack logo (not `"cube"`), valid loader type, and proper source version?

### Stage 4: Completion Contract & Persistence
- **Execution Return**: `execute()` must return the newly created `Instance` (or mod result) with its `id`, `name`, `icon`, `loader`, and `game_version`.
- **Instance Refetch**: `await refetchInstances()` and `refreshPinnedInstanceIds()` must run *before* `completeDownload()`.
- **`completeDownload()` Contract**:
  ```ts
  completeDownload(
    id: string,
    nameOverride?: string,      // Clean instance title from result.name
    versionNumber?: string,     // result.source_version ?? meta.versionNumber
    metaUpdates?: {
      iconUrl?: string | null;  // result.icon (if !== "cube") ?? meta.iconUrl
      loader?: string;          // result.loader.type ?? meta.loader
      gameVersion?: string;     // result.game_version ?? meta.gameVersion
      author?: string | null;   // meta.author
      instanceId?: string;      // result.id (CRITICAL for history linkage)
    }
  )
  ```
- **Immediate Disk Save**: `persistDownloads(true)` writes `download_history.json` immediately on completion, failure, or cancellation to avoid loss on rapid navigation.
- **Blast Radius Check**: Does `download_history.json` receive `iconUrl`, genuine `loader`, `gameVersion`, and `instanceId`?

### Stage 5: Downstream UI Surfaces
- **Download History (`Downloads.tsx`)**:
  - `DownloadCard` renders `cardIcon()`, `cardName()`, `cardLoader()`, `cardGameVersion()`.
  - Must include **dynamic instance fallback** (`matchingInstance()`): if historical or imported items were saved with missing fields, dynamically resolve from `instances()` in memory so cards never display broken initials or missing badges.
- **Auto-Healing (`App.tsx`)**: Reactive `createEffect` checks `downloads()` against `instances()` on boot, backfilling missing metadata in `download_history.json`.
- **Library (`Library.tsx`)**: Renders tile icon (`instance.icon`), loader badge (`.badge--${instance.loader.type}`), and version pill.
- **Installed Content (`InstanceMods.tsx`)**: Shows installed mods from `instance.mods`, and triggers background metadata enrichment (`enrich_mod_metadata`).
- **Blast Radius Check**: Does the finished card in Download History show the icon image, `.badge--fabric` (or appropriate loader) pill, and MC version pill?

---

## 3. Critical Invariants & Pitfalls

1. **Platforms are NOT Loaders**:
   - Platforms: `"modrinth"`, `"curseforge"`.
   - Loaders: `"fabric"`, `"forge"`, `"neoforge"`, `"quilt"`, `"vanilla"`.
   - Never pass a platform name into a `loader` field or CSS class (`.badge--modrinth` does not exist).
2. **Local Archives Have No Upfront CDN URLs**:
   - Unlike search hits from Browse, `.mrpack` and `.zip` files selected from disk have no upfront `icon_url`.
   - The backend must extract the icon from the archive or resolve it via API hash lookup during the install pass.
3. **Always Forward `instanceId`**:
   - `DownloadEntry` must store `instanceId` for modpack installs so history cards and download managers retain a hard link to the created instance.
4. **Never Bypass CurseForge Distribution Restrictions**:
   - When CurseForge `allowModDistribution == false`, `download_url` is `None`.
   - Never fabricate CDN URLs to bypass this. Trigger `services::manual_download` (`manual-download-required` event) carrying the project's website URL.
5. **No Blind API Parallelism**:
   - Modrinth and CurseForge rate-limit metadata queries.
   - Batch calls (e.g. `POST /v1/mods` for up to 50 IDs) rather than spawning unbounded HTTP requests.

---

## 4. Known API Differences (Cheat Sheet)

### Loader filtering
- **Modrinth**: facets-based. Pass `categories=fabric` etc. in the `facets` array.
- **CurseForge**: `modLoaderType` query parameter with numeric IDs (1=Forge, 4=Fabric, 5=Quilt, 6=NeoForge).
- **Project types affected**: mods AND modpacks have a primary loader. Resource packs, shaders, and datapacks are loader-agnostic on both sources — applying a loader filter to those returns zero results on CurseForge.

### Sort fields
- **Modrinth**: `relevance`, `downloads`, `follows`, `newest`, `updated`.
- **CurseForge**: `1=Featured`, `2=Popularity`, `3=Updated`, `4=Name`, `6=Downloads`, `11=Newest`.
- **CurseForge has no "follows"**: Map `follows` sort to `popularity` (id 2) in the backend.

### Game version filtering
- **Modrinth**: `versions=["1.20.1"]` facet.
- **CurseForge**: `gameVersion=1.20.1` query param. Single value only.

### Project type / class
- **Modrinth**: `project_type` facet — `"mod"`, `"modpack"`, `"resourcepack"`, `"shader"`, `"datapack"`.
- **CurseForge**: numeric `classId` — 6=Mods, 4471=Modpacks, 12=Resource Packs, 6552=Shaders, 6945=Data Packs.

### Icon / thumbnail URL
- **Modrinth**: single `icon_url` field.
- **CurseForge**: `logo` object with `thumbnailUrl` AND `url`. Fall back to `url` when `thumbnailUrl` is empty.

### Author
- **Modrinth**: search hit's `author` field directly.
- **CurseForge**: first entry of `authors[]` (fetched separately on single-project lookups; not in search hits).

### Modpack file format
- **Modrinth**: `.mrpack` (ZIP with `modrinth.index.json`). Mod files are URLs.
- **CurseForge**: `.zip` with `manifest.json`. Mod files are referenced by `(projectID, fileID)` pairs.

### Cross-CDN file hosting
- **Modrinth**: `cdn.modrinth.com`.
- **CurseForge**: `media.forgecdn.net`, `edge.forgecdn.net`, `mediafilez.forgecdn.net`. All three must be allowed in CSP.

### Per-project version list
- **Modrinth**: `GET /v2/project/{id}/version`. Always pass `include_changelog=false` unless displaying changelogs.
- **CurseForge**: `GET /v1/mods/{id}/files?pageSize=50`. Paged by file count.

### Dependency vocabulary
- **Modrinth**: `dependency_type` (`required`, `optional`, `incompatible`, `embedded`). May carry exact `version_id` pin.
- **CurseForge**: `relationType` (1=Embedded, 2=Optional, 3=Required, 4=Tool, 5=Incompatible, 6=Include). Carries only `modId`, never a file ID. Pinned CurseForge files must always be fetched via `curseforge::get_file(modId, fileId)`.

### Update detection
- **Modrinth**: Compare publish dates (`date_published`).
- **CurseForge**: Identity comparison uses numeric `file_id` (globally monotonic: update flagged only when `newest_id > current_id`).

---

## 5. Parallel Implementation Rule Reference

Whenever modifying content source logic, ensure all parallel surfaces are aligned:

| Concept | Modrinth Surface | CurseForge Surface | Local Archive Surface |
| :--- | :--- | :--- | :--- |
| **Search / Browse** | `services/modrinth.rs` | `services/curseforge.rs` | N/A |
| **Mod Install** | `services/mod_install.rs` | `services/cf_mod_install.rs` | N/A |
| **Modpack Install** | `services/modpack.rs` | `services/cf_import.rs` | `modpack.rs` / `cf_import.rs` |
| **Manual / Opt-Out** | N/A (all available) | `services/manual_download.rs` | Blocked files reported |
| **Mod Updates** | `services/mod_updates.rs` (`check_modrinth_entry`) | `services/mod_updates.rs` (`check_curseforge_entry`) | Skipped if `source == "modpack"` |
| **UI Switcher** | `BrowseModpacks.tsx`, `InstanceMods.tsx` | `BrowseModpacks.tsx`, `InstanceMods.tsx` | `ImportInstance.tsx` (tab toggle) |
| **Queue & History** | `modpackQueue.ts` -> `App.tsx` | `modpackQueue.ts` -> `App.tsx` | `modpackQueue.ts` -> `App.tsx` |
