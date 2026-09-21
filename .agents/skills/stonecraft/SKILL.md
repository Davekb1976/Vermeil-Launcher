---
name: stonecraft
description: MUST USE when working on Minecraft mods in companion-mod/stonecutter/
metadata:
  version: "2.1"
---

# Working with Stonecraft and Stonecutter in Vermeil

## Architecture Overview

The Vermeil companion mod uses a dual architecture:
1. **Modern Multi-Loader (`companion-mod/stonecutter/`)**:
   - Handled via **Stonecraft 1.13.1** + **Stonecutter 0.9.8** + **Architectury Loom**.
   - Supports modern Minecraft releases across **Fabric** and **NeoForge** (e.g. 26.1, 26.2, 26.3, 1.21.11).
   - Shared Java codebase with Stonecutter conditional preprocessing comments (`//? if fabric`, `//? if neoforge`).
   - Single command matrix compilation via `chiseledBuildAndCollect`.
2. **Legacy PvP Forge 1.8.9 (`companion-mod/forge/1.8.9/`) — STRICTLY ISOLATED**:
   - Standalone legacy toolchain: Java 8, Gradle 3.1, ForgeGradle 2.1, MCP mappings (`stable_22`), and an ASM Coremod (`AbstractClientPlayer.getLocationCape` redirect).
   - **PERMANENT RULE**: NEVER attempt to import, merge, or unify Forge 1.8.9 into Stonecraft/Stonecutter. Stonecraft's internal pipeline (`Java.kt`, `Dependencies.kt`) hardcodes Java 17+ and Mojang official mappings (which Mojang only published for 1.14.4+). Forge 1.8.9 must remain completely independent in `companion-mod/forge/1.8.9/`.

---

## Toolchain & Dev Environment

- **JDK 25** (Eclipse Adoptium Temurin 25.0.3+9):
  The launcher host environment requires Java 25 for Minecraft 26.x builds.
  Before running Gradle tasks in PowerShell, ensure `JAVA_HOME` is set:
  ```powershell
  $env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-25.0.3.9-hotspot"
  ```
- **Gradle Execution**:
  Always pass `-p companion-mod\stonecutter` when running the wrapper from the repository root:
  ```powershell
  .\companion-mod\stonecutter\gradlew.bat -p companion-mod\stonecutter <task>
  ```
- **Canonical VCS Version**:
  The active project committed to git MUST always be the declared `vcsVersion` in `settings.gradle.kts` (currently `26.3-fabric`).

---

## Matrix Model & Supported Targets

The matrix is defined in `companion-mod/stonecutter/settings.gradle.kts`:
```kotlin
stonecutter {
    centralScript = "build.gradle.kts"
    kotlinController = true
    shared {
        fun mc(version: String, vararg loaders: String) {
            for (it in loaders) version("$version-$it", version)
        }

        mc("26.1", "fabric", "neoforge")
        mc("26.2", "fabric", "neoforge")
        mc("26.3", "fabric", "neoforge")

        vcsVersion = "26.3-fabric"
    }
    create(rootProject)
}
```

Dependency manifests live in `companion-mod/stonecutter/versions/dependencies/<version>.properties`.

---

## Preprocessor Comments — Special Care

Stonecutter uses comments to control source branches across loaders and Minecraft versions:
- `//? if fabric {` ... `//? }`
- `//? if neoforge {` ... `//? }`
- `//? if >=26.2 {` ... `//? }`

**DO NOT ASSUME THAT COMMENTED CODE IS DEAD CODE.**
Commented lines may be active in another version-loader target node. Never delete or hand-edit Stonecutter guard comments to silence compiler errors in the currently active project.

---

## Target Workflow (Switching & Single-Target Verification)

Shared `src/` reflects the currently active target node.

### 1. Switch to a target
To work on, diagnose, or run a specific version-loader target:
```powershell
.\companion-mod\stonecutter\gradlew.bat -p companion-mod\stonecutter "Set active project to <version>-<loader>"
```
Examples:
- `.\companion-mod\stonecutter\gradlew.bat -p companion-mod\stonecutter "Set active project to 26.3-fabric"`
- `.\companion-mod\stonecutter\gradlew.bat -p companion-mod\stonecutter "Set active project to 26.3-neoforge"`

### 2. Verify the active target
```powershell
.\companion-mod\stonecutter\gradlew.bat -p companion-mod\stonecutter buildActive
```

### 3. Run client in development
To smoke-test the active target in-game with Vermeil cape rendering:
```powershell
.\companion-mod\stonecutter\gradlew.bat -p companion-mod\stonecutter runClient
```
*Note: In dev mode, the cape directory defaults to `run/vermeil/`. Sync the active cape texture from `$env:LOCALAPPDATA\Vermeil\companion\cape\cape.png` into `companion-mod/stonecutter/run/vermeil/cape.png` before launching.*

### 4. Reset to canonical project
Always reset after completing target-specific work:
```powershell
.\companion-mod\stonecutter\gradlew.bat -p companion-mod\stonecutter "Reset active project"
```

---

## Full-Matrix Build & Collection

To compile and collect all jars across the entire matrix (Fabric + NeoForge across all configured versions):
```powershell
.\companion-mod\stonecutter\gradlew.bat -p companion-mod\stonecutter chiseledBuildAndCollect
```
Artifacts are emitted to:
`companion-mod/stonecutter/build/libs/`
- `vermeil-fabric-<modVersion>+mc<version>.jar`
- `vermeil-neoforge-<modVersion>+mc<version>.jar`

---

## Adding a New Minecraft Version

1. **Verify Loader Dependencies**:
   - Fabric Loader & Fabric API version on https://fabricmc.net/develop or Modrinth.
   - NeoForge version on https://maven.neoforged.net/releases/net/neoforged/neoforge/.
2. **Add Dependency Manifest**:
   - Create `companion-mod/stonecutter/versions/dependencies/<version>.properties`.
   - Specify `minecraft_version`, `loader_version`, `fabric_version`, and `neoforge_version`.
3. **Declare in `settings.gradle.kts`**:
   - Add `mc("<version>", "fabric", "neoforge")` to the `stonecutter.shared` block.
   - If it is the new primary version, update `vcsVersion = "<version>-fabric"`.
4. **Compile & Test**:
   - Switch to `<version>-fabric`, run `buildActive`.
   - Switch to `<version>-neoforge`, run `buildActive`.
   - Reset active project: `"Reset active project"`.
   - Verify full matrix: `chiseledBuildAndCollect`.

---

## Verification & Handover Rules

1. Never commit while an alternate version or loader is active; run `"Reset active project"` so `vcsVersion` is checked in.
2. Ensure `chiseledBuildAndCollect` exits with code 0.
3. Keep `.agents/skills/stonecraft/SKILL.md` and `.kiro/skills/stonecraft/SKILL.md` in sync.
4. Forge 1.8.9 remains in `companion-mod/forge/1.8.9/` forever.
