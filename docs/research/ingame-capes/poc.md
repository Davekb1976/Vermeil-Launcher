# In-game capes — PoC (done)

Proved the mechanism end-to-end before scaling to more versions.

## Established
- A client-side Fabric mod renders a local cape PNG on the player even with no Mojang cape.
- Static and animated (frame strip) both work.
- Live-reload: mod polls the cape files and applies changes (toggle / swap / speed) without a restart.
- Launcher integration: download-on-demand mod install + global cape dir + one on/off toggle.

## Distribution
- Mod jars are **not** bundled in the launcher and **not** committed. Published as GitHub release assets on `mod-v*` tags with a `companion-manifest.json`; launcher fetches the matching `(version, loader)` jar (SHA-1 verified) into the instance's `mods/`.

## Where it lives
- Modern multi-loader under `companion-mod/stonecutter/` (Fabric & NeoForge: 1.21.11, 26.1, 26.2, 26.3), and legacy Forge under `companion-mod/forge/1.8.9/`. Older standalone Fabric projects are archived under `companion-mod/archive/fabric/`.
