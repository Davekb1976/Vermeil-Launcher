# UI Modal Restraint & Dropdown Calibration Progress

## Implementation Checklist

- [x] **Audit All Modal Components**: Catalog every overlay modal across `src/modals/`, `src/components/`, and `src/screens/`.
- [x] **Remove Redundant Top-Right Close `[X]` Buttons**:
  - [x] `ChangeLoaderModal.tsx`
  - [x] `NoAccountModal.tsx`
  - [x] `CrashReportModal.tsx`
  - [x] `DependencyIssuesModal.tsx`
  - [x] `ManualDownloadModal.tsx`
  - [x] `CustomCapeEditor.tsx`
  - [x] `ModDetailModal.tsx`
  - [x] `ModpackDetailModal.tsx`
  - [x] `Settings.tsx` (channel rollback modal)
  - [x] `OnboardingWizard.tsx`
  - [x] `Home.tsx` (news article detail modal)
- [x] **Fix Dropdown Popover Positioning**:
  - [x] Add explicit `display: flex; justify-content: space-between; align-items: center; gap: 12px;` to `.setting-row` in `ChangeLoaderModal.tsx`.
  - [x] Wrap version trigger button in `position: relative; display: inline-flex; flex-shrink: 0;`.
  - [x] Anchor `.custom-select-panel` to `position: absolute; right: 0; top: calc(100% + 4px);`.
- [x] **Standardize Guidelines & Skills**:
  - [x] Update `AGENTS.md` with modal close restraint, dropdown anchoring invariant, and view taxonomy.
  - [x] Update `docs/UI.md` with Sections 9 and 10 in UI Restraint rules.
  - [x] Update `.agents/skills/add-screen/SKILL.md` and `.kiro/skills/add-screen/SKILL.md`.
  - [x] Create dedicated `.agents/skills/ui-restraint/SKILL.md` and `.kiro/skills/ui-restraint/SKILL.md`.
- [x] **Interactive Preview Showcase**:
  - [x] Update `C:\Users\Kylle\Downloads\_WEBSITE\WEBSITE\preview-modals.html`.
  - [x] Update artifact `preview-modals.html`.

## Verification Matrix

| Test Suite | Command | Result |
| :--- | :--- | :--- |
| TypeScript Compiler | `pnpm exec tsc --noEmit` | **Passed** (0 errors) |
| Frontend Production Build | `pnpm run build` | **Passed** (4.09s, zero warnings) |
| Backend Check | `cargo check` | **Passed** (zero warnings) |
