# Google Cloud Settings Sync: Implementation & Progress Log

## Status

**Complete & Validated.**
- End-to-end OAuth 2.0 PKCE loopback integration implemented and tested.
- Cancellation and 60s timeout handling verified.
- Direct-to-Google Drive `appDataFolder` backup/restore verified.
- Settings sanitization strictly excludes hardware-dependent settings (RAM allocation, Window dimensions, Java runtime/paths, and mouse controls).
- Automatic token revocation on disconnect verified against Google `/revoke` endpoint.
- Zero TypeScript and Rust compilation warnings.

---

## IPC Interface & Surface Mapping

### Backend (`src-tauri/`)
- **Service Layer:** `src-tauri/src/services/google_cloud.rs`
  - `start_google_oauth()`: Ephemeral port binding, PKCE verifier generation, single-use `/start?nonce=...` loopback gate (`start_served` guard refusing browser rewinds/history clicks with `TCP RST`), cryptographic `oauth_state` CSRF validation (`RFC 8252 §8.9`), `window.history.replaceState` URL cleansing, and auto-close script.
  - `cancel_google_oauth()`: Aborts loopback listener instantly via `oneshot::Sender<()>`.
  - `connect_google_account()`: Connects account, encrypts refresh token with DPAPI, performs initial restore/backup.
  - `disconnect_google_account()`: Revokes token with Google (`/revoke`), deletes `google_cloud.enc`, resets `last_cloud_backup`.
  - `sign_out_google_account()`: Deletes local `google_cloud.enc` and resets `last_cloud_backup` without contacting `/revoke`, preserving Google Account authorization for seamless reconnects.
  - `is_cloud_connected()`: Checks presence of local encrypted credential.
  - `backup_to_google_cloud()` / `restore_from_google_cloud()`: In-place `PATCH` and merge logic.
  - `sanitize_settings_for_cloud()` & `merge_restored_settings()`: Machine-specific data filter.
- **Commands:** `src-tauri/src/commands/cloud_sync.rs`
  - Exposes `connect_google_cloud`, `disconnect_google_cloud`, `sign_out_google_cloud`, `is_google_cloud_connected`, `backup_to_google_cloud`, `restore_from_google_cloud`, `get_last_cloud_backup_time`, `cancel_google_cloud`.
- **Registration:** `src-tauri/src/lib.rs` -> Registered in `invoke_handler`.

### Frontend (`src/`)
- **IPC Wrappers:** `src/ipc/commands.ts`
  - Typed wrappers with `CloudConnectSummary`, `CloudBackupSummary`, `CloudRestoreSummary`, `signOutGoogleCloud`.
- **UI Surfaces:**
  - `src/screens/Account.tsx`: Google Cloud Settings Sync strip with `[ CLOUD ]` / `[ SYNCED ]` badges, last backup timestamp formatting, and dual `[ Sign Out ]` (neutral) / `[ Disconnect ]` (danger) actions when connected.
  - Auto-cancellation on screen switch via SolidJS `onCleanup`.

---

## Test Verification

### Automated Backend Tests
Run via `cargo test --lib services::google_cloud`:
1. `test_pkce_generation`: Validates 43-character base64url entropy and SHA-256 challenge generation.
2. `test_cloud_backup_serialization_roundtrip`: Verifies serialization and deserialization of `VermeilCloudBackup`.
3. `test_machine_specific_settings_sanitized_and_preserved`: Validates that RAM limits, adaptive RAM settings, window dimensions, custom Java paths, and mouse sensitivity are stripped from the cloud backup and strictly preserved as local configurations during restore across heterogeneous machines.

### Bidirectional Play Time & Live Runtime Signal Synchronization
- **Monotonic High-Water Mark (`max(cloud, local)`)**:
  - `perform_backup_with_context()` and `merge_restored_settings()` in `services/google_cloud.rs` (along with `settings_service::save()`) enforce a strict monotonic high-water mark for `lifetime_play_seconds` (`max(cloud, local)`) and `last_active_at` (via parsed RFC3339 UTC epoch comparator `is_timestamp_newer()`).
  - Connecting a fresh install (`0m` playtime) can never overwrite or reset cloud playtime or last active date (`YYYY-MM-DD`). Conversely, if a local machine accumulates higher playtime or a newer `last_active_at` while offline/disconnected, `perform_restore_with_id()` immediately reconciles and pushes the merged higher stats back to Google Drive reusing the resolved file ID (`0` extra GET requests).
- **Game Lifecycle & Startup Hooks**:
  - `services/launch.rs` triggers `google_cloud::spawn_background_sync()` when `last_active_at` is recorded on game launch and when `lifetime_play_seconds` is credited on game exit.
  - `lib.rs` triggers `google_cloud::sync_on_startup()` on launcher boot when connected, reconciling cloud and local stats in the background and emitting `cloud-settings-synced`.
- **Coalesced Background Upload Lock (`SYNC_IN_PROGRESS` + `SYNC_PENDING`)**:
  - `sync_settings_background()` uses `AtomicBool` compare-and-exchange coalescing so rapid setting toggles or simultaneous launch/save triggers coalesce into a single non-overlapping Drive upload loop reusing the same OAuth access token.
- **Immediate Live Runtime Signal Activation**:
  - Restoring settings from Google Cloud (`Account.tsx`, `OnboardingWizard.tsx`, and `cloud-settings-synced` in `App.tsx`) immediately invokes `refreshPinnedInstanceIds()` (`setAutoHideDockSetting`, `setPaginationPosition`, `setDownloadToastsEnabled`, `vermeil-keybinds-changed`, `vermeil-settings-changed`) as well as backend `discord::set_enabled` and `download::set_speed_limit_mb`, so toggles like `Auto-hide Dock` take effect immediately at runtime without requiring a launcher restart.

### Validation Matrix
| Check | Command | Result |
| :--- | :--- | :--- |
| Rust Unit Tests | `cargo test --lib services::google_cloud` | **3 passed (100%)** |
| Rust Compilation | `cargo check` | **0 errors, 0 warnings** |
| TypeScript Checking | `pnpm exec tsc --noEmit` | **0 errors** |
