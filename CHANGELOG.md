## 1.2.0 (Experimental Build 1)

### Added

- Google Cloud Settings Sync: cross-device synchronization of General, Display, Sound, and Keybind preferences via Google Drive's sandboxed application data folder (`appDataFolder`) with zero telemetry and automatic local DPAPI token encryption
- Live instance options sync: automatically detects and synchronizes display options, FOV, frame rate limits, and VSync into active Minecraft instance configuration files (`options.txt`) across versions
- High-availability fallback to `latest.json` for GitHub release metadata and updater discovery

### Changed

- Uninstaller optimization: overhauled file cleanup to atomic directory staging and single-pass removal, drastically reducing uninstallation duration and dynamically calculating disk space to be freed on the confirmation screen

### Fixed

- Expanded click targets and enabled live visual refresh for in-game cape toggles on Forge 1.8.9
- Made companion mod in-game settings rows fully clickable and resolved double-click toggle reversion
- Eliminated horizontal layout overflow on the settings keybinds view
- Corrected status badge on Home screen to accurately reflect offline state when no Microsoft account is selected

### Documentation

- [Google Cloud Settings Sync Architecture](docs/research/google-cloud-sync/research.md): Technical specification, RFC 8252/7636 security model, Mermaid diagrams, and sandboxed storage flows
- [Uninstaller Optimization Architecture](docs/research/uninstaller-optimization/research.md): Single-pass directory cleanup pipeline, benchmark results, and safety isolation diagrams
