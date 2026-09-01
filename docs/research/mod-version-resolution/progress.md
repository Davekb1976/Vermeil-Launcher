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
