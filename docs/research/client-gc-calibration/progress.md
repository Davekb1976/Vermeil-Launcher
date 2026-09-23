# Client GC Presets & JVM Arguments Calibration — Progress Board

Living progress tracker for the modern client garbage collection and JVM argument calibration overhaul.

---

## Work Items & Status

| Track | Task | Status | Notes |
| :--- | :--- | :---: | :--- |
| **Backend** | Refactor `resolve_gc_flags` in `services/launch.rs` | ✅ Done | Client G1GC (45ms, IHOP 45, SurvivorRatio 8), Generational ZGC, Adaptive Shenandoah |
| **Backend** | Remove `-XX:+AlwaysPreTouch` from default presets | ✅ Done | Eliminates 3–8s cold startup stalls and disk swap exhaustion |
| **Backend** | Calibrate `-Xms` with effective `-Xmx` | ✅ Done | Pre-allocates working heap pool, stopping dynamic resizing freezes on 200–400 modpacks |
| **Backend** | IPC parity in `commands/launch.rs` | ✅ Done | `get_preset_jvm_args` and `get_known_preset_args` match calibrated flags and heap |
| **Backend** | Comprehensive unit test suite | ✅ Done | 5 dedicated tests in `services::launch::tests` covering Java 8, 17, 21, 25, fallback, and region sizing |
| **Frontend** | Update GC preset dropdown options in `Settings.tsx` | ✅ Done | Informative labels per hardware tier and Java version |
| **Frontend** | Update `presetLabel` & description in `InstanceMods.tsx` | ✅ Done | Displays `"Client G1GC"`, `"Generational ZGC"`, `"Adaptive Shenandoah"` |
| **Quality** | Zero warnings compiler check (`cargo check`) | ✅ Done | Passes with 0 warnings |
| **Quality** | Full test suite execution (`cargo test`) | ✅ Done | 53 / 53 unit tests pass |
| **Quality** | Frontend typecheck & bundle build | ✅ Done | `tsc --noEmit` and `vite build` complete in ~3.6s with 0 errors |

---

## Test Suite Coverage

- `test_client_g1gc_java8_and_java17`: Validates Java 8 includes `ParallelRefProcEnabled`, Java 17 omits it, both include `MaxGCPauseMillis=45`, `SurvivorRatio=8`, and omit server flags.
- `test_client_g1gc_region_sizing`: Validates heaps $\le 12$ GB receive 8M regions while heaps $> 12$ GB receive 16M regions.
- `test_generational_zgc_version_gating`: Validates Java 21 gets `ZGenerational`, Java 23 omits it, Java 25 gets `CompactObjectHeaders`, and Java 17 safely falls back to Client G1GC.
- `test_adaptive_shenandoah`: Validates Java 17 uses `adaptive` heuristic (not `compact`), and Java 8 falls back to Client G1GC.
