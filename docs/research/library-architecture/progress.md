# Progress: Library Architecture & Parallel Batch Deletion

## Status: Completed

### Implementation Checklist

- [x] **Backend Parallel Batch Deletion (`src-tauri/src/commands/instances.rs`)**
  - [x] Implement `delete_instances(ids: Vec<String>)` command.
  - [x] Single-pass metadata inspection for `last_played` timestamps.
  - [x] Single-pass `settings.json` load, pin list filtration, and write.
  - [x] Concurrent directory tree unlinking using `tokio::task::spawn_blocking`.
  - [x] Single-pass Windows uninstaller footprint recalculation.
  - [x] Route legacy single `delete_instance(id)` into `delete_instances(vec![id])`.
  - [x] Register `instances::delete_instances` in `src-tauri/src/lib.rs`.

- [x] **IPC Contract (`src/ipc/commands.ts`)**
  - [x] Add typed wrapper `deleteInstances(ids: string[]): Promise<void>`.

- [x] **Design & Iconography (`src/components/Icons.tsx`)**
  - [x] Add `<IconStar />` (Feather Icons MIT).
  - [x] Add `<IconPin />` (Feather Icons MIT).

- [x] **Tactile Styling (`src/styles/components.css`)**
  - [x] Add `.library-header`, `.library-header-meta`, `.library-toolbar`.
  - [x] Add `.library-search`, `.library-search-input`, and `.library-search-clear`.
  - [x] Add `.library-filter-pills` and `.library-filter-pill` with tactile `--bevel` active state.
  - [x] Add `.library-empty-panel`, `.library-empty-icon`, `.library-empty-title`, and `.library-empty-subtitle`.
  - [x] Add `.badge--unplayed` and `.badge--pinned` accents.

- [x] **Frontend View Architecture (`src/screens/Library.tsx`)**
  - [x] Implement dual-shelf structure (`// PINNED FAVORITES` and `// ALL INSTANCES`).
  - [x] Add `Manage Pins` trigger for `PinInstancesModal`.
  - [x] Add multi-select toggle with `<IconTrash2 />` icon.
  - [x] Fix tooltip clipping with `tip-below tip-right` on multi-select button.
  - [x] Wire batch deletion to `deleteInstances(Array.from(selected()))` with `isDeleting` loading state.
  - [x] Add loader filter pills (`All`, `★ Pinned`, `Played`, `Unplayed`, and dynamic loader types).
  - [x] Add search filter input with instant clear button.
  - [x] Add tactile empty-state hero panel for 0-instance installations.

### Test Coverage

- [x] Unit test `commands::instances::tests::test_delete_instances_empty_list` passes.
- [x] Full test suite (64 unit tests) passes with 0 failures.
- [x] `pnpm exec tsc --noEmit` exits with code 0.
- [x] `pnpm run build` succeeds cleanly.
- [x] `cargo check` passes with 0 warnings.
