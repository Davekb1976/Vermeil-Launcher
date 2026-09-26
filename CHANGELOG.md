## 1.4.0 (Experimental Build 1)

### Added

- 5-Theme Engine (Neon Aurora, Inferno, Stealth, Deep Ocean, Void) featuring tactical theme cards, signature color palettes, and theme-adaptive 3D master emblems
- Ephemeral instance share codes (`VML-XXXX-XXXX`) powered by Cloudflare Workers and D1 edge storage for serverless blueprint sharing
- Compatibility confirmation modal allowing manual override and force-installation of unverified or cross-version mods, resource packs, and shaders
- Dedicated manual pin controls in the Library toolbar and Pin Manager modal, replacing automatic pinning of newly created or imported instances

### Changed

- Replaced mod update buttons on instance cards with compact, aligned footer actions
- Regenerated high-resolution Windows (`.ico`) and Linux (`.png`) application icons across all desktop surfaces from the official 3D master emblem

### Fixed

- Eliminated hardcoded violet/purple accents across settings tags, account cards, security badges, and modpack version indicators to honor active theme colors
- Replaced harsh 8-bit oval background gradients on the loading screen with smooth multi-stop spherical atmospheric lighting, corner vignettes, and micro-dither noise
- Synchronized hidden dock trigger tab glow and center button glint shimmer with the active theme's accent palette

### Documentation

- [Ephemeral Instance Share Codes](docs/research/ephemeral-share-codes/research.md): Serverless blueprint compression, D1 edge relay architecture, and privacy models
