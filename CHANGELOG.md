## 1.0.3

### Changed

- Reworked Discord Rich Presence into an event-driven reactive state machine with immediate toggle synchronization and zero background polling
- Cleaned up presence typography with human-friendly loader labels, mod counts, and dedicated idle state
- Hardened Discord Rich Presence IPC with protocol boundary validation, length constraints, and non-blocking asynchronous dispatch

### Fixed

- Resolved Discord Rich Presence requiring an app restart to detect settings changes
- Fixed active Minecraft gameplay being lost if Discord connected mid-game or after launch
- Aligned presence asset keys with Discord Developer Portal uploads to prevent asset resolution glitches
