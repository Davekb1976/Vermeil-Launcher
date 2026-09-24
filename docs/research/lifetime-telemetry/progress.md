# Progress: Persistent Lifetime Telemetry & World Playtime Tracker

## Status Board

| Phase | Description | Status |
| :--- | :--- | :--- |
| **Phase 1** | Global Settings Model Extension (`models/settings.rs`) | Complete |
| **Phase 2** | Monotonic Startup Grandfathering & Sync (`services/settings_service.rs`) | Complete |
| **Phase 3** | Game Session Accounting (`services/launch.rs`) | Complete |
| **Phase 4** | Safe Instance Deletion Absorption (`commands/instances.rs`) | Complete |
| **Phase 5** | Google Cloud Sync Parity (`services/google_cloud.rs`) | Complete |
| **Phase 6** | Single-Pass World NBT & JSON Parsing (`commands/files.rs`) | Complete |
| **Phase 7** | Frontend Home & Worlds UI Integration (`Home.tsx`, `InstanceMods.tsx`) | Complete |
| **Phase 8** | Unit Test Suite & Build Verification | Complete |

---

## Test Suite Coverage

### Backend Unit Tests (`cargo test`)
- `commands::files::tests::test_parse_level_dat`: Verifies single-pass NBT parsing for `LevelName`, `Time` ticks, `GameType`, `LastPlayed`, and `hardcore`.
- `commands::files::tests::test_parse_level_dat_hardcore`: Verifies hardcore flag parsing in `level.dat`.
- `commands::files::tests::test_read_player_play_time`: Verifies `stats/*.json` player ticks parsing across modern and legacy format keys.
- `services::google_cloud::tests::test_machine_specific_settings_sanitized_and_preserved`: Verifies that `lifetime_play_seconds` and `last_active_at` are preserved during cloud sync sanitization.

### Frontend Compilation & Build
- `pnpm exec tsc --noEmit`: 0 errors.
- `pnpm run build`: 0 errors (built in ~5.39s).
