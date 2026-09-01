# Progress

## 2026-08-31 · version + dependency resolution correctness (done)

- Traced the "installs the wrong version" report to presence-only dependency
  satisfaction on both sources; full findings in `research.md`.
- Modrinth: dep walk now compares versions, not presence. A parent's exact
  `version_id` pin that disagrees with the installed version raises a
  `version_conflict` issue; `dependency_type: "incompatible"` raises `conflict`.
  `find_preferred_version` prefers the `release` channel across all three passes.
- CurseForge: `files[0]` replaced by `find_preferred_file` — validates
  `isAvailable`, MC version, and loader locally, prefers `releaseType == 1`, then
  highest (monotonic) file id. Now deserializes `releaseType`, `fileDate`,
  `gameVersions`, `isAvailable`, and `relationType 5`.
- `cf_mod_install.rs` rewritten to mirror the Modrinth shape: one recursive
  resolver replaces the non-recursive `install_cf_dep`, which also fixed
  transitive deps never installing and deps being routed by the parent's category
  instead of their own `classId`. Dedupe no longer scoped to
  `source == "curseforge"`, so a cross-published mod can't be installed twice.
- Key decision: pinned versions are **held**, not auto-resolved. `ModEntry.pinned`
  (previously dead) now marks deps installed at an exact pin; the update checker
  skips them and `apply_update` refuses them. Only an explicit version choice
  moves a pinned entry. Rationale: no API exposes a version *range*, so silently
  downgrading to satisfy one mod could break another.
- `apply_update` rewritten: re-runs detection, passes the exact version to the
  installer. Deleted its manual file removal / entry stripping / `enabled`
  restore — installs now replace entries in place and handle all three.
- CurseForge's unmapped-loader case no longer silently drops the `modLoaderType`
  filter without a trace; it warns, and local validation is the real guard.
- Modrinth version fetches now send `include_changelog=false` (endpoint defaults
  it true; runs once per mod per install and per update check).
- Verified: `cargo test --lib` 23 passed (18 new covering channel preference,
  loader rejection, availability, MC-version matching, `classId` routing, and
  CurseForge's `gameVersions` classification); `cargo check` and `pnpm run build`
  clean with zero warnings.
- Not verified on hardware: no launcher run from this shell. Needs a real install
  of a pinned-dependency pair (e.g. Iris + Sodium) to confirm the conflict modal
  copy reads correctly.

## 2026-08-31 · expandable card + version picker (done)

- New IPC: `get_mod_versions` / `get_cf_mod_files` both return one normalized
  `ContentVersion[]` (id, name, channel, game_versions, loaders, filename, size,
  date_published, compatible, recommended). Neither existed before — the two
  version-list services were only reachable from other services.
- Key decision: `compatible` and `recommended` are computed in Rust by the same
  functions the installer uses (`is_version_compatible` / `is_file_compatible`,
  extracted from the two pickers). The frontend never re-implements
  compatibility, so the list can't disagree with what an install accepts.
- Version lists are fetched **unfiltered** so the picker can offer "show all" and
  mark incompatible entries, rather than hiding them with no explanation. Capped
  at 100 entries to bound the DOM.
- Both install commands gained an optional exact version (`versionId` / `fileId`).
  Plain Install button = automatic resolution, unchanged; the picker = explicit
  override, which is also the documented escape hatch for a version conflict.
- Card expands via `.card--expanded { grid-column: 1 / -1 }` — inside the grid on
  purpose. Verified against `lib/gridPageSize.ts`: columns come from grid width,
  rows from `.content` height minus the grid's top offset, so a taller grid child
  changes neither and the page size holds. A panel above the grid would move the
  grid's top edge and refetch.
- One real hazard found and closed: expanding can introduce a scrollbar, which
  narrows the grid enough to cross a column threshold. The re-search effect now
  swallows a page-size change while a card is expanded, reading `expandedId`
  untracked so collapsing doesn't itself reset to page 1.
- Picker panel renders through a `<Portal>` (fixed position from the trigger
  rect) because `.card` is `overflow: hidden`; reuses `CreateCustom.tsx`'s rect
  math and the existing `.custom-dropdown-options--floating` styling.
- Pop-open animation: `grid-column` and intrinsic height can't be transitioned,
  so the motion is a scale-with-overshoot on the detail panel plus a staggered
  rise of its rows. Disabled under `prefers-reduced-motion`.
- List logic extracted to `lib/versionPick.ts` (filter / default / resolve
  selection) with `versionPick.selfcheck.ts` — all cases pass, `npx tsx`, same
  pattern as `contentVersion.selfcheck.ts`.
- Verified: self-checks pass, `cargo check` and `pnpm run build` clean, zero
  warnings.
- Not verified on hardware: the expand animation, the Portal panel's placement
  near the viewport edge, and the scrollbar-threshold case all need a real
  launcher run. Linux (WebKitGTK) needs its own look — overlay scrollbars there
  make the scrollbar case behave differently than on WebView2.
