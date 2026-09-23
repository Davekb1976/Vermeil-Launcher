# Secure Credential Vault — Implementation Progress

Living document tracking the implementation and validation of Vermeil's secure credential vault and storage modernization.

---

## Scope & Problem Statement

- **Decouple Secrets from Metadata**: Eliminate storage of authentication tokens in `accounts.json`.
- **Eliminate Buffer Limit Issues**: Prevent Windows Credential Manager 512-byte overflow by using DPAPI (`Scope::User`).
- **Cross-Platform Parity**: Provide authenticated AES-256-GCM encryption on Linux/macOS.
- **Pure-Rust Toolchain**: Use RustCrypto (`aes-gcm = "0.11"`) to eliminate C/NASM build dependencies.
- **Durability & Power-Cut Safety**: Implement atomic file writes (`atomic_write`) with buffer syncing.
- **Zero-Downtime Migration**: Transparently migrate existing logged-in users on boot.

---

## Status Board

| Phase | Description | Status |
| :--- | :--- | :--- |
| **Phase 1: Cryptographic Engine** | Implement DPAPI on Windows and AES-256-GCM on Linux/macOS | ✅ Complete |
| **Phase 2: Atomic File Writer** | Implement `atomic_write` with `.tmp` staging and `sync_all` | ✅ Complete |
| **Phase 3: Vault Manager** | Dedicated `credentials.enc` vault operations | ✅ Complete |
| **Phase 4: Metadata Sanitization** | `#[serde(default, skip_serializing)]` to scrub tokens from `accounts.json` | ✅ Complete |
| **Phase 5: Silent Migration** | Zero-downtime migration pipeline in `load_accounts()` | ✅ Complete |
| **Phase 6: Google Cloud Hardening** | Upgraded `google_cloud.rs` to use `atomic_write` and `0600` permissions | ✅ Complete |
| **Phase 7: Pure-Rust Modernization** | Upgraded to RustCrypto `aes-gcm 0.11` with const-generic nonces | ✅ Complete |
| **Phase 8: Test Suite & Verification** | 49 unit tests passed, 0 compiler warnings, production bundle clean | ✅ Complete |

---

## Test Suite Coverage

- `util::credentials::tests::test_atomic_write_creates_valid_file`: Verifies atomic temp file creation, buffer flush, and rename integrity.
- `util::credentials::tests::test_encrypt_decrypt_roundtrip`: Verifies DPAPI/AEAD encryption and decryption fidelity.
- `util::credentials::tests::test_aes_gcm_aead_roundtrip`: Directly verifies AES-256-GCM authenticated encryption and decryption.
- `util::credentials::tests::test_vault_serialization_and_encryption_roundtrip`: Verifies vault dictionary serialization, encryption, disk persistence, and deserialization.
- `util::credentials::tests::test_offline_and_zero_tokens_unmodified`: Verifies passthrough for non-secret tokens.
- `commands::auth::tests::test_metadata_serialization_scrubs_tokens`: Verifies that `access_token` and `refresh_token` keys are completely omitted from JSON outputs.
- `commands::auth::tests::test_generate_offline_uuid`: Verifies deterministic offline UUID v3 generation.
