# Archived companion-mod projects

These are fully built, compile-verified Fabric projects for **older 1.21.x eras**
that the launcher no longer ships:

| Project | Minecraft range | Cape hook |
|---------|-----------------|-----------|
| `1.21-1.21.1/` | 1.21–1.21.1 | feature-renderer, `@Redirect` `getSkin()` in `CapeLayer.render` |
| `1.21.2-1.21.4/` | 1.21.2–1.21.4 | render-state, `ResourceLocation` + single-arg `DynamicTexture` |
| `1.21.5-1.21.8/` | 1.21.5–1.21.8 | render-state, `DynamicTexture` label-ctor |
| `1.21.9-1.21.10/` | 1.21.9–1.21.10 | 26.x-shaped hook, `ResourceLocation` + `setFilter` + `Tickable` |
| `1.21.11/` | 1.21.11 | render-state (archived; now built by `companion-mod/stonecutter/`) |
| `26.1-26.2/` | 26.1–26.2 | render-state (archived; now built by `companion-mod/stonecutter/`) |

## Why they're here

Modern Fabric & NeoForge mod development has been unified into `companion-mod/stonecutter/` using Stonecraft and Stonecutter.
The older standalone Fabric projects were moved here to preserve their history and working configurations without cluttering active development.
The active companion mod targets are now:
- `companion-mod/stonecutter/`: Modern Fabric and NeoForge (1.21.11, 26.1, 26.2, 26.3)
- `companion-mod/forge/1.8.9/`: Legacy PvP Forge 1.8.9 (strictly isolated)

## Restoring one

1. Move it back: `git mv companion-mod/archive/fabric/<proj> companion-mod/fabric/<proj>`
2. Re-add it to CI: in `.github/workflows/mod-release.yml`, add its `gradlew` to the
   `chmod` line and add the matching `sed` + `(cd … && ./gradlew build)` step (JDK 21).
3. Re-add its versions to the launcher gate: `FABRIC_SUPPORTED` in
   `Vermeil/src-tauri/src/services/instance_cape.rs` (use the project's `mc_versions`).
4. Add its row back to the tables in `docs/DEVELOPMENT.md` and the `minecraft-mod` skill.
5. Build to confirm it still compiles against current mappings:
   `.\companion-mod\fabric\<proj>\gradlew.bat -p companion-mod\fabric\<proj> build`

The manifest entry is automatic once the project is back under `companion-mod/fabric/`.
