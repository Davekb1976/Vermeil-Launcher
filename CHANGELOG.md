## 0.8.0

### Added

- Adaptive RAM breakdown on instance settings — shows exactly why the formula picked that value (Base, Loader runtime, mod count, resource packs, shaders)
- Chunky bevel + hover lift on all buttons, category pills, and toggles — unified physical feel across the entire UI
- Per-tab colors — each navigation tab has its own identity color when active
- Segmented plate tab design replacing the old underline tabs
- Create-instance flow redesigned as full-page screens instead of modal popups
- Modpack browser uses a card grid with adaptive page sizing (fills rows at any window size)
- Modpack pagination uses the floating dock page slider instead of inline buttons
- Companion badge now has an accent border for visibility

### Changed

- Dropdowns use the custom styled component everywhere (removed native `<select>` elements)
- All inline hex colors and pixel font sizes replaced with design tokens
- Legacy CSS classes removed: `.btn-accent`, `.btn-ghost`, `.control-select`, `.search-input`, `.install-btn`, `.mod-card` container, `.inst-name`, `.inst-meta`
- Mod cards migrated to canonical `.card .card--mod` vocabulary
- Settings sub-section labels use a shared `.section-label--sub` class
- Titlebar logo removed (title text is sufficient)
- Toggle thumb uses a muted tone instead of white, with a glow on hover
- Account card duplicate CSS consolidated to one definition

### Fixed

- Empty version box in Browse now truly means "any version" for resource packs and shaders
- Filter dropdown height mismatch in installed/browse control rows
- Adaptive memory toggle lag — now uses optimistic state, responds instantly
- Rapid double-toggling of adaptive memory no longer drops the second click
- Manual RAM slider no longer jumps when switching from automatic mode
- Modpack search passes the dynamic page size so the grid fills completely
- Installed badge shows correctly on modpack cards after install
- CSS lint warnings cleared (standard `line-clamp`, removed empty rulesets)
- PostCSS bumped to 8.5.26 to resolve path-traversal security advisories
