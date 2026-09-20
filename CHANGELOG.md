## 1.0.0 (Experimental Build 5)

### Added

- Historical skin synchronization in the Wardrobe via Crafty.gg's open player archive, allowing players to restore and re-equip previous skins with one click
- On-demand "Sync" action in the Wardrobe header and empty state with spinning reload indicator and rate-limit compliant on-device caching
- Automatic chronological dating (`Skin (Month Year)`) and metadata tagging for synced skins based on historical change records
- Comprehensive Crafty.gg third-party API integration and privacy disclosures in `PRIVACY.md`

### Changed

- Refined Wardrobe header layout to eliminate redundant panel title text and prevent button overlap in compact sidebars

### Fixed

- Fixed skin sync capping at 6 items by querying Crafty.gg's complete paginated `/skins` archive endpoint
