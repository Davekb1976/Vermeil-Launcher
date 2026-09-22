## 1.1.1

### Added

- Real-time disk footprint synchronization (`EstimatedSize`) across all modpack installations, instance deletions, Java updates, and app exit events

### Changed

- Guarded background storage calculations with an atomic concurrency flag to prevent redundant disk I/O

### Fixed

- Resolved hardcoded version badge in the onboarding wizard to dynamically display the active app release version
- Fixed offline profile divider line clipping and text overlapping in the onboarding dialog
