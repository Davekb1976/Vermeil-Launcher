# Concurrent Runtime Provisioning & Loader Installer Synchronization — Progress Board

Living progress tracker for the single-flight Java synchronization, atomic extraction staging, and loader installer scratch isolation overhaul.

---

## Work Items & Status

| Track | Task | Status | Notes |
| :--- | :--- | :---: | :--- |
| **Backend** | Single-flight `JAVA_INSTALL_MUTEX` in `services::java` | ✅ Done | Serializes concurrent runtime downloads and extractions across tasks |
| **Backend** | Isolated atomic staging via `.staging-jdk-<major>-<uuid>` | ✅ Done | Completely prevents in-flight unzipping from being observed or launched |
| **Backend** | Readiness sentinel `.vermeil_ready` | ✅ Done | Written after 100% extraction; guarantees runtime completion |
| **Backend** | Structural integrity validator `find_valid_java_in` | ✅ Done | Verifies `java.exe` AND (`jvm.cfg` \| `modules` \| `rt.jar`) |
| **Backend** | Loader installer scratch mutex `INSTALLER_LOCK` | ✅ Done | Serializes headless installer runs in shared scratch directories |
| **Backend** | Fast-path skip for waiting loader instances | ✅ Done | Subsequent instances detect `.{loader}-installed` and return in 0ms |
| **Backend** | Failed installer scratch cleanup | ✅ Done | Purges scratch directory on error to prevent broken state inheritance |
| **Backend** | Consolidate Java download code to `java::ensure_java_major` | ✅ Done | Eliminated 70 lines of duplicate extraction logic in `launch.rs` |
| **Backend** | Shared recursive directory copy `paths::copy_dir_all` | ✅ Done | Deduplicated `copy_dir_all` across `instance_service.rs` and `paths.rs` |
| **Backend** | Dedicated unit test coverage | ✅ Done | Unit tests for version parsing, sentinel recognition, and invalid rejection |
| **Quality** | Zero warnings compiler check (`cargo check`) | ✅ Done | Passes with 0 warnings |
| **Quality** | Full test suite execution (`cargo test`) | ✅ Done | 63 / 63 unit tests pass |
| **Quality** | Frontend typecheck & bundle build | ✅ Done | `tsc --noEmit` and `vite build` complete with 0 errors |

---

## Test Suite Coverage

- `services::java::tests::test_parse_java_version`: Validates parsing of modern (`21.0.6`) and legacy (`1.8.0_412`) Adoptium version strings.
- `services::java::tests::test_valid_java_detection_with_sentinel`: Validates that a directory containing a dummy `bin/java.exe` is rejected without core libraries or readiness sentinel, and immediately accepted once `.vermeil_ready` is present.
