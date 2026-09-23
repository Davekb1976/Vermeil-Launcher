# Client GC Presets & JVM Arguments Calibration

## Overview & Goal

Garbage collection (GC) and JVM heap tuning are critical to Minecraft client responsiveness, frame pacing, and startup duration. Historically, Minecraft launchers and community guides blindly passed **Aikar's flags** (`-XX:MaxGCPauseMillis=200`, `-XX:MaxTenuringThreshold=1`, `-XX:SurvivorRatio=32`, `-XX:+AlwaysPreTouch`), which were engineered exclusively for **headless dedicated multiplayer servers** (Paper/Spigot), not local game clients.

On a client rendering at 60–144+ FPS, server-tuned parameters cause severe degradation:
1. **200ms Stop-The-World Pauses**: Dropping 12 to 29 consecutive frames, manifesting as hard visual freezes.
2. **Premature Old Gen Promotion (`MaxTenuringThreshold=1` & `SurvivorRatio=32`)**: Forcing short-lived transient mod objects (models, particle matrices, block states) into Old Gen after a single GC cycle, filling Old Gen and causing massive Mixed/Full GC stutters.
3. **Cold Startup Stall (`-XX:+AlwaysPreTouch`)**: Forcing the OS kernel to commit and zero-fill 8–12 GB of virtual pages before initializing the Minecraft window.
4. **Initial Heap Bottleneck (`-Xms512m`)**: Forcing the JVM to repeatedly trigger Stop-The-World heap expansions from 512 MB to 8 GB during mod loading (200–400 mods).
5. **CPU Thread Starvation (`ShenandoahGCHeuristics=compact`)**: Continually thrashing background collection cycles and stealing CPU cores from client render loops.

Vermeil modernizes this pipeline by replacing dedicated server flags with **Client-Tuned G1GC**, **Generational ZGC (Java 21+)**, and **Adaptive Shenandoah (Java 12+)**, calibrated across **Low-End**, **Medium-End**, and **High-End** hardware tiers.

---

## 1. Architecture & Node Flowchart

```mermaid
flowchart TD
    subgraph INPUT["1. Launch & Hardware Calibration"]
        direction TB
        in_start["Launch Instance or<br/>Open Java Settings"] --> in_detect["Detect Hardware Tier<br/>(Cores & System RAM)"]
        in_detect --> in_resolve["Resolve Effective Memory<br/>(Adaptive RAM or Manual)"]
    end

    subgraph HEAP["2. Initial Heap Calibration"]
        direction TB
        heap_calc["Calculate Heap Limits<br/>(Effective -Xmx)"] --> heap_ms["Set -Xms = -Xmx<br/>(No AlwaysPreTouch)"]
        heap_ms --> heap_benefit["Stops Dynamic Resizing:<br/>Eliminates STW pauses<br/>during 200-400 mod loading"]
        heap_ms --> heap_safety["Lazy OS Page Allocation:<br/>Protects Low-End RAM<br/>from swap file thrashing"]
    end

    subgraph MATRIX["3. GC Engine & Version Matrix"]
        direction TB
        gc_select{"User Preset &<br/>Java Version"}
        
        gc_select -->|"g1gc (Default)<br/>Safe for Low, Mid & High"| gc_g1["Client-Tuned G1GC<br/>• MaxGCPauseMillis=45ms<br/>• SurvivorRatio=8 (Room to live)<br/>• InitiatingOccupancy=45%<br/>• Low CPU overhead (2-4 cores)"]
        
        gc_select -->|"zgc & Java 21+<br/>(Best for Mid/High-End)"| gc_zgc["Generational ZGC<br/>• -XX:+UseZGC<br/>• -XX:+ZGenerational<br/>• Sub-1ms pause times<br/>• Needs 6+ CPU cores"]
        
        gc_select -->|"zgc & Java < 21<br/>(e.g. MC 1.20.1 on Java 17)"| gc_fallback["Graceful Client Fallback<br/>Auto-routes to Client G1GC<br/>(No server flag trap)"]
        
        gc_select -->|"shenandoah (Java 12+)"| gc_shen["Adaptive Shenandoah<br/>• Heuristics=adaptive<br/>• Low latency without CPU stall"]
    end

    subgraph OUTCOME["4. In-Game Performance by Tier"]
        direction TB
        res_low["Low-End (2-4 Cores, 4-8GB):<br/>No CPU thread starvation<br/>No swap file exhaustion<br/>Fast, responsive launch"]
        res_high["Mid/High-End (6+ Cores, 16-32GB+):<br/>Smooth 60-144+ FPS<br/>Sub-1ms frame pacing (ZGC)<br/>Transient mod objects die young"]
    end

    INPUT --> HEAP
    HEAP --> MATRIX
    gc_g1 --> OUTCOME
    gc_zgc --> OUTCOME
    gc_fallback --> OUTCOME
    gc_shen --> OUTCOME

    style INPUT fill:#1d1b24,stroke:#8b5cf6,stroke-width:2px,color:#f4f3f6
    style HEAP fill:#181620,stroke:#3b82f6,stroke-width:2px,color:#f4f3f6
    style MATRIX fill:#181620,stroke:#ec4899,stroke-width:2px,color:#f4f3f6
    style OUTCOME fill:#131119,stroke:#10b981,stroke-width:2px,color:#f4f3f6
```

