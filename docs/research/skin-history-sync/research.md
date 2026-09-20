# Historical Skin Synchronization (Crafty.gg API)

## Overview

Minecraft / Mojang does not officially offer a public endpoint listing the historical skins previously worn by an account; Mojang only serves the currently active skin texture. Community services like **Crafty.gg** passively index Minecraft session servers and skin updates over time to build player change logs.

Vermeil integrates with Crafty.gg's open community API on an **on-demand basis** (strictly when the user clicks "Sync" in the Wardrobe) to restore previous skins into the local offline library, enabling one-click re-equipping to Mojang.

## API Architecture

Crafty.gg exposes two key endpoints under `https://api.crafty.gg/api/v2`:

1. **Player Lookup**:
   `GET /api/v2/players/{username_or_uuid}`
   - Resolves Minecraft player profile.
   - Returns Crafty internal player ID (`data.id`) and an embedded preview of the latest 6 skins (`data.skins`).
   - Rate limit: `x-ratelimit-limit: 150` requests per window.
   - Requires browser-like `User-Agent` headers (Cloudflare gateway).

2. **Complete Skin Archive**:
   `GET /api/v2/players/{crafty_id}/skins?page={page}`
   - Takes the player's internal Crafty UUID returned by endpoint #1.
   - Returns paginated list of all historical skins worn by the player (`data: [...]`, `meta: { total, per_page: 15, last_page }`).
   - Each entry contains raw base64 PNG texture (`texture`), geometry flag (`slim: true/false`), and RFC3339 timestamps (`changed_at`, `created_at`).

## Local Deduplication & Storage

- Decoded base64 PNG bytes are hashed with SHA-1 to match Vermeil's local skin cache (`<data>/skins/<account>/<sha1>.png`).
- File writes are skipped if the `.png` already exists on disk.
- Library entries in `skins.json` match on `hash`:
  - Existing custom names are preserved.
  - Generic names are enriched with chronological labels (e.g. `Skin (Jun 2026)`).
  - New skins are appended, and the library is sorted descending by timestamp.

## Privacy & Rate Limit Compliance

- **Zero Background Telemetry**: Requests are strictly triggered manually by user interaction.
- **Minimal Data**: Only the player's Minecraft UUID is sent. No credentials, tokens, or personal identifiers are transmitted.
- **Rate Limit Safe**: Normal user query volume (1 request every few weeks) is orders of magnitude below the 150-request limit.
