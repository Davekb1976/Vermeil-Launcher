# Progress

## 2026-09-20 · On-demand historical skin synchronization via Crafty.gg (done)

- **Backend (`services/skins.rs`)**:
  - Implemented `sync_crafty_skin_history` querying `https://api.crafty.gg/api/v2/players/{account.id}`.
  - Follows up by querying the complete historical archive at `/players/{crafty_internal_id}/skins` with pagination support (`meta.last_page`), falling back to embedded profile skins if secondary query fails.
  - Decodes base64 PNG textures, validates dimensions (64x64 or 64x32), computes SHA-1 checksums, and detects `slim` vs `classic` model variants.
  - Formats chronological labels (`Skin (Jun 2026)`) from RFC3339 timestamps.
  - Deduplicates on disk and in `skins.json`, preserving user-renamed skins while enriching timestamps.
- **IPC Command (`commands/skins.rs`, `src/ipc/commands.ts`, `lib.rs`)**:
  - Registered `sync_crafty_skins` Tauri command.
  - Typed `CraftySyncResult` interface (`added`, `total`, `skins`).
  - Added `syncCraftySkins()` wrapper function.
- **UI & Restraint (`src/screens/Skins.tsx`, `src/styles/screens.css`)**:
  - Added "Sync" button in Wardrobe header beside "Import" with rotating icon animation and tactile tooltip.
  - Added "Sync Previous Skins" button in `.skins-empty-wardrobe`.
  - Removed redundant `Skin Library` text in header to prevent layout collision in 280px sidebar, providing ~36px of breathing room.
  - Replaced native HTML `title` attributes with clean rendering to preserve tactile design guidelines.
  - Verified internal scroll (`overflow-y: auto`) inside `.skins-panel-body` removes any need for pagination controls.
- **Documentation**:
  - Updated `PRIVACY.md` third-party services table with Crafty.gg transparency note.
  - Updated `README.md` and `docs/PROJECT_SUMMARY.md` feature lists.
- **Verification**:
  - `pnpm exec tsc --noEmit` and `pnpm run build` clean (0 errors).
  - `cargo check` clean (0 warnings, 0 errors).
  - Live query verified on `guangdong2855`: retrieved complete historical archive (8 skins).
