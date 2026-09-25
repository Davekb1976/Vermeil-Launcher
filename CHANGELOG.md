## 1.3.1

### Added

- Bidirectional Google Cloud synchronization for cumulative `Playtime` and `Last Active` with monotonic high-water mark protection so fresh installations never reset cloud play history
- Automatic background cloud synchronization on game launch, game exit, and launcher startup
- Coalesced background cloud sync queue that merges rapid setting toggles into a single non-overlapping Drive upload reusing the active OAuth access token

### Changed

- Formatted the Home screen `Last Active` telemetry readout as a fixed-width ISO calendar date (`YYYY-MM-DD`) instead of relative minutes so the readout remains accurate and visually aligned across sessions
- Reduced redundant Google Drive API lookups during cloud connect, restore, and startup reconciliation by passing resolved file IDs and preloaded backup payloads through the sync pipeline

### Fixed

- Activated restored Google Cloud preferences (`Auto-hide Dock`, pagination dock position, download toasts, custom keybinds, Discord Rich Presence, and download speed limits) immediately in live runtime signals without requiring a launcher restart
- Prevented stale frontend settings snapshots from overwriting newer `lifetime_play_seconds` and `last_active_at` counters on disk

### Documentation

- [Google Cloud Settings Sync](docs/research/google-cloud-sync/research.md): Bidirectional playtime high-water mark reconciliation, coalesced background upload queue, and live runtime signal activation
