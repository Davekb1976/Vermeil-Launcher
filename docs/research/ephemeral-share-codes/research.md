# Ephemeral Instance Share Codes & Edge Blueprints

## Overview & Goal

Sharing Minecraft modpacks and customized instances traditionally requires exporting large multi-megabyte `.zip` or `.mrpack` archives, finding a third-party file host, or manually transmitting mod lists. 

**Ephemeral Instance Share Codes** in Vermeil solves this with a **zero-login, zero-telemetry, 1-click sharing pipeline**:
1. **Cloud Share Codes (`VML-XXXX-XXXX`)**: An 8-character human-friendly code that resolves in seconds, backed by a serverless Cloudflare Worker and D1 SQL database with a strict 3-minute self-expiring TTL.
2. **Serverless Offline Blueprints (`VML...`)**: A 100% self-contained alphanumeric string encoding the entire instance manifest using Base62 chunking over Zlib-compressed JSON, requiring zero servers, accounts, or databases.

---

## 1. Architectural Comparison: Legacy vs. Modern Cloudflare Edge Pipeline

```mermaid
flowchart TD
    subgraph LEGACY["LEGACY PIPELINE: Heavy Archives"]
        direction TB
        l_export["User shares instance"] --> l_choice{"Format?"}
        l_choice -->|Archive| l_zip["Export .zip / .mrpack<br/>50MB to 500MB JARs"]
        l_zip --> l_upload["Upload to host<br/>Drive, MediaFire, limits"]
        l_upload --> l_share["Send download link"]
        l_share --> l_friend["Friend downloads zip<br/>Extracts & resolves"]

        l_choice -->|Text| l_huge["Raw flat JSON<br/>1000+ chars string"]
        l_huge --> l_discord["Hits Discord limits<br/>Word-wrap breaks"]
        l_discord --> l_ui_clutter["Cluttered UI<br/>4 separate buttons"]
    end

    subgraph MODERN["CALIBRATED EDGE PIPELINE: Cloudflare Workers"]
        direction TB
        m_export["User clicks Share"] --> m_serialize["Extract Public Data<br/>Zlib + Base62"]
        m_serialize --> m_choice{"Method?"}

        m_choice -->|Cloud| m_worker["POST to Edge Worker<br/>Client attestation"]
        m_worker --> m_dedup{"In D1?"}
        m_dedup -->|Yes| m_cached_code["Return active code<br/>0 new D1 writes"]
        m_dedup -->|No| m_d1["Insert into D1<br/>180s auto-expiry"]
        m_cached_code --> m_copy["8-character code<br/>VML-XXXX-XXXX"]
        m_d1 --> m_copy

        m_choice -->|Offline| m_offline["Prepend VML prefix<br/>Self-contained string"]
        m_offline --> m_copy_offline["Fits in Discord chat<br/>0 server calls"]

        m_copy --> m_friend_import["Friend enters code<br/>in Import dialog"]
        m_copy_offline --> m_friend_import

        m_friend_import --> m_morph["State-Morphing Button<br/>Paste morphs to Clear"]
        m_morph --> m_cta["Progressive CTA<br/>Scan morphs to Import"]
        m_cta --> m_fetch["Direct CDN Download<br/>Modrinth & CurseForge<br/>Fast parallel fetch"]
    end

    style LEGACY fill:#1c1417,stroke:#ef4444,stroke-width:2px,color:#f4f3f6
    style MODERN fill:#121816,stroke:#10b981,stroke-width:2px,color:#f4f3f6
    style l_zip fill:#2a1b1f,stroke:#f87171,color:#f4f3f6
    style l_discord fill:#2a1b1f,stroke:#f87171,color:#f4f3f6
    style l_ui_clutter fill:#2a1b1f,stroke:#f87171,color:#f4f3f6
    style m_worker fill:#162420,stroke:#34d399,color:#f4f3f6
    style m_d1 fill:#162420,stroke:#34d399,color:#f4f3f6
    style m_morph fill:#162420,stroke:#34d399,color:#f4f3f6
    style m_cta fill:#162420,stroke:#34d399,color:#f4f3f6
    style m_fetch fill:#162420,stroke:#34d399,color:#f4f3f6
```

### Analysis of the Legacy Bottlenecks

1. **Bandwidth & Storage Bloat**:
   - Sharing a modest 100-mod instance as a `.zip` archive required packaging 150MB+ of binary jar files that already exist on public CDNs (Modrinth, CurseForge).
   - Users had to find third-party hosts or pay for file-sharing subscriptions, only to hit upload bandwidth ceilings or link expirations.
2. **Text Code Discord Limits & Formatting Corruption**:
   - Early string-based blueprint representations used uncompressed or flat JSON serialized into Base64.
   - For instances with 40+ mods, the string easily exceeded Discord's 2,000-character single-message ceiling, forcing users into multi-message pastes or `.txt` file attachments.
   - Base64 symbols (`+`, `/`, `=`) triggered markdown italics or required double-clicks that fractured across punctuation boundaries.
