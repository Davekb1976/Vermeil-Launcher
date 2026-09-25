# Ephemeral Instance Share Codes: Implementation & Verification Log

## Status

**Complete, Deployed & Validated.**
- End-to-end blueprint serialization, zlib compression, and Base62 encoding implemented and tested.
- Cloudflare Worker and D1 database deployed live to production (`https://share.vermeillauncher.workers.dev`).
- Worker-level SHA-256 payload deduplication, 180s TTL auto-expiry, and `X-Vermeil-Client` attestation verified.
- Client-side decompression bomb defense (16 KB string cap, 64 KB decompression ceiling) verified.
- State-morphing single-slot UI (Paste ↔ Clear) and single progressive CTA (Scan ↔ Import) implemented with strict SloppyKeys height symmetry.
- Zero TypeScript and Rust compilation warnings; 71 automated Rust tests passing (100%).

---

## IPC Interface & Surface Mapping

### Backend (`src-tauri/`)
- **Service Layer:** `src-tauri/src/services/share_code.rs`
  - `export_instance_share_code(instance_id, use_cloud)`: Builds manifest from `instance.json` and `mods/`, strips private fields, compresses via Zlib Best + Base62, optionally POSTs to Worker, returns code string.
  - `preview_share_code(code)`: Resolves 8-char cloud code via Worker GET or decodes offline Base62 zlib payload, batch-enriches mod metadata from Modrinth/CurseForge APIs, returns `ShareCodePreview`.
  - `import_share_code(code, custom_name)`: Resolves blueprint, creates instance directory, fetches missing mod files via parallel download pipeline, downloads cached instance icon, and auto-pins instance.
  - `resolve_code_payload(code)`: Unified resolver handling `VML-XXXX-XXXX`, `VML...`, and legacy `VLM`/`VML1` formats.
- **Commands:** `src-tauri/src/commands/cf_import.rs`
  - Exposes `export_instance_share_code`, `preview_share_code`, `import_share_code`.
- **Registration:** `src-tauri/src/lib.rs` -> Registered in `invoke_handler`.

### Frontend (`src/`)
- **IPC Wrappers:** `src/ipc/commands.ts`
  - `exportInstanceShareCode(instanceId, useCloud)`: Returns `{ code: string; is_cloud: boolean; expires_in_seconds?: number }`.
  - `previewShareCode(code)`: Returns `ShareCodePreview` with resolved mod items and loader info.
  - `importShareCode(code, customName)`: Creates the new instance.
- **UI Surfaces:**
  - `src/modals/ImportInstance.tsx`: Mode 2 ("Share Code / Blueprint"):
    - Single-slot trailing input button: `<IconClipboard />` when empty ↔ `<IconX />` when filled.
    - Single progressive CTA: transitions from `[Scan Code]` to `[Import Instance]` once preview is resolved.
    - Live mod item preview table with loader pills, category tags, and author metadata.
  - `src/screens/InstanceMods.tsx`:
    - "Share Code" action in top toolbar: generates cloud code, copies to clipboard, and triggers tactile toast notification.

---

## Test Verification

### Automated Backend Tests
Run via `cargo test --lib services::share_code`:
1. `test_base62_roundtrip_arbitrary_lengths`: Validates arbitrary byte array encoding and decoding across varying length boundaries without precision loss.
2. `test_filename_and_url_sanitizers`: Verifies that path traversal characters (`../`, `..\\`) and untrusted host domains in mod URLs are rejected or sanitized.
3. `test_tampered_share_code_rejected`: Confirms that tampered Base62 strings or corrupted zlib checksums fail gracefully without panicking.
4. `test_cloudflare_worker_live_resolution`: Validates live round-trip resolution against `https://share.vermeillauncher.workers.dev` (tests authentication gating, code formatting, and 200/404 handling).
5. `test_enrich_real_modrinth_version`: Tests batch metadata enrichment against Modrinth's production API.
6. `test_share_code_roundtrip_and_preview`: Verifies complete roundtrip: serialization &rarr; compression &rarr; decoding &rarr; preview generation.
7. `test_columnar_v3_custom_instance_roundtrip`: Verifies v3 positional item tuple serialization for custom instances containing mixed Modrinth and CurseForge mods.

### Live Edge Worker Verification
Executed against `https://share.vermeillauncher.workers.dev`:
- **Unauthorized Request**: `POST` without `X-Vermeil-Client` &rarr; `403 Forbidden` (`{"error":"Unauthorized client"}`).
- **Authorized Upload**: `POST` with valid payload &rarr; `201 Created` (`{"code":"...","expires_in":180}`).
- **Deduplication Check**: Second `POST` with identical payload &rarr; `200 OK` (`{"code":"...","deduplicated":true}`).
- **Edge Cache Read**: `GET /api/share/:code` &rarr; `200 OK` (served via `cf-cache-status: HIT`, 0 D1 reads).

### Validation Matrix
| Check | Command | Result |
| :--- | :--- | :--- |
| Rust Unit Tests | `cargo test --lib services::share_code` | **7 passed (100%)** |
| Overall Rust Test Suite | `cargo test` | **71 passed (100%)** |
| Rust Compilation | `cargo check` | **0 errors, 0 warnings** |
| TypeScript Checking | `pnpm exec tsc --noEmit` | **0 errors** |
| Frontend Production Build | `pnpm run build` | **Clean Vite build (3.79s)** |
