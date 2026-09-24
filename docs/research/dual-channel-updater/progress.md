# Dual-Channel Release & Update Progress

Living progress board and verification matrix for the Vermeil dual-channel release and update architecture.

---

## Workstreams & Deliverables

- [x] **Phase 1: Settings Data Model & IPC**
  - [x] Add `update_channel: String` to `LauncherSettings` in `src-tauri/src/models/settings.rs` (defaulting to `"stable"`).
  - [x] Expose `update_channel: "stable" | "experimental"` in `src/ipc/commands.ts`.
  - [x] Update cloud backup serialization in `src-tauri/src/services/google_cloud.rs`.
- [x] **Phase 2: Rust Updater Service Extension**
  - [x] Implement dynamic endpoint routing in `src-tauri/src/services/app_updater.rs` via `app.updater_builder().endpoints()`.
  - [x] Add version comparator downgrade support (`update.version != current`).
  - [x] Register `check_for_updates` command in `src-tauri/src/commands/app_updater.rs` and `src-tauri/src/lib.rs`.
  - [x] Wrap commands through typed IPC functions in `src/ipc/commands.ts`.
- [x] **Phase 3: Frontend Settings UI & Rollback Safety Gate**
  - [x] Add `.update-channel-pills` and `.update-channel-pill` tactile styles in `src/styles/screens.css`.
  - [x] Add Release Channel segmented selector in `src/screens/Settings.tsx`.
  - [x] Add active channel status tag (`[EXPERIMENTAL]` / `[STABLE]`) in About Vermeil.
  - [x] Add tactile rollback confirmation modal warning about channel downgrades while guaranteeing complete instance/data preservation.
  - [x] Refactor `src/services/updater.ts` to query through IPC and support channel overrides.
- [x] **Phase 4: Release Workflow Pre-Release Synchronization**
  - [x] Add `sync-experimental` job in `.github/workflows/release.yml` running on pre-release tags (`contains(github.ref_name, '-')`).
  - [x] Synchronize dual-platform `latest.json` to permanent `experimental-latest` GitHub release.
- [x] **Phase 5: Verification & Quality Assurance**
  - [x] `cargo check`: zero compiler warnings.
  - [x] `cargo test`: 64/64 backend tests pass.
  - [x] `pnpm exec tsc --noEmit`: zero type errors.
  - [x] `pnpm run build`: successful production bundle build.

---

## Test Suite & Verification Matrix

| Area | Command / Test | Result |
| :--- | :--- | :--- |
| **Backend Compilation** | `cargo check` | Passed (0 warnings) |
| **Backend Unit Tests** | `cargo test` | Passed (64 passed, 0 failed) |
| **Frontend Typecheck** | `pnpm exec tsc --noEmit` | Passed (0 errors) |
| **Frontend Production Build** | `pnpm run build` | Passed (built in 4.10s) |
| **Settings Serialization** | `test_cloud_backup_serialization_roundtrip` | Passed |
| **Channel Routing** | `services::app_updater::check_for_updates` | Verified |