3. **UI Friction & Sizing Asymmetry**:
   - The legacy import screen presented separate `[Paste]` and `[Clear]` buttons with mismatched heights (26px small buttons beside a 32px text input), creating visual clutter and ragged layout baselines.
   - Separate `[Scan Code]` and `[Import Instance]` buttons competed for prominence, introducing ambiguity about the next user action.

---

## 2. End-to-End Pipeline Architecture

```mermaid
flowchart TD
    subgraph Export["Instance Export Pipeline"]
        A["Click Share Instance"] --> B["Serialize Manifest<br/>MC, loader, mods"]
        B --> C["Filter Public Meta<br/>No tokens, worlds, IPs"]
        C --> D["Compress Payload<br/>Zlib Best + Base62"]
        D --> E{"Mode?"}
        E -->|Offline| F["Prepend VML Prefix<br/>Copy to clipboard"]
        E -->|Cloud| G["POST /api/share<br/>to Edge Worker<br/>Attestation header"]
    end

    subgraph Edge["Serverless Edge Layer"]
        G --> H["Worker: Validate Header<br/>and Schema"]
        H --> I["Compute SHA-256<br/>of Payload"]
        I --> J{"In D1?"}
        J -->|Match| K["Return active code<br/>0 new D1 writes"]
        J -->|New| L["Generate Code<br/>Base62: A7K9-2P4M"]
        L --> M["Insert D1 Record<br/>expires in 180s"]
        M --> N["Prune Expired Codes<br/>DELETE past TTL"]
        N --> O["Respond 201 Created<br/>with JSON code"]
    end

    subgraph Import["Instance Import Pipeline"]
        P["Input code in Dialog<br/>Paste / Clear button"] --> Q{"Format?"}
        Q -->|Cloud| R["GET /api/share/:code<br/>Cache or D1 query"]
        R --> S["Fetch Edge Worker<br/>Cache hit: 0 D1 reads"]
        Q -->|Offline| T["Decode Base62 & Zlib<br/>64 KB cap + Adler32"]
        S --> T
        T --> U["Resolve Mod Meta<br/>Batch API queries"]
        U --> V["Render Preview<br/>CTA: Import Instance"]
        V --> W["Download & Stage<br/>Parallel CDN fetch<br/>Icon cache & pin"]
    end

    O -->|8-char code| P

    style Export fill:#1d1b24,stroke:#8b5cf6,stroke-width:2px,color:#f4f3f6
    style Edge fill:#181620,stroke:#f59e0b,stroke-width:2px,color:#f4f3f6
    style Import fill:#1d1b24,stroke:#10b981,stroke-width:2px,color:#f4f3f6
```

---

## 3. Blueprint Codec & Serialization

### Data Model (`ShareCodePayload`)
The blueprint data model represents the exact composition of an instance using minimal primitives:

```rust
pub struct ShareCodePayload {
    pub v: u8,                              // Format schema version (currently 3)
    pub name: String,                       // Instance display name
    pub mc: String,                         // Minecraft version (e.g., "1.21.1")
    pub loader: String,                     // Mod loader ("fabric", "forge", "neoforge", "quilt", "vanilla")
    pub loader_version: Option<String>,     // Specific loader build (e.g., "0.16.9")
    pub items: Vec<ShareItemTuple>,         // Compact item array
    pub bp: Option<BasePackRef>,            // Upstream modpack reference (if based on .mrpack / CF pack)
}
```

### Compact Item Tuples (`ShareItemTuple`)
To minimize uncompressed JSON footprint before zlib compression, items are stored as 5-element positional tuples rather than verbose struct maps:
```rust
pub struct ShareItemTuple(
    pub u8,      // 0 = Modrinth, 1 = CurseForge
    pub String,  // project_id (slug or numeric ID)
    pub String,  // version_id (release hash or file ID)
    pub u8,      // 0 = mod, 1 = shader, 2 = resourcepack
    pub bool,    // enabled status
);
```

### Compression & Base62 Encoding
1. **JSON Serialization**: Compact serde serialization (`serde_json::to_vec`).
2. **Zlib Best Compression**: `ZlibEncoder::new(Vec::new(), Compression::best())` achieves 65–85% compression ratios on mod manifests.
3. **Base62 Chunked Encoding**: Rather than Base64 (which includes `+`, `/`, and `=` padding characters that break word selection in Discord or browsers), the compressed bytes are converted into Base62 (`[0-9A-Za-z]`).
   - Double-clicking any part of the string in Discord, chat apps, or browsers selects the entire code cleanly without splitting on delimiters or triggering Markdown formatting.
4. **Header Identifier**: Prefixed with `VML` (e.g. `VML...` for offline codes, `VML-XXXX-XXXX` for cloud codes). Legacy `VLM`, `VML1`, and `VLM1` prefixes remain backward compatible.

---

## 4. Serverless Edge Relay (Cloudflare Workers + D1)

