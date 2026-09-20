## 1.0.0

### Added

- Tactile SloppyKeys 3D design system adopted across the entire application with chunky keycap bevel buttons, framed panels, category badges, and custom drop shadows
- Overhauled 3D Character Studio featuring live interactive player model, animated elytra support, voxel ember particle stage, and custom cape designer
- Historical skin synchronization in the Wardrobe via Crafty.gg's open player archive, allowing players to restore and re-equip previous skins with one click
- Browse Modpacks modal with 4x3 grid layout, full detail viewer, category filters, and paginated discovery across Modrinth and CurseForge
- Dynamic real-time download speed limiter in Settings with live token-bucket throughput throttling
- Floating dock auto-hide behavior with bottom-centered tactile trigger zone and keycap press physics
- Configurable pagination dock positioning in Settings (bottom centered, left vertical, right vertical) with mouse wheel scroll mode keybind
- Managed Java runtime support with automatic detection and downloads from Adoptium (Java 8, 17, 21, 25)
- Support for all major mod loaders: Fabric (including Legacy Fabric), Quilt, NeoForge, and Forge
- In-game custom capes powered by optional companion client mod

### Changed

- Re-engineered instance card layout with flush square thumbnails, loader badges, and hover ping-pong marquee
- Streamlined settings screen into categorized 3-column card grid with instant search filtering
- Unified search layout across instance content management, modpacks, and downloads
- Optimized startup and engine performance with pre-seeded client jars, parallel pipelined downloads, and JVM heap tuning

### Fixed

- Resolved download failure toast deduplication and suppressed redundant alerts during manual CurseForge downloads
- Fixed layer occlusion in Settings where toggle switches rendered over active dropdown menus
- Hardened loader version validation, empty mod messaging, and modal keyboard navigation
- Fixed skin sync capping by querying Crafty.gg's complete paginated `/skins` archive
- Fixed overlapping UI elements in the Wardrobe header bar
