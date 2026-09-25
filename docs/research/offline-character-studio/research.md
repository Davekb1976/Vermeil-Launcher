# Offline Character Studio & Local Wardrobe Architecture

## 1. Overview & Problem Statement

Prior to this update, the **Skins & Capes** screen (`src/screens/Skins.tsx`) enforced a strict full-page lockout (`<Show when={account() && !account()!.is_offline} fallback={...}>`). If a user was playing in offline mode or had not yet linked an official Microsoft account, they were presented with an unstyled, empty void with a message stating *"Microsoft account required"*.

This lockout was overly restrictive:
1. **3D WebGL Character Studio** does not require network connectivity or Mojang authentication; it runs client-side in the webview using Three.js and `skinview3d`.
2. **Local Wardrobe Management** stores imported `.png` textures and `skins.json` manifests strictly on the local filesystem (`<data_dir>/skins/<account_id>/`).
3. **Custom In-Game Capes** are rendered client-side by Vermeil's companion mod (`companion-mod/`) through local IPC (`set_ingame_cape`), requiring no Mojang cloud involvement.

By decoupling local features from remote Mojang APIs, Vermeil transforms the Skins screen into an open, local-first **Character Studio** accessible to every player while clearly distinguishing local customization from official Mojang multiplayer sync.

---

## 2. Backend Command Decoupling (`src-tauri/src/commands/skins.rs`)

### 2.1 Account Resolution Hierarchy

Previously, all skin commands called `active_microsoft_account()`, which aborted with an error if the active account had `is_offline == true`.

We separated account lookup into two distinct tiers:

1. **`active_any_account()`**:
   - Inspects `accounts.json` and returns the active account profile (whether online or offline).
   - If no accounts file exists or no account is marked active, it synthesizes an ephemeral `"offline-guest"` profile.
   - Used for all filesystem-backed operations.

2. **`active_microsoft_account()`**:
   - Calls `active_any_account()`.
   - Verifies `!active.is_offline` and decrypts stored tokens from the operating system credential vault.
   - Reserved strictly for operations that hit Mojang's API gateway.

```rust
/// Look up the currently active account (Microsoft or offline). If no account
/// exists, falls back to a default guest profile so local skin & cape tools
/// remain accessible without forcing account setup.
fn active_any_account() -> Result<MinecraftProfile, String> {
    let accounts_path = paths::data_dir().join("accounts.json");
    if let Ok(raw) = fs::read_to_string(&accounts_path) {
        if let Ok(accounts) = serde_json::from_str::<Vec<MinecraftProfile>>(&raw) {
            if let Some(active) = accounts.into_iter().find(|a| a.active) {
                return Ok(active);
            }
        }
    }
    Ok(MinecraftProfile {
        id: "offline-guest".to_string(),
        name: "Guest".to_string(),
        access_token: String::new(),
        refresh_token: None,
        expires_at: 0,
        is_offline: true,
        skin_path: None,
        active: true,
    })
}
```

### 2.2 Command Dispatch Matrix

| Command | Target | Handler | Behavior for Offline / Guest |
| :--- | :--- | :--- | :--- |
| `get_skin_profile` | Mojang API | `active_any_account` | Returns `Ok(PlayerProfile { skins: [], capes: [] })` (no 401 error) |
| `list_local_skins` | Local disk | `active_any_account` | Lists skins in `<data>/skins/<id>/` |
| `add_local_skin` | Local disk | `active_any_account` | Writes `.png` and updates `skins.json` |
| `remove_local_skin` | Local disk | `active_any_account` | Deletes `.png` and unlinks from `skins.json` |
| `list_custom_capes` | Local disk | `active_any_account` | Lists capes in `<data>/capes/<id>/` |
| `save_custom_cape` | Local disk | `active_any_account` | Saves cape texture and transform metadata |
| `remove_custom_cape` | Local disk | `active_any_account` | Deletes custom cape files |
| `read_custom_cape_source` | Local disk | `active_any_account` | Reads original source image for re-editing |
| `upload_skin` | Mojang API | `active_microsoft_account` | Returns error: requires Microsoft account |
| `reset_skin` | Mojang API | `active_microsoft_account` | Returns error: requires Microsoft account |
| `equip_cape` / `unequip_cape` | Mojang API | `active_microsoft_account` | Returns error: requires Microsoft account |
| `sync_crafty_skins` | Crafty.gg | `active_microsoft_account` | Returns error: requires Microsoft account |

---

## 3. Frontend Architecture (`src/screens/Skins.tsx`)

### 3.1 Tactile Offline Banner

Instead of replacing the whole page, an offline account displays a slim, non-intrusive status banner directly above the Character Studio:

