## 1.0.0 (Experimental Build 3)

### Added

- Native Minecraft Quick Play singleplayer support in the Home "Continue Where You Left Off" station (instantly boots directly into the selected world on MC 1.20+)
- Complete SloppyKeys tactile rework of the first-run onboarding wizard featuring keycap progress stepping, active profile recognition, and a triple launch picker (Modpacks, Custom, Import)
- Intelligent Java runtime environment onboarding with automated Adoptium isolation, one-click system runtime auto-bind, and expandable slot management
- Pre-1.20 Quick Play version gating preventing JVM startup crashes and falling back gracefully to the main menu with helpful status feedback

### Changed

- Increased boot and loading screen progress bar height to 8px for grounded, tactile weight
- Hardened world folder path safety with strict path traversal rejection and on-disk verification before launch

### Fixed

- Resolved missing icons and image asset blocking in the standalone production `.exe` by whitelisting `http://asset.localhost` in Content Security Policy (CSP) and expanding local data asset scopes
- Added universal `onError` SVG fallback handlers across all instance cards, downloads, and mods tables preventing broken image icons
