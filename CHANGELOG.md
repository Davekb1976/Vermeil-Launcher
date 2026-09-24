## 1.2.0

### Added

- Isolated encrypted credential vault (`credentials.enc`) decoupling sensitive authentication tokens from public account metadata
- Cross-platform cryptographic security using Windows DPAPI and pure-Rust authenticated AES-256-GCM (`aes-gcm 0.11`) on Linux/macOS
- Crash-safe atomic file writing (`atomic_write`) with physical buffer synchronization and Windows file-lock retry backoff
- Zero-telemetry Google Drive settings backup and restore using sandboxed `appDataFolder`
- Independent Google Cloud session controls with separate local Sign Out and full OAuth Disconnect
- Tactile Google OAuth authorization callback landing page with live status feedback and auto-closing tab handler
- Animated theme sway indicator for cloud synchronization status in the header
- High-speed NSIS uninstaller bulk deletion with native tree unlinking, instant trash renaming, and dynamic disk footprint reporting
- Client-tuned GC presets (Client G1GC, Generational ZGC, Adaptive Shenandoah) with hardware-tier heap calibration
- Persistent dual-ledger playtime and activity tracking surviving instance deletions
- Single-pass NBT and JSON per-world playtime tracking on Continue Hero card, 2x2 grid, and Worlds manager tab

### Changed

- Completely omitted `access_token` and `refresh_token` keys from `accounts.json`, storing strictly clean profile metadata
- Upgraded Google Cloud refresh token storage to use atomic writes and Unix `0600` file permission hardening
- Modernized Settings layout with categorized section panels and live instance options synchronization
- Standardized all repository and website legal documentation with explicit hardware-dependent settings exclusions

### Fixed

- Handled antivirus scanner file locks on Windows via exponential backoff retries during atomic renames
- Eliminated horizontal scrollbar overflow on the Settings keybinds tab
- Prevented tooltip clipping on right-anchored cloud session action buttons using `tip-right`
- Resolved click target sizing and toggle state synchronization in companion mod settings
- Fixed lifetime playtime and last active reset bug when deleting instances

### Documentation

- [Secure Credential Vault Architecture](docs/research/secure-credentials-vault/research.md): Technical specification, security models, Mermaid architecture diagrams, and atomic I/O guarantees
- [Google Cloud Settings Sync Architecture](docs/research/google-cloud-sync/research.md): RFC 8252/7636 security model, sandboxed storage flows, and privacy policy disclosures
- [Windows Uninstaller Optimization](docs/research/uninstaller-optimization/research.md): High-speed bulk directory deletion, native tree unlinking, and dynamic disk footprint reporting
- [Client GC Calibration Architecture](docs/research/client-gc-calibration/research.md): Modern client garbage collection presets and initial heap calibration across hardware tiers
- [Persistent Lifetime Telemetry Architecture](docs/research/lifetime-telemetry/research.md): Dual-ledger activity persistence, monotonic playtime tracking, and single-pass NBT world telemetry