```tsx
<Show when={isOfflineAccount()}>
  <div class="skins-offline-banner">
    <div class="skins-offline-banner-content">
      <span class="tag-offline">OFFLINE PREVIEW</span>
      <span class="skins-offline-banner-text">
        Skins & capes rendered locally on this device. Official multiplayer sync requires a Microsoft account.
      </span>
    </div>
    <div class="skins-offline-actions">
      <button
        class="skins-banner-btn skins-banner-btn--primary tip-below"
        onClick={handleStartLogin}
        disabled={loggingIn()}
        data-tip="Sign in to sync skins and capes with Mojang"
      >
        <IconMicrosoft />
        <span>{loggingIn() ? "Signing in…" : "Sign in with Microsoft"}</span>
      </button>
      <button
        class="skins-banner-btn tip-below tip-right"
        onClick={() => setActiveScreen("account")}
        data-tip="Open Account screen"
      >
        <IconUser />
        <span>Manage Accounts</span>
      </button>
    </div>
  </div>
</Show>
```

### 3.2 3D Character Studio & WebGL Pipeline

- **Scene Mounting**: The Three.js canvas, ambient particle engine, hexagonal Figurine pedestal, and camera controls mount unconditionally.
- **Model Variant Switching**: The Classic (4px) vs. Slim (3px) segmented toggle switches `viewer.loadSkin(texture, { model })` instantly client-side without attempting a network upload.
- **Static 2-Tone CAD Mannequin Dummy Skins (`public/dummy_skin.png` & `public/dummy_skin_slim.png`)**: Instead of falling back to vanilla Steve or generating textures dynamically at runtime on a `<canvas>`, offline accounts without a selected preview skin display pre-baked 64×64 2-tone CAD mannequin PNG assets (`#6d628d` 1px outer border and `#110f17` dark void fill) with exact Classic (4px) and Slim (3px) arm UV coordinates.
- **Home Screen `CharacterStage` Sync & 2D `PlayerHead` Isolation**: Shared signals (`activeOfflineSkin` and `offlineDummyVariant` in `src/App.tsx`) synchronize the 3D player model across both the **Skins** screen (`Skins.tsx`) and the **Home** screen (`CharacterStage.tsx`), while keeping `activeSkinUrl` as `null` for offline accounts so 2D avatar badges (`PlayerHead.tsx` in the window titlebar and account list) always display the user's colored initial letter badge.
- **Local Wardrobe Equipping**: Clicking a local wardrobe card triggers `viewer.loadSkin` with a smooth 250ms crossfade (`setCanvasFading(true)`), updates `activeOfflineSkin`, and displays a toast confirming local preview.
- **Reset to Default Dummy**: Calling `handleReset` or deleting the active preview skin (`handleRemoveLocal`) for offline users resets the 3D viewer and Home stage back to the 2-tone dummy mannequin without modifying the 2D titlebar avatar badge.

### 3.3 Custom Cape Integration

- Custom capes designed in `CustomCapeEditor.tsx` are fully functional.
- Equipping a custom cape bakes the texture and dispatches `setIngameCape`, making it immediately visible in Minecraft via the companion mod.
- Mojang capes display a helpful inline hint clarifying that official server-side capes require a Microsoft account.

---

## 4. Design System Compliance & UI Restraint

- **Tokens**: Uses tactile tokens (`--surface-panel`, `--surface-raised`, `--bevel`, `--bevel-strong`, `--border`).
- **Affordance Restraint**: No redundant checkmarks or buttons; active wardrobe tiles use a 3px border and background tint.
- **Tooltip Protocol**: Zero native HTML `title` attributes; all hints strictly utilize `data-tip` with positioning helpers (`tip-below`, `tip-right`, `tip-left`).
- **Fluid Layout**: The offline banner uses flexbox with responsive wrapping (`@media (max-width: 900px)`), eliminating text clipping on compact windows.

---

## 5. Verification Matrix

| Test Case | Scenario | Expected Result | Status |
| :--- | :--- | :--- | :--- |
| **Guest / Offline Default** | Offline account with no preview skin | 3D Studio & Home stage render 2-tone CAD dummy mannequin; titlebar keeps initial badge | Pass |
| **Variant Toggle** | Toggle Classic (4px) ↔ Slim (3px) | `dummy_skin.png` ↔ `dummy_skin_slim.png` switches with aligned shoulder/hand UVs | Pass |
| **Local Import / Equip** | Import or select PNG skin when offline | Previewed on both Skins studio and Home 3D stage; titlebar keeps initial badge | Pass |
| **Delete / Reset Preview** | Delete active preview skin or click Reset | Reverts 3D models to 2-tone dummy mannequin; titlebar remains initial letter badge | Pass |
| **Custom Cape** | Create and equip custom cape | 3D model displays cape/elytra, companion mod receives cape strip | Pass |
| **Microsoft Login** | Click "Sign in with Microsoft" | Launches SISU auth window, refetches account on success | Pass |
| **Online Account** | Microsoft account active | Banner is hidden, full cloud sync enabled, Mojang capes active | Pass |
