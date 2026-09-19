## 0.9.0

### Added

- Unified sequential FIFO download and installation queue across modpacks, individual mods, resource packs, shaders, and updates
- Dedicated Downloads screen with live active progress card, true chronological "Next in queue" list, cancel controls, and persistent download history
- Tactile 3D redesign: chunky keycap buttons, recessed sunken wells, framed section panels, and custom tactile tooltips
- Character Studio with square voxel ember particle background and overhauled cape designer
- Instance mod loader and version switching directly from the instance settings tab
- Quick-pin dock with keycap press physics and full pin manager modal
- Browse modpacks overhaul with 4x3 card grid, pagination island, and detailed preview modal
- Queue-advancing download toast notifications and permanent floating dock active counter badge
- Standardized tactile 3D slider components with live drag feedback across all settings and volume controls
- Hover marquee for long instance card badges and version tags
- Custom setup station with live preview and animated enchanted glint

### Changed

- Pipelined modpack downloads and zip extractions with in-memory archive validation for high speed and data integrity
- Batching CurseForge dependency walks and Modrinth metadata resolution to prevent 429 rate limit errors
- Launcher Preferences redesigned into a balanced 3-column responsive card grid
- News grid updated to a 4x3 responsive card layout with dedicated reader modal
- Optimized Java runtime extraction and pre-seeded client jars

### Fixed

- Fixed modpack install hash drift failures where valid archive jars were rejected due to metadata divergence
- Fixed race conditions on instance manifest writes by enforcing atomic sequential installation
- Fixed layout alignment in Launcher Preferences where "Check for updates" left empty space on the right
- Fixed modpack card clipping, tooltip overflows, and modal overlay occlusion
- Fixed freeze on instance navigation and library card clicks
