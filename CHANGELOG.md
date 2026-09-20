## 0.9.0 (Experimental Build 2)

### Added

- Interactive 3D Character Stage on Home with natural idle look-around and walking animations
- Continue Station hero hub showing last-played world details and screenshots
- Expanded Continue sub-grid with a 2x2 layout providing 4 quick-launch and placeholder slots
- System-wide tactile tooltip system (`data-tip`) replacing native browser popups
- Microsoft brand mark badges on active accounts and telemetry status chips
- Archive import redesign supporting both Modrinth (.mrpack) and CurseForge (.zip) packages
- Tactical identity player profile card with live playtime counters and session telemetry

### Changed

- High-speed Forge and NeoForge loader installation pipeline (~85% faster) using async Tokio dependency pre-fetching, NTFS zero-copy directory junctions, and C1 client JIT compiler flags
- Replaced base64 IPC image payloads with disk asset protocol URLs for near-zero memory footprint
- Optimized IPC data serialization and game process log streaming buffers
- Streamlined import navigation and styled active download count badges as onyx keycaps

### Fixed

- Resolved missing modpack icons and loader badges in download history and installed mod cards
- Fixed real-time playtime counter updating when closing active game sessions
- Fixed instance detail views failing to refresh after mod count modifications
- Expanded asset protocol permissions to safely load cached application data
- Hardened drop listener cleanup and tab validation on archive import