### Cloudflare Worker Responsibilities
The relay lives at `https://share.vermeillauncher.workers.dev` and performs 4 essential functions:

1. **Client Attestation Header**:
   - Every request from Vermeil includes `X-Vermeil-Client: vml_app_sec_...`.
   - Unauthorized scrapers, generic bots, or non-launcher requests are immediately rejected with `403 Forbidden` before querying the database.
2. **Payload Deduplication via SHA-256**:
   - When a user exports an instance, the worker computes `SHA-256(payload)`.
   - The worker executes `SELECT id, expires_at FROM share_codes WHERE payload_hash = ? AND expires_at > ?`.
   - If an identical payload was already exported and remains unexpired, the existing 8-character code is returned with `200 OK` (`deduplicated: true`). **Zero redundant rows are written to D1.**
3. **Strict 3-Minute Expiration (TTL)**:
   - Newly inserted codes have `expires_at = unix_now + 180`.
   - On every write operation, the worker performs opportunistic cleanup: `DELETE FROM share_codes WHERE expires_at < ?`.
   - Read requests (`GET /api/share/:code`) query `WHERE id = ? AND expires_at > ?`. Expired codes immediately return `404 Not Found`.
4. **Edge Cache Acceleration (`caches.default`)**:
   - GET responses set `Cache-Control: public, max-age=180`.
   - Successfully resolved codes are stored in Cloudflare's Edge Cache (`caches.default`). Repeated reads across multiple clients resolve at edge data centers with **0 D1 database reads**.

### D1 Database Schema
```sql
CREATE TABLE IF NOT EXISTS shares (
    code TEXT PRIMARY KEY,           -- 13-char code (e.g. 'VML-A7K9-2P4M')
    payload TEXT NOT NULL,           -- Compressed or compact JSON payload (<= 64 KB)
    content_hash TEXT NOT NULL,      -- SHA-256 hex string of the blueprint payload
    created_at INTEGER NOT NULL,     -- Unix epoch in seconds
    expires_at INTEGER NOT NULL      -- Unix epoch in seconds (created_at + 180)
);

CREATE INDEX IF NOT EXISTS idx_shares_expires ON shares (expires_at);
CREATE INDEX IF NOT EXISTS idx_shares_hash ON shares (content_hash);
```

---

## 5. Security & Privacy Boundary

### Strict Data Isolation
The blueprint generation process in `src-tauri/src/services/share_code.rs` explicitly serializes only public project identifiers.

| Data Category | Transmitted? | Rationale |
| :--- | :---: | :--- |
| **Minecraft Version & Loader** | **Yes** | Required to construct the game runtime environment. |
| **Mod / Shader / Pack IDs** | **Yes** | Public IDs from Modrinth (`api.modrinth.com`) and CurseForge (`api.curseforge.com`). |
| **Instance Display Name** | **Yes** | User-friendly label for the imported instance. |
| **Microsoft / Xbox Tokens** | **NEVER** | Kept in local OS encrypted storage (`accounts.json` / DPAPI). |
| **Player UUIDs & Gamertags** | **NEVER** | Instance blueprints are account-agnostic. |
| **World Saves (`saves/`)** | **NEVER** | Never included; blueprints configure environments, not game states. |
| **Multiplayer Servers (`servers.dat`)** | **NEVER** | Server IPs and saved connections are excluded. |
| **System Paths & Machine Specs** | **NEVER** | No local file paths or machine names are serialized. |

### Decompression Bomb Defense
To prevent denial-of-service via maliciously crafted compression payloads:
1. **Raw String Cap**: Offline code strings are capped at 16,384 characters (`MAX_CODE_CHARS`).
2. **Bounded Decompression**: The `ZlibDecoder` is wrapped with `std::io::Read::take(65_536)` (64 KB ceiling). Any payload expanding beyond 64 KB is terminated and rejected immediately.
3. **Integrity Validation**: Zlib Adler-32 checksums are strictly verified by `flate2`; tampered bytes cause instant decompression failure without crashing.

---

## 6. UI/UX Tactile Integration

The import interface adheres to Vermeil's **SloppyKeys** design system and UI restraint guidelines:

1. **State-Morphing Trailing Input Slot**:
   - Instead of separate `[Paste]` and `[Clear]` buttons, a single companion square button (32×32px, `var(--control-height-md)`) morphs dynamically:
     - Empty input &rarr; `<IconClipboard />` with `data-tip="Paste from clipboard"`.
     - Filled input &rarr; `<IconX />` with `data-tip="Clear input"`.
2. **Single Progressive CTA Button**:
   - The primary right-sidebar action button starts as `[Scan Code]`.
   - Once scanned and the live mod list preview is loaded, that exact same button morphs into `[Import Instance]`.
   - Modifying or clearing the input automatically resets the button state back to `[Scan Code]`.
3. **Companion Height Symmetry**:
   - Input field and trailing action button maintain exact height token parity (`--control-height-md` = 32px), with `align-self: stretch` to eliminate ragged boundaries.
