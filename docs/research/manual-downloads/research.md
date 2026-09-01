# Manual downloads (CurseForge opt-out)

## The rule being honored

CurseForge authors can set `allowModDistribution: false`, after which the API
returns `downloadUrl: null` for that project's files. Per the
[CurseForge REST API](https://docs.curseforge.com/rest-api/), the mod object also
carries `links.websiteUrl`, which is the page a user can download from by hand.

## What the launcher did before

Three paths silently worked around the opt-out by reconstructing a CDN URL from
the numeric file id (`edge.forgecdn.net/files/{id/1000}/{id%1000}/{name}`):

- `curseforge::get_project_files` — for single mod installs
- `cf_import::build_mod_tasks` via `forgecdn_fallback_url` — for pack files

Because the fabricated URL was always present, the "doesn't allow third-party
downloads" error in `cf_mod_install` was unreachable dead code. When CurseForge
did block the reconstructed request, the user saw
"Download failed after 3 retries" with nothing to act on.

Only the modpack archive itself (`get_modpack_file_url`) reported honestly, and
even then as a plain error string with no link.

## What it does now

- `downloadUrl` is passed through exactly as the API gives it. No reconstruction
  anywhere.
- Four detection points raise one event, `manual-download-required`, carrying
  `{ kind, title, file_name, url, instance_id }`:
  - single mod install (`cf_mod_install::install_cf_one`)
  - a dependency of one (same function, recursive)
  - the modpack archive (`modpack::install_from_curseforge`)
  - modpack-bundled files (`cf_import::report_blocked_files`)
- `ManualDownloadModal` queues entries so one import blocking several files gives
  one dialog, not a stack. Per entry: copy the file name, open the project page.
  Per dialog: open the instance's mods folder.
- The version picker marks blocked entries `manual` and warns before Install, so
  the dialog isn't a surprise after the click.

## Decisions

- **Modpack imports continue without blocked files** rather than failing. One
  un-fetchable mod would otherwise make the whole pack uninstallable. The
  existing `mod_install::sync_manual_mods` already reconciles jars dropped into
  `mods/` by hand, so the user completes the pack and the launcher tracks it.
- **An event, not a return value.** The signal originates from four call sites at
  three different depths, one of which (import) can fire several times per
  install. Threading it through every return type would have touched far more
  code than emitting.
- **Project lookups are batched** for the import path (`POST /v1/mods`, up to 50
  ids) since a pack can block several files and the per-key rate limit is the
  binding constraint. The single-mod path uses one GET, which it needs anyway.

## Tradeoff accepted

Mods that previously installed via the reconstructed URL now require a manual
download. That is a functional regression in convenience and a deliberate one:
it's the author's stated wish and CurseForge's terms, and it's the only condition
under which a "download this yourself" prompt can exist at all.

## Parity note

Modrinth has no equivalent opt-out — every listed version is downloadable — so
this is a CurseForge-only path. `ContentVersion.downloadable` is hardcoded `true`
on the Modrinth side rather than left absent, so the frontend has one field to
render either way.
