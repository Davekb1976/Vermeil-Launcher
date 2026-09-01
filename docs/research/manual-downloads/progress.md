# Progress

## 2026-08-31 · honor the third-party download opt-out (done)

- Removed the reconstructed-CDN-URL bypass from both places that had it
  (`curseforge::get_project_files`, `cf_import`'s `forgecdn_fallback_url`, now
  deleted). `downloadUrl` passes through as the API gives it.
- New `services/manual_download.rs`: `ManualDownload` payload +
  `manual-download-required` event. Raised from four points — single mod, its
  dependencies, the modpack archive, and modpack-bundled files.
- `install_cf_mod` / `install_cf_one` gained `window: Option<&WebviewWindow>`
  purely to raise the dialog, following the `modpack::install_from_*` precedent.
  `mod_updates::apply_update` passes `None` — it still returns the explanatory
  error, it just can't show a dialog.
- `get_modpack_file_url` now returns `Option<String>` for the URL; a null is a
  normal outcome to prompt on, not an error.
- `build_mod_tasks` returns blocked files as a third value. Imports install
  everything else and report afterwards, so one un-fetchable mod doesn't sink the
  pack — `sync_manual_mods` picks the jar up once dropped in.
- `ContentVersion.downloadable` added so the version picker marks blocked entries
  `manual` and warns before Install rather than after.
- New `ManualDownloadModal` at App level, event-driven and queueing (a pack can
  block several files), with copy-filename, open-project-page via `openUrl`, and
  open-mods-folder.
- Cleaned two stale comments in `cf_import.rs` that described URL construction
  that no longer exists.
- Verified: `cargo test --lib` 27 passed, `cargo check` and `pnpm run build` clean
  with zero warnings, both TS self-checks pass. The self-check caught the missing
  `downloadable` field in its fixture, which is what it's for.
- Not verified on hardware: needs a real blocked project to confirm the dialog
  copy, the link, and that a pack import completes without the blocked file. A
  known example has to be found by browsing CurseForge — the flag isn't visible
  in search results.
