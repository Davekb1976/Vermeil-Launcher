## 1.2.0 (Experimental Build 2)

### Added

- Independent Google Cloud session controls: separate local 'Sign Out' (keeps account authorization) and 'Disconnect' (full OAuth token revocation) actions
- Tactile Google OAuth authorization callback page matching Vermeil's dark UI design language with live status feedback

### Changed

- Updated Terms of Service and Privacy Policy with explicit hardware-dependent settings exclusion disclosures (RAM allocation, window dimensions, and Java paths remain strictly local)
- Standardized all repository and website legal documentation to canonical endpoints

### Fixed

- Prevented tooltip clipping on right-anchored cloud session action buttons using `tip-right`

### Documentation

- [Google Cloud Settings Sync Architecture](docs/research/google-cloud-sync/research.md): Technical specification, RFC 8252/7636 security model, Mermaid diagrams, and sandboxed storage flows
