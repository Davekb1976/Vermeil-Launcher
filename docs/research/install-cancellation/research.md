# Install cancellation

## What was there before

Nothing. The X on the install-progress popup wrote three local signals
(`setVisible(false)`, `setDone(false)`, `setFraction(0)`) and never touched the
backend. The install ran to completion regardless, and the popup re-showed itself
on the next `install-progress` event — so the X was, in practice, a
"hide until the next phase boundary" button that looked like a cancel.

A grep for `cancel|abort|CancellationToken|is_cancelled|stop_flag|JoinHandle` over
the backend found no install-related hit. The only `AtomicBool` was `USER_STOPPED`
in `commands/launch.rs`, which suppresses a crash event when the user stops a
*running game*. `BrowseModpacks::doInstall` fires the install as a floating
promise and navigates away, so nothing even held a handle to abort.

## Why it was cheap to add

The install flows already delete a partially-created instance directory on **any**
error (`modpack.rs`, `cf_import.rs` — `remove_dir_all` on a failed
`prepare_with_extras`). Cancellation therefore only had to *produce an error*; it
needed no teardown path of its own.

## Design

- One process-global `AtomicBool` in `services/download.rs`, matching the
  `USER_STOPPED` precedent, with `request_cancel` / `clear_cancel` /
  `cancel_check`.
- `InstallScope` (RAII) clears the flag on creation and on drop. Each install
  command holds one, so a request can't leak past the install it was meant for —
  including on an early `?` return. A leaked flag would abort a later
  launch-time repair, which presents as the game refusing to start for no reason.
- Checkpoints: before each task in `download_one` (so a queue of thousands stops
  promptly rather than running out), after the batch in `download_all`, and
  between the post-download stages in `prepare_with_extras`. Not inside a stage —
  archive extraction and the Forge/NeoForge installer subprocess can't be
  interrupted once started.
- `download_all` neither logs nor aggregates per-task cancellation errors; it
  reports the cancel once after the stream.
- `cancel_install` emits an `install-progress` event with `section: "cancelled"`.
  Without it the popup would sit at its last phase until the 30s inactivity
  auto-hide, because the aborting install returns an error rather than emitting a
  terminal event. The popup then suppresses events for 4s, since an emit already
  in flight would otherwise re-show a popup the user just dismissed.
- Cancel and hide are separate controls. An X that looks like a cancel but isn't
  is worse than either alone.

## Fixed alongside (same code path)

- The temp modpack archive used a fixed filename (`temp_modpack.mrpack` /
  `temp_cf_modpack.zip`), so two concurrent installs wrote the same file and each
  extracted whatever the other had just landed. Now unique per install — which in
  turn required cleaning the temp file up on the download's failure path, since a
  leftover unique name would never be overwritten by a later run.
- `cf_import::import_profile_code` had no cleanup guard at all: it wrote
  `instance.json` and then called `prepare_with_extras(...).await?`, leaving a
  broken instance listed in the library on any failure.

## Known ceiling

The global flag means two installs running at once share it, so cancelling one
aborts both. That matches the UI, which shows a single progress popup with a
single Cancel button. Upgrade path is a per-install token in Tauri managed state
threaded through `prepare_with_extras` — worth doing only if concurrent installs
become a real workflow.

Cancellation is checkpoint-based, not preemptive: up to `concurrent_downloads`
in-flight requests finish, and a stage already running (Java extraction, loader
installer) runs to completion before the abort is observed.
