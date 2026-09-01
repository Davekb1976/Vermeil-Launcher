# Progress

## 2026-08-31 · cancellable modpack installs (done)

- Confirmed by reading the code that no cancellation existed and that the popup's
  X was frontend-only; findings + design in `research.md`.
- Added `request_cancel` / `clear_cancel` / `cancel_check` + `InstallScope` (RAII)
  to `services/download.rs`. Checkpoints in `download_one`, after the batch in
  `download_all`, and between `prepare_with_extras`' post-download stages.
- Key decision: cancellation only has to *return an error* — the install flows
  already `remove_dir_all` the partial instance on any error, so no new teardown
  path was written.
- New `cancel_install` command; it emits `install-progress` with
  `section: "cancelled"` so the popup closes instead of waiting out the 30s
  inactivity auto-hide. Popup suppresses events for 4s afterwards so an in-flight
  emit can't re-show it.
- Cancel and hide are now separate controls on the popup, with the X labelled as
  hide. `BrowseModpacks` no longer `alert()`s on a cancel — it toasts, and only
  reports a genuine failure as a failure.
- Fixed in the same path: temp modpack archive names are unique per install (a
  fixed name let two concurrent installs clobber each other), the temp file is
  cleaned up on the download's failure path, and
  `cf_import::import_profile_code` gained the cleanup guard it never had.
- Verified: `cargo test --lib` 24 passed (1 new, covering that a cancel can't
  outlive its `InstallScope` in either direction); `cargo check` and
  `pnpm run build` clean, zero warnings.
- Not verified on hardware: needs a real modpack install cancelled mid-download to
  confirm the instance directory is removed, the popup closes, and no orphaned
  `temp_modpack_*.mrpack` remains. Linux needs the same check — nothing here is
  platform-specific, but it has not been run there.
