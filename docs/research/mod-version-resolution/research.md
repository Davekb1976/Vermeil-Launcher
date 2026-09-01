# Mod version resolution

How the launcher decides *which* version/file of a mod to install, and how it
handles dependencies whose required version differs from what's installed.

## The reported symptom

Install mod A, then mod B which depends on A → an incompatible version of A ends
up in the instance, with no warning.

## Root cause

Dependency satisfaction was checked by **presence**, not version.

- Modrinth (`mod_install.rs`): a required dep already in `instance.json` was
  skipped, and the parent's exact `version_id` pin was discarded on that branch.
  The pin machinery worked — it just only ran for a *fresh* dep install.
- CurseForge (`cf_mod_install.rs`): same presence-only skip, additionally scoped
  to `source == "curseforge"`, so a Modrinth-installed copy of the same mod was
  invisible and got installed a second time (two jars in `mods/`).

Concrete: Sodium installed standalone at newest → install Iris, which pins an
older Sodium → pin thrown away, both mods present, game broken.

## Contributing defects found in the same area

- `apply_update` re-resolved "newest compatible" instead of installing the
  version its own check reported. On a dep held at a pin, this silently upgraded
  past the pin. Second independent route to the same symptom.
- CurseForge selection was `files[0]` with zero local validation. `releaseType`,
  `gameVersions`, `isAvailable`, and `fileDate` weren't even deserialized.
- `loader_type_id` returns `None` for an unmapped loader, and the `if let Some`
  around it **dropped the `modLoaderType` filter entirely** — every loader's
  files came back and `files[0]` could be a Forge jar for a Fabric instance.
- No release-channel filter on either source: an alpha published after the
  newest stable always won, because both lists are ordered by recency.
- Install and update detection used different "newest" rules on CF (`files[0]`
  vs `max_by_key(file_id)`), so the two could disagree.
- Download happened before the already-present check, so a redundant install
  left a new jar on disk with `instance.json` still describing the old one.
- Modrinth `dependency_type: "incompatible"` and CF `relationType: 5` were both
  dropped, so a declared conflict was invisible until launch failed.
- CF dep walk was one level deep — transitive deps were never installed — and it
  passed the *parent's* category down, dropping resource-pack and datapack deps
  into `mods/`.
- `ModEntry.pinned` existed and was never read by any code.

## API facts behind the design

Verified against
[Modrinth's version endpoint](https://docs.modrinth.com/api/operations/getprojectversions/)
and the [CurseForge REST API schema](https://docs.curseforge.com/rest-api/).
Content rephrased from those docs.

- **Neither source's dependency object carries a version range.** Modrinth gives
  `version_id` / `project_id` / `file_name` / `dependency_type`; CurseForge gives
  `modId` / `relationType`. So an exact pin is the strongest constraint available
  from an API, and CurseForge can't express even that.
- The only real range lives **inside the jar** — `fabric.mod.json`'s `depends`
  predicates and `mods.toml`'s `versionRange`. `services/loader_scan.rs` already
  opens jars and parses both forms; it currently extracts only the *loader*
  requirement and deliberately discards upper bounds.
- CurseForge files **do** carry `fileDate`. The old comment claiming otherwise
  described our struct, not the API.
- CurseForge has no loader field on a file: loader names share the
  `gameVersions` array with MC versions. `sortableGameVersions[].gameVersionTypeId`
  would be the "proper" discriminator but its values aren't documented per game,
  so classification is by shape instead (leading digit = MC version, known name =
  loader).
- Modrinth's `include_changelog` defaults to `true`. The endpoint runs once per
  mod per install *and* per update check.

## What the code now does

- Both sources prefer the stable release channel, falling back to beta/alpha only
  when nothing stable is compatible.
- CurseForge selection validates every candidate locally (`is_available`, MC
  version, loader when the file declares one) then takes the highest file id
  within the preferred channel. Detection and install share this one picker.
- Dependency satisfaction compares versions. A parent's pin that disagrees with
  what's installed produces a `version_conflict` issue naming both versions.
- A dep installed at an exact pin is marked `ModEntry.pinned`. The update checker
  skips pinned entries and `apply_update` refuses them; automatic resolution
  won't move a pinned version, only an explicit user choice will.
- Installs replace an existing entry in place: superseded file deleted, `enabled`
  and the `.disabled` filename convention carried across the swap.
- `apply_update` re-runs detection and passes the exact version to the installer.
- CF walk is recursive and routes each dep by its own `classId`.

## Known ceiling

Conflicts are **detected and reported**, not auto-resolved. Resolving requires
knowing every installed mod's accepted range, which no API exposes — so the
version picker is the manual escape hatch. Reading jar ranges via `loader_scan`
(extended to arbitrary mod ids and to keep upper bounds) is the upgrade path.

The `version_conflict` issue raised when an installed version is pinned can't
name *which* mod holds the pin without re-fetching every installed mod's
dependency list. Persisting the requiring project id on `ModEntry` at pin time
would make that free.