---

## 2. Hardware Tier Calibration

| Hardware Tier | Recommended Preset | Architectural Rationale | Pitfalls Avoided |
| :--- | :--- | :--- | :--- |
| **Low-End**<br/>*(2–4 CPU cores, 4–8 GB total RAM)* | **Client-Tuned G1GC** *(Default)* | Low concurrent CPU usage leaves physical cores available for rendering and world ticks. Omitting `AlwaysPreTouch` prevents OS memory starvation. `MaxGCPauseMillis=45ms` preserves throughput. | **Never force ZGC on low-end:** ZGC's concurrent GC threads saturate 2–4 core CPUs. Never use `MaxTenuringThreshold=1`. |
| **Medium-End**<br/>*(6–8 CPU cores, 16 GB total RAM)* | **Client-Tuned G1GC** or **Generational ZGC** *(Java 21+)* | 6–8 cores easily absorb ZGC background threads. Pre-sizing `-Xms = -Xmx` eliminates dynamic heap resizing stutters on 200–400 modpacks. | Avoid `Shenandoah=compact` which starves CPU threads; `adaptive` provides clean frame pacing. |
| **High-End**<br/>*(8–16+ CPU cores, 32–64+ GB RAM)* | **Generational ZGC** *(Java 21+)* | Delivers sub-millisecond pauses (<1ms STW) even on 10–12 GB heaps with 400+ mods. Flawless frame pacing on 144Hz–240Hz monitors. | Server 200ms pauses drop 29 consecutive frames at 144Hz. Compact Object Headers on Java 25+ saves 10–15% memory overhead. |

---

## 3. Java HotSpot Flag Specification

### Client-Tuned G1GC (`g1gc`)
- `-XX:+UseG1GC`: Standard generational garbage collector.
- `-XX:MaxGCPauseMillis=45`: Bounded pause target (~2.5 frames at 60 FPS, imperceptible during gameplay).
- `-XX:+UnlockExperimentalVMOptions`: Universal compatibility toggle.
- `-XX:+DisableExplicitGC`: Prevents mods from invoking Stop-The-World `System.gc()`.
- `-XX:+UseStringDeduplication`: Deduplicates repeated string instances (registry names, NBT keys).
- `-XX:G1NewSizePercent=20` & `-XX:G1MaxNewSizePercent=40`: Balanced young generation sizing.
- `-XX:G1ReservePercent=15`: Headroom buffer against to-space exhaustion.
- `-XX:G1HeapWastePercent=5` & `-XX:G1MixedGCCountTarget=4`: Divides mixed reclamation into short, non-blocking slices.
- `-XX:InitiatingHeapOccupancyPercent=45`: OpenJDK default. Prevents early concurrent marking thrashing.
- `-XX:SurvivorRatio=8`: Restores normal survivor space capacity so transient objects die in Young Gen.
- `-XX:+ParallelRefProcEnabled`: Emitted for `java_major <= 8` (default in Java 9+).
- Region sizing: `-XX:G1HeapRegionSize=16M` when `memory_mb > 12288`, else `8M`.

### Generational ZGC (`zgc`)
- Gated to `java_major >= 21`.
- `-XX:+UseZGC`: Activates scalable low-latency collector.
- `-XX:+ZGenerational`: Generational partitioning for Java 21–22 (default in Java 23+).
- `-XX:+UseStringDeduplication`: Concurrent string deduplication.
- `-XX:TrimNativeHeapInterval=5000`: Trims unused native memory allocations.
- `-XX:+UseCompactObjectHeaders`: Emitted on Java 25+ (`java_major >= 25`).
- **Clean Fallback**: Instances running on Java < 21 (e.g. 1.20.1 Forge on Java 17) automatically fall back to Client-Tuned G1GC.

### Adaptive Shenandoah (`shenandoah`)
- Gated to `java_major >= 12`.
- `-XX:+UseShenandoahGC`: Low-latency collector.
- `-XX:ShenandoahGCHeuristics=adaptive`: Dynamically adjusts triggers based on allocation rates without starving game threads.
- `-XX:+DisableExplicitGC` & `-XX:+UseStringDeduplication`.
- **Clean Fallback**: Instances on Java < 12 automatically fall back to Client-Tuned G1GC.
