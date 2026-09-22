## 1.0.5

### Added

- 2025–2026 tiered diminishing-returns formula for automatic memory allocation, preventing excessive RAM assignment on heavy modpacks
- Multi-segment memory budget composition bar with category tooltips visualizing memory distribution
- Tactical memory telemetry console with real-time status indicators (Optimal, Capped, Minimum Floor)
- Safe system RAM headroom limits protecting 4 GB, 8 GB, and 16 GB laptops and PCs from memory exhaustion

### Changed

- Refined telemetry interface to eliminate redundant bevel shadows on static readouts and display surfaces
- Restored crisp slate-gray framing borders across memory breakdown tiles and summary banners
- Balanced telemetry grid distribution to maintain clean multi-column alignment
- Unified memory number formatting to eliminate decimal rounding mismatches

### Fixed

- Excluded disabled mods, shader packs, and resource packs from memory allocation calculations
- Handled missing update platform releases gracefully with build-in-progress messaging
