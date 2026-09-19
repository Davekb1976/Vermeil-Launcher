---
name: add-screen
description: Add a new full-page screen/view to the launcher UI. Use when creating a new page, adding a navigation pill to the floating dock, or implementing a new top-level view.
---

# Adding a New Screen

Follow this sequence when adding a new full-page view.

## 1. Create the Screen Component

File: `src/screens/<Name>.tsx`

```typescript
import { Component } from "solid-js";

const ScreenName: Component = () => {
  return (
    <div class="screen-enter">
      {/* Screen content */}
    </div>
  );
};

export default ScreenName;
```

Rules: one screen per file, PascalCase name matches filename, wrap in `screen-enter` div, default export.

## 2. Add to Screen Type Union

File: `src/App.tsx` — add to the `Screen` type union.

## 3. Import the Component

File: `src/App.tsx` — add the import.

## 4. Add the Show Conditional

File: `src/App.tsx` — inside `<div class="content">`:

```tsx
<Show when={activeScreen() === "new-screen"}><NewScreen /></Show>
```

## 5. Add Screen Title

File: `src/App.tsx` — in `screenTitles` record.

## 6. Add Dock Entry (if applicable)

File: `src/components/FloatingDock.tsx` — navigation pill calling `setActiveScreen()`. (Note: Vermeil uses a floating bottom dock, there is no sidebar).

## 7. Add Styles (if needed)

File: `src/styles/screens.css` (or relevant modular CSS file in `src/styles/`) — use existing CSS design tokens (`var(--token)`).

## 8. UI Affordances & The Necessity Test (Restraint over Clutter)

Before adding buttons, badges, checkboxes, or visual indicators to any screen, modal, or card, apply the **Necessity Test**:

- **The Single Affordance Rule**: If an interactive card or plate already communicates its active/selected state through a colored outline, 3px left border, and background tint, **never add a floating checkbox or checkmark icon to it**. One clear affordance is superior to three stacked on top of each other.
- **Radio Tabs vs. Checkboxes**: Mutually exclusive 1-of-N choices (e.g. loader selection, import platform selection) are **tab / radio cards**, NOT checkboxes. Never put a square checkbox (`.check`) or `<IconCheck>` on a single-select card. Checkboxes are strictly for multi-selection (0 to N items).
- **Button Necessity**: Before adding a button, ask: *is the whole card or row already clickable?* If clicking the card selects or opens it, do not embed redundant "Select" or "Choose" buttons.
- **Badge Restraint**: Badges are for concise, non-obvious metadata (`.mrpack`, `.zip`, `Fabric`, `1.20.1`). Never add badges that repeat what is already stated in the title or communicate state already visible from a color tint.
- **Spatial Flow**: Never use absolute positioning (`position: absolute; top: 8px; right: 8px;`) that collides with header tags, titles, or badges. Flow items naturally with flexbox/grid and explicit `gap`.
- **Stay Within Theme Without Overdoing It**: Adhere strictly to the established SloppyKeys tokens (`--bevel`, `--surface-panel`, `--surface-raised`, `#0f0e13` wells, hairline borders). Do not invent novel decorative doodads, corner stickers, or unneeded containers. Boring, clean, and restrained beats busy and cluttered every time.

## Verification

- `cargo check` passes (zero warnings)
- `pnpm exec tsc --noEmit` / `pnpm run build` passes
- Screen renders when navigated to
- Dock highlights correct item
- Titlebar shows correct title
- `screen-enter` animation plays
- No console errors
