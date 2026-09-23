# Privacy Policy

Vermeil is a local-first Minecraft launcher. It runs entirely on your computer and has no servers operated by Vermeil itself.

## What Vermeil does NOT do

- Vermeil does not collect telemetry, analytics, crash reports, or any other usage data.
- Vermeil does not have an account system. There is no Vermeil account to sign up for.
- Vermeil does not phone home for any reason.
- Vermeil does not sell, share, or transmit your data to anyone.

## Data stored on your device

Vermeil keeps everything locally under `%LOCALAPPDATA%\Vermeil` (Windows) or `~/.local/share/Vermeil` (Linux). This includes:

- Instance configurations and settings
- Mod, resource pack, and shader files you install
- Game logs from previous play sessions
- Your Microsoft account access token and refresh token, stored in `accounts.json` so you don't have to sign in every launch
- Your Google Cloud settings sync token (encrypted at rest via Windows DPAPI in `google_cloud.enc`) if Google Cloud sync is enabled
- Java runtimes that Vermeil downloaded for you
- Game assets, libraries, and version metadata cached from Mojang's servers

You can delete this folder at any time. The launcher's NSIS uninstaller offers to delete it for you on Windows.

## Third-party services Vermeil talks to

Using Vermeil means making HTTPS requests to the following providers. Vermeil sends only what each service requires to do its job. You are subject to each provider's own privacy policy:

| Service | Why Vermeil contacts it | What's sent |
|---|---|---|
| Microsoft / Xbox Live (`login.microsoftonline.com`, `xboxlive.com`) | Account authentication for online play | Your standard OAuth credentials |
| Mojang / Minecraft Services (`api.minecraftservices.com`, `launchermeta.mojang.com`, `resources.download.minecraft.net`, `textures.minecraft.net`) | Validate your account, download game files, fetch version manifests, fetch your skin and cape textures | Authentication tokens and standard requests |
| Modrinth (`api.modrinth.com`, `cdn.modrinth.com`) | Search and download mods, resource packs, shaders, modpacks | The search queries you make |
| CurseForge (`api.curseforge.com`, `edge.forgecdn.net`) | Search and download CurseForge content (only if enabled) | The search queries you make |
| Adoptium (`api.adoptium.net`) | Download Java runtimes when needed | None |
| Fabric / Quilt / NeoForge / Forge metadata servers | Download mod loader files | None |
| Crafty.gg (`api.crafty.gg`) | On-demand historical skin synchronization (only when you click "Sync" in the Wardrobe) | Your Minecraft account UUID (no credentials or personal data) |
| GitHub (`github.com`, `objects.githubusercontent.com`) | Check for and download Vermeil updates | None |
| Google OAuth & Google Drive (`accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com`) | Optional cross-device settings backup and restore (only when you click "Sign in with Google") | Non-hardware settings payload (General, Display, Sound, Keybinds) stored in isolated `appDataFolder`; your OAuth token |

## Google Cloud Settings Sync (Google Drive App Data Sandbox)

Vermeil provides an optional feature to synchronize launcher preferences across devices using Google Drive's sandboxed Application Data Folder (`https://www.googleapis.com/auth/drive.appdata`).

### Privacy and Isolation Guarantees:
- **Sandbox-Only Access:** The `drive.appdata` scope restricts Vermeil strictly to an isolated, hidden application folder managed by Google Drive. **Vermeil cannot see, list, read, modify, or delete any of your personal Google Drive documents, files, folders, spreadsheets, photos, or emails.**
- **No Telemetry or Intermediary Servers:** All communication occurs directly between your local Vermeil client and Google's official OAuth and Drive API endpoints over HTTPS. Vermeil operates no intermediary backend servers, telemetry endpoints, or cloud databases.
- **Hardware-Specific Data Filtering:** To prevent configuration conflicts across devices with different displays or memory capacities, hardware-dependent settings (including RAM allocation limits, window dimensions, window maximization state, custom Java executable paths, and mouse sensitivity) are **never** uploaded to Google Drive. Only portable preferences (General launcher toggles, Video options like VSync/FPS caps/FOV, Sound volume levels, and Keybind mappings) are synchronized.
- **Token Security:** On Windows, your Google OAuth refresh token is encrypted at rest in `%LOCALAPPDATA%\Vermeil\google_cloud.enc` using Windows DPAPI (`Scope::User`), tying the encryption key directly to your active Windows logon session. On Linux, tokens rely on restricted file permissions (`0600`) within your user data directory.
- **User Control (Sign Out vs. Disconnect):**
  - **Sign Out:** Removes the local encrypted token and stops background synchronization on the current device, while retaining authorization in your Google Account for frictionless reconnects.
  - **Disconnect:** Sends an authenticated revocation request directly to Google's revocation endpoint (`POST https://oauth2.googleapis.com/revoke`), unlinking Vermeil, deleting the OAuth grant from your Google Account ("Third-party apps & services with access to your account"), and purging all local credentials.
- **Google API Services User Data Policy Compliance:** Vermeil's use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements. Your data is never sold, shared, used for advertising, or used to train machine learning models.

## Microsoft account tokens

When you sign in with a Microsoft account, Vermeil receives an access token from Microsoft that authorizes you to play Minecraft. This token (and a refresh token used to mint new access tokens) is stored on your device in `accounts.json` along with your Minecraft player UUID and username. On Windows, tokens are encrypted at rest using DPAPI (tied to your Windows user session). On Linux, tokens rely on operating system file permissions in your user data directory. The token's scope is limited to Xbox Live and Minecraft Services — it does not grant access to your Microsoft email, OneDrive, or any other Microsoft property.

You can sign out at any time from the Account screen. Signing out removes the tokens from your device. Vermeil does not separately revoke the token on Microsoft's servers — the token expires naturally, or you can revoke it manually from your Microsoft account settings.

## Open source

Vermeil's source code is public. You can review exactly what data is read, sent, and stored by reading the source at [https://github.com/Davekb1976/Vermeil-Launcher](https://github.com/Davekb1976/Vermeil-Launcher).

## Changes & Contact

This Privacy Policy is also published on the web at [https://vermeillauncher.app/privacy.html](https://vermeillauncher.app/privacy.html).

This is a solo project. For security-sensitive issues or vulnerability reporting, please use [GitHub Security Advisories](https://github.com/Davekb1976/Vermeil-Launcher/security) or open an issue on the repository.
