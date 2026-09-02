## 0.8.4

### Added

- Mod detail view — click any Browse result to see its full description and stats, plus a version list. Pick a specific version to install, or leave the Install button to resolve the newest compatible one
- Modpack installs can be cancelled. Cancel stops the install and removes the partial instance; the X beside it now only hides the popup and lets the install continue
- Content whose author disabled third-party downloads now opens a dialog linking to its CurseForge page, with the exact file name to look for, instead of failing with a generic download error. Modpack imports install everything else and list what to fetch by hand

### Fixed

- Dependencies are resolved by version rather than presence. Installing a mod that needs a specific build of something already installed no longer leaves an incompatible pair with no warning — the mismatch is reported, and a build held for another mod is marked "held" on its card
- Both sources now prefer stable releases over newer alpha and beta builds
- CurseForge file selection is validated locally instead of trusting the API's first result, so a wrong-loader or unavailable file can no longer be picked
- Installing a specific CurseForge version installs that exact file instead of occasionally substituting a different one
- CurseForge dependencies now install recursively, and each lands in the folder matching its own content type instead of the parent's
- Applying an update installs exactly the version the check reported, and refuses to move a version another installed mod depends on
- Switching a mod's version replaces the old jar instead of leaving both in the mods folder
- Declared mod conflicts are surfaced instead of silently ignored
- Installing a mod no longer sends you back to page 1 of Browse
- Typing in Browse search no longer fires a duplicate request on every keystroke
- Two modpack installs at once no longer overwrite each other's temporary download
- Cancelling an instance creation no longer broke every later download until the launcher was restarted
- A failed CurseForge profile import no longer leaves a broken instance in the library
