## 1.3.0 (Experimental Build 3)

### Added

- Official dual-channel update engine supporting seamless switching between Stable and Experimental release channels
- Dynamic updater endpoint routing in Rust querying high-speed Fastly CDN manifests with zero GitHub API rate limits
- Bidirectional channel switching with version-comparator rollback support
- Tactile rollback confirmation modal reassuring full data and instance preservation when returning to Stable
- Library dual-shelf hierarchy separating Pinned quick-launch instances from the main library collection
- High-concurrency instance management with live category filtering (All, Modded, Vanilla, Pinned) and batch deletion
- Shared game data cleanup option in Storage Management for removing unreferenced Minecraft engine assets and loader libraries
- Interactive 3D Character Studio unlocked for offline accounts and guests with local skin wardrobe, 3D model controls, and companion mod cape designer
- Pre-baked 2-tone CAD mannequin dummy skins (`Classic` 4px and `Slim` 3px) for offline accounts across both the Character Studio and Home screen 3D stage
- Tactile offline preview banner with quick Microsoft authentication and account management shortcuts
- Dedicated About & Release Control tab in Settings with aligned layout grid

### Changed

- Eliminated blocking single-threaded NSIS file crawls (`${GetSize}`) during post-install updates in favor of $O(1)$ `EstimatedSize` registry preservation so updates finish instantaneously regardless of installed modpack/asset size
- Optimized background storage footprint calculation (`paths::dir_size`) to read cached `WIN32_FIND_DATAW` attributes via `DirEntry::metadata()` with symlink/junction guards
- Defaulted manual `.exe` upgrade wizard (`PageReinstall`) to in-place binary replacement (`Do not uninstall`) so manual upgrades do not invoke `uninstall.exe` by default
- Replaced external Google Fonts (`Oswald`) with high-performance native system font stacks for zero layout shifts and improved startup speed
- Refactored updater service to execute strictly through typed IPC boundaries without direct plugin calls
- Standardized Library instance cards with tactile 3D hover lift and minimalist icon-only pin keycaps
- Replaced distorted cube icon with authentic Vermeil emblem in the Library empty state
- Overhauled modal dialog architecture across all overlay modals to enforce single-point footer dismissal and eliminate redundant top-right close buttons
- Calibrated dropdown popover anchoring and flex row constraints across setting rows to eliminate floating panel displacement
- Replaced full-page Microsoft account lockout on Skins screen with a graceful local-first studio experience
- Enabled local variant switching (Classic ↔ Slim) and wardrobe previewing without requiring Mojang API uploads

### Fixed

- Eliminated race conditions, missing `jvm.cfg`, and `jimage.dll` errors during rapid concurrent instance creation via atomic staging and single-flight mutex synchronization
- Isolated Forge and NeoForge installer execution to dedicated scratch directories to prevent launch collisions
- Gated Google Cloud OAuth verification links behind a single-use local loopback endpoint with cryptographic `state` CSRF verification and strict security headers
- Preserved offline account initial letter badges in the window titlebar when previewing, resetting, or deleting local skins
- Defaulted updater channel selection to Experimental when running on pre-release builds
- Handled pre-release manifest 404s gracefully as up-to-date states instead of surfacing false errors
- Normalized release notes URLs in the update banner to eliminate double-`v` prefix tag resolution issues
- Short-circuited duplicate Windows Registry writes and log noise when `EstimatedSize` is unchanged

### Documentation

- [Dual-Channel Release & Update Architecture](docs/research/dual-channel-updater/research.md): Dynamic endpoint routing, Fastly CDN manifest synchronization, and cryptographic rollback mechanics
- [Library Architecture & Parallel Deletion](docs/research/library-architecture/research.md): High-concurrency instance unlinking, single-pass settings consolidation, and dual-shelf hierarchy
- [Concurrent Runtime Provisioning Architecture](docs/research/concurrent-runtime-provisioning/research.md): Single-flight Java synchronization, atomic extraction staging, structural JRE validation, and loader installer scratch isolation
- [UI Modal Restraint & Popover Anchoring](docs/research/ui-modal-restraint/research.md): Single-point footer dismissal, prohibition of redundant top-right close buttons, and dropdown anchoring invariants
- [Offline Character Studio & Local Wardrobe](docs/research/offline-character-studio/research.md): Decoupled local wardrobe management, 2-tone CAD mannequin dummy skins, 3D WebGL studio viewing, and tactile offline status banner
- [Google Cloud Settings Sync](docs/research/google-cloud-sync/research.md): Single-use local loopback gate, cryptographic CSRF `state` validation (`RFC 8252 §8.9`), and DPAPI encrypted storage
- [NSIS Installer & Uninstaller Optimization](docs/research/uninstaller-optimization/research.md): $O(1)$ update `EstimatedSize` preservation, atomic bulk deletion, and zero-syscall directory sizing
