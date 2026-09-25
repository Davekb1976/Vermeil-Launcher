---
name: ui-restraint
description: Master rules and patterns for Vermeil UI development, SloppyKeys tactile design, modal dialog restraint, dropdown anchoring, button bevels, and component layout invariants.
---

# UI Restraint & Tactile Component Guidelines

This skill documents the design system, layout invariants, and Ponytail restraint principles for creating and editing UI components, screens, and modals in Vermeil.

---

## 1. The Ponytail UI Ladder (Necessity Test)

The Ponytail ladder (*the best code is the code never written*) applies equally to pixels:
1. **Does this visual cue need to exist at all?** (YAGNI)
2. **Is state already communicated by another affordance?** (If a card's selected state is already shown by a 3px accent left border, colored outline, and background tint, do NOT add a checkmark box or badge).
3. **Can the interaction be handled by existing controls?** (If clicking the card performs the action, do not embed redundant "Select" or "Choose" buttons).
4. **Is it boring, clean, and restrained?** Boring over clever. Fewest elements possible.

---

## 2. Modal Dialog Restraint: Ban on Redundant Top-Right [X] Buttons

In overlay dialogs (`.modal-overlay` / `.modal`), **NEVER add a top-right `modal-close` `[X]` button when explicit footer dismiss actions already exist** (`Cancel`, `Close`, `Got it`, `Dismiss`, `Skip setup`), along with backdrop click and `Escape` key handling.

### Rationale:
- **Redundant Affordance**: Two close buttons on the same dialog violates single-point dismissal.
- **Tooltip Clipping Bugs**: Top-right close buttons with `data-tip="Close"` frequently clip outside the window or modal header boundary.
- **Header Cleanliness**: Modal headers should showcase concise category tag badges and titles, unencumbered by redundant dismiss widgets.

### Approved Modal Header Pattern:
```tsx
<div class="modal-header">
  <div class="modal-header-left">
    <span class="card-section-tag tag-general">CATEGORY</span>
    <div>
      <div class="modal-title">Dialog Title</div>
      <div class="modal-subtitle">Supporting description</div>
    </div>
  </div>
  {/* NO top-right close [X] button here */}
</div>
```

---

## 3. Dropdown & Popover Anchoring Invariant

When placing dropdown menus, version selectors, or custom select panels inside setting rows (`.setting-row`) or cards:

1. **Flex Row Enforcement**: The row container MUST enforce flex row alignment:
   ```css
   display: flex;
   align-items: center;
   justify-content: space-between;
   gap: 12px;
   ```
   *(Ensure `.setting-row` is placed inside `.card-section-body` or has inline flex styling so it does not collapse into `display: block`)*.

2. **Trigger Relative Wrapper**: The trigger button must be wrapped in a dedicated relative container:
   ```html
   <div class="setting-control" style="position: relative; display: inline-flex; flex-shrink: 0;">
     <button class="btn btn--sm">
       <span>Current Value</span>
       <IconChevronDown />
     </button>
     
     {/* Panel anchored directly to wrapper */}
     <div class="custom-select-panel" style="position: absolute; right: 0; top: calc(100% + 4px); z-index: 100; min-width: 100%;">
       ...
     </div>
   </div>
   ```

3. **Avoid the Displaced Dropdown Bug**:
   If `.setting-row` collapses into block display, the title sits on top, the control drops to a new line at 100% width with the button pinned left, and an absolutely positioned panel with `right: 0` anchors to the far right edge of the dialog, floating far away from the trigger button.

---

## 4. SloppyKeys 3D Bevel Tokens (`--bevel`, `--bevel-strong`)

In SloppyKeys and Vermeil, `--bevel` represents the mechanical bevel of a physical keycap or pushable button.

### When to use `--bevel`:
- **Action Buttons & Triggers**: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost:active`, icon buttons that perform actions.
- **Interactive Keycaps & Chips**: Physical hotkey pills (`F1`/`F2` pills), clickable channel pills (`.channel-pill.active`), selectable mode chips.
- **Interactive Inputs**: Square checkboxes (`.check-box`).
- **Clickable Cards that Press Down**: Only cards with explicit click handlers and physical `:active` depression (`transform: translateY(1px)`).

### When NEVER to use `--bevel`:
- **Informational / Telemetry Plates**: Setting rows, telemetry cards, telemetry plates, and info boxes are non-clickable display surfaces.
- **Data Grid Cells & Table Rows**: Cells inside a data grid or recessed well (`#0f0e13`) must be flat tiles with hairline borders (`1px solid var(--border)` / `#23202f`), subtle backgrounds, and hover tints—never button bevels.
- **Status Badges & Category Tags**: Badges (`[BASE]`, `[OPTIMAL]`, `Fabric`, version badges) are metadata labels, NOT keys. They must be flat with hairline borders and soft background tints.
- **Footers, Headers & Banners**: Summary rows, calculation footers, and progress banners are static readouts. Use hairline dividers (`border-top: 1px solid var(--border)`).

**The Gold Rule**: *If the user cannot click and physically depress the element to execute an action or toggle state, it MUST NOT have a bevel shadow.*

---

## 5. Tactile Tooltips (`data-tip`) & Ban on Native `title`

- **NEVER use the native HTML `title="..."` attribute anywhere.** Native `title` triggers the browser/OS default tooltip popup that clashes with Vermeil's tactile design.
- **ALWAYS use Vermeil's tactile tooltip system with `data-tip="..."`.**
  - **Positioning Classes**:
    - Default (centered above element): `data-tip="..."`
    - Below element: `class="... tip-below" data-tip="..."`
    - Left-anchored: `class="... tip-left" data-tip="..."`
    - Right-anchored: `class="... tip-right" data-tip="..."` (prevents right-edge viewport clipping)
    - Bottom-right: `class="... tip-below tip-right" data-tip="..."`
    - Bottom-left: `class="... tip-below tip-left" data-tip="..."`
- **Restraint Rule**: Only add `data-tip` to discrete interactive affordances (icon buttons, status badges, chips). Never place `data-tip` on large containers (e.g. full cards, panels, or telemetry plates) or buttons that already have clear visible text.

---

## 6. Semantics: Radio Tabs vs. Checkboxes

- **Mutually Exclusive Choices (1-of-N)**: Choosing loaders, selecting import format (`.mrpack` vs `.zip`), picking release channels (`stable` vs `experimental`).
  - **Pattern**: Tab / radio cards with `.selected`, 3px colored left border, and soft background tint.
  - **Rule**: **NEVER put a square checkbox (`.check`, `<IconCheck>`) on a single-select card.** Checkboxes universally signify multi-select.
- **Multi-Selection (0-to-N)**: Bulk mod selection, instance pinning (up to 5 instances).
  - **Pattern**: Dedicated square checkbox (`.check-box`), placed cleanly in an aligned column with dedicated gutter spacing.

---

## 7. Screen vs. Modal Architectural Taxonomy

Do NOT assume a component in `src/modals/` is an overlay dialog:
- **Full-Page Screens**: Rendered in the main workspace view inside `<div class="content">` via `App.tsx` `<Show when={activeScreen() === "name"}>`. Examples: `CreateCustom.tsx` (`create-custom`), `ImportInstance.tsx` (`create-import`), `BrowseModpacks.tsx` (`create-modpack`). They feature back navigation (`← Back to Setup`), not popup backdrops.
- **True Overlay Modals**: Mounted at the App root level or wrapped in `.modal-overlay`, controlled by independent signals or events:
  - `ChangeLoaderModal`
  - `NoAccountModal`
  - `CrashReportModal`
  - `DependencyIssuesModal`
  - `ManualDownloadModal`
  - `PinInstancesModal`
  - `JavaChooserModal`
  - `OnboardingWizard`
  - `CustomCapeEditor`
  - `ModDetailModal` / `ModpackDetailModal`

---

## 8. State-Morphing Single-Slot Controls (No Duplicate Action Buttons)

Never stack duplicate, redundant, or opposing action buttons side-by-side (e.g. separate `[Paste]` and `[Clear]` buttons next to an input field, or duplicate `[Scan Code]` and `[Import Instance]` buttons).

### Core Invariants:
1. **Input Trailing Slot (Paste ↔ Clear)**:
   - When the input field is empty: render a single `<IconClipboard />` icon button (`data-tip="Paste from clipboard"`).
   - When text is present: that exact same button slot morphs into `<IconX />` (`data-tip="Clear code"`).
   - Never render two adjacent buttons where one clears and one pastes.
2. **Sequential Pipeline Slot (Scan ↔ Import / Analyze ↔ Execute)**:
   - Only one primary call-to-action button should exist for sequential multi-step operations.
   - Stage 1 (unverified / unscanned): Button label is `[Scan Code]` with `<IconSearch />`.
   - Stage 2 (verified / preview loaded): That exact same button morphs into `[Import Instance]` with `<IconCheck />`.
   - Modifying or clearing the input resets the state back to Stage 1 automatically.
   - Do NOT place a duplicate "Scan" button in the input field when the primary action button already performs that transition.

---

## 9. Companion Sizing & Control Height Symmetry (No Ragged Edges)

When creating controls that sit beside each other in a group, input bar, or toolbar:

### 1. The Canonical Height Tokens
- `--control-height-sm: 26px;` — Dense tables, compact dropdowns, small pill tags.
- `--control-height-md: 32px;` — **Default standard** for `.field-control`, regular buttons `.btn` / `.btn--md`, search inputs, and standard dropdowns.
- `--control-height-lg: 40px;` — Large modal action buttons, primary wizard CTAs.

### 2. Sibling Height Parity Rule
- Sibling controls in the same row MUST share the same height token.
- **NEVER** place a `.btn--sm` (26px) next to a `.field-control` (32px).
- **NEVER** mix `.btn--sm`, `.btn--md`, and `.btn--lg` in the same horizontal flex row or action group.

### 3. Overriding `.btn` `align-self: start`
- The base `.btn` CSS rule contains `align-self: start;` to prevent accidental vertical ballooning in flex containers.
- When an adjacent button is meant to stretch or align flush with a `.field-control`, you MUST explicitly override this:
  ```css
  height: var(--control-height-md);
  align-self: stretch;
  ```

### 4. Square Companion Buttons Pattern
For icon-only buttons placed beside an input field (e.g. Paste, Clear, Browse, Reveal):
```tsx
<button
  type="button"
  class="btn btn--neutral tip-left"
  data-tip="Action"
  style="display: flex; align-items: center; justify-content: center; width: var(--control-height-md); height: var(--control-height-md); min-width: var(--control-height-md); padding: 0; align-self: stretch;"
>
  <IconComponent />
</button>
```
This guarantees an exact 32×32 square keycap that aligns flush with the text box with zero vertical offset or height mismatch.

