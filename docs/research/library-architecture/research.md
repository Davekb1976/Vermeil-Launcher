# Library Architecture & High-Concurrency Batch Deletion

## Overview & Goal

The Library screen serves as Vermeil's primary dashboard for managing, inspecting, and organizing local Minecraft instances. As instance libraries scale from a couple of testing profiles to dozens of heavily-modded configurations, two primary architectural challenges emerge:

1. **Deletion Latency & Main-Thread Blocking**:
   - Deleting multiple instances previously operated as a sequential frontend loop that called single-instance deletion one-by-one.
   - Each individual deletion synchronously unlinked large directory trees (often containing thousands of mod files, asset indexes, and world saves), re-read and wrote launcher configuration, and repeatedly triggered Windows uninstaller disk footprint calculations.
   - For users selecting 3 to 10 instances, this created a noticeable 1–2 second freeze where the interface stalled before all instances disappeared.

2. **Visual Hierarchy & Discovery in Large Libraries**:
   - A single flat card grid with scattered or missing filters lacked structure for distinguishing between active daily drivers ("Favorites" or "Pinned" instances) and experimental or inactive modpacks.
   - Brand-new launcher installations displayed an empty void with a lone dashed card, offering no clear path toward creating or importing instances.
   - Action affordances like multi-select used misleading icons (identical to the dock icon) and suffered from edge tooltip clipping.

Vermeil addresses these challenges with **High-Speed Parallel Batch Deletion**, **Dual-Shelf Organizational Hierarchy**, **Tactile Filter Chips & Instant Search**, and a **Sunken Guided Empty-State Hero**.

---

## 1. Architectural Comparison: Old vs. New Pipeline

```mermaid
flowchart TD
    subgraph LEGACY["PREVIOUS PIPELINE (Sequential & Blocking)"]
        direction TB
        l_ui["Multi-Select in Library<br/>(User clicks Delete)"]
        l_ui --> l_loop["Sequential Frontend Loop<br/>(for id in selectedIds)"]
        
        l_loop --> l_call1["Invoke delete_instance(id_1)<br/>(Individual IPC Call)"]
        l_call1 --> l_meta1["Read instance.json<br/>(Disk I/O)"]
        l_meta1 --> l_del1["Synchronous fs::remove_dir_all<br/>(Thousands of files)"]
        l_del1 --> l_set1["Load & Save settings.json<br/>(Disk write #1)"]
        l_set1 --> l_calc1["Recalculate Uninstaller Size<br/>(Spawn thread #1)"]
        
        l_calc1 --> l_call2["Invoke delete_instance(id_2)<br/>(Wait for next loop tick)"]
        l_call2 --> l_del2["Synchronous fs::remove_dir_all<br/>(Heavy blocking disk I/O)"]
        l_del2 --> l_set2["Load & Save settings.json<br/>(Disk write #2)"]
        l_set2 --> l_calc2["Recalculate Uninstaller Size<br/>(Spawn thread #2)"]
        
        l_calc2 --> l_freeze["1–2s Perceptible Freeze<br/>(UI stalled during serial I/O)"]
        l_freeze --> l_ui_refetch["Refetch All Instances<br/>(Cards suddenly vanish)"]
    end

    subgraph MODERN["CALIBRATED PIPELINE (Parallel & Single-Pass)"]
        direction TB
        m_ui["Multi-Select in Library<br/>(User clicks Delete All)"]
        m_ui --> m_single["Single Batch IPC Call<br/>(delete_instances(ids))"]
        
        m_single --> m_meta["Single-Pass Metadata Scan<br/>(Inspect last_played timestamps)"]
        m_meta --> m_settings["Single-Pass Settings Update<br/>(Prune pinned IDs & save once)"]
        
        m_settings --> m_spawn["Concurrent Directory Removal<br/>(tokio::task::spawn_blocking)"]
        
        m_spawn --> m_t1["Thread 1: remove_dir_all(id_1)"]
        m_spawn --> m_t2["Thread 2: remove_dir_all(id_2)"]
        m_spawn --> m_t3["Thread N: remove_dir_all(id_N)"]
        
        m_t1 --> m_join["Wait for All Threads<br/>(Concurrent completion)"]
        m_t2 --> m_join
        m_t3 --> m_join
        
        m_join --> m_calc["Single Footprint Calculation<br/>(update_windows_estimated_size)"]
        m_calc --> m_done["Instant IPC Completion<br/>(Smooth UI transition)"]
    end

    style LEGACY fill:#1c1417,stroke:#ef4444,stroke-width:2px,color:#f4f3f6
    style MODERN fill:#121816,stroke:#10b981,stroke-width:2px,color:#f4f3f6
    style l_loop fill:#2a1b1f,stroke:#f87171,color:#f4f3f6
    style l_del1 fill:#2a1b1f,stroke:#f87171,color:#f4f3f6
    style l_del2 fill:#2a1b1f,stroke:#f87171,color:#f4f3f6
    style l_freeze fill:#2a1b1f,stroke:#f87171,color:#f4f3f6
    style m_single fill:#162420,stroke:#34d399,color:#f4f3f6
    style m_settings fill:#162420,stroke:#34d399,color:#f4f3f6
    style m_spawn fill:#162420,stroke:#34d399,color:#f4f3f6
    style m_join fill:#162420,stroke:#34d399,color:#f4f3f6
    style m_done fill:#162420,stroke:#34d399,color:#f4f3f6
```

---

## 2. Direct Feature & Behavioral Comparison

| Dimension | Previous Implementation | Calibrated Implementation | User-Facing Impact |
| :--- | :--- | :--- | :--- |
| **Deletion Execution** | Serial frontend loop invoking `delete_instance` per ID. | Single backend command `delete_instances(ids)` unlinking directories in parallel via `spawn_blocking`. | Eliminates the 1–2 second freeze; batch deletion completes near-instantaneously. |
| **Configuration I/O** | `settings.json` reloaded, edited, and written once per deleted instance. | `settings.json` updated and written exactly once for the entire batch. | Reduces disk write cycles and prevents file lock contention. |
| **Windows Footprint Sync** | Re-scanned and updated registry once per deleted instance. | Single deferred recalculation executed after all directory threads complete. | Eliminates redundant background thread spawns and registry writes. |
| **Multi-Select Icon** | `<IconGrid />` (identical to the Dock Library navigation icon). | `<IconTrash2 />` with toggle state and responsive badge. | Obvious, unambiguous affordance indicating deletion mode. |
| **Tooltip Positioning** | Centered `tip-below` clipping past the right viewport margin. | Right-anchored `tip-below tip-right` keeping tooltip content on screen. | Crisp, legible tooltips regardless of window size. |
| **Library Organization** | Flat unordered grid; minimal filtering. | Dual-Shelf layout: `// PINNED FAVORITES` (with quick-access modal trigger) and `// ALL INSTANCES`. | Immediate access to favorite profiles without visual clutter. |
| **Filtering & Search** | Limited search; out-of-place controls. | Tactile filter pills (`All`, `★ Pinned`, `Played`, `Unplayed`, Loader chips) + live text search with quick clear. | Instant profile discovery across large collections. |
| **Empty State** | Empty void with a solitary dashed card. | Framed sunken `#0f0e13` Hero Panel with Vermeil logo and 3 clear action entry points. | Welcoming, self-explanatory onboarding for new users. |

---

## 3. Concurrency & Parallel Unlinking Engine

### Single-Pass Configuration Consolidation

When multiple instances are deleted simultaneously, their identifiers must be purged from `sidebar_pinned_instances` and the launcher's `last_active_at` timestamp must be resolved. The legacy implementation repeated this sequence $N$ times.

In `delete_instances(ids: Vec<String>)`:
1. Metadata for all target instances is examined upfront to capture the highest `last_played` timestamp.
2. The pinned instances list is filtered against a `HashSet<String>` of deleted IDs.
3. If settings were altered, `settings_service::save()` is called exactly once.

### Concurrent Thread Unlinking

Directory unlinking in Windows NTFS can incur significant overhead when deleting trees with nested directories and thousands of small files (common in heavily-modded instances with shaderpacks, mods, and resource packs):

```rust
let mut handles = Vec::new();
for id in ids {
    let dir = instances_dir.join(id);
    handles.push(tokio::task::spawn_blocking(move || {
        if dir.exists() {
            let _ = std::fs::remove_dir_all(&dir);
        }
    }));
}

for handle in handles {
    let _ = handle.await;
}
```

Offloading each instance deletion to Tokio's blocking threadpool allows the underlying OS filesystem driver to interleave I/O requests concurrently across CPU cores rather than stalling the async runtime or serializing disk latency.

---

## 4. Dual-Shelf UI Hierarchy & SloppyKeys Styling

### 1. Pinned Favorites Shelf
Instances pinned for quick access (matching the floating dock's launcher list) are elevated to an exclusive `// PINNED FAVORITES` section:
- Styled with `.card-section-tag.tag-settings-accent` and gold `.badge--pinned` accents.
- Includes a direct `Manage Pins` button triggering `PinInstancesModal` without navigating away to Settings.
- Automatically collapses when search or specific loader filters are active to prevent visual duplication.

### 2. All Instances & Filter Pills
- Filter pills (`.library-filter-pill`) feature flat surfaces, hairline borders, and tactile `--bevel` shadows on active states.
- The `[UNPLAYED]` status badge (`.badge--unplayed`) visually segregates newly created or unlaunched profiles from established installations.

### 3. Tactile Empty State Hero
For zero-instance environments, the view renders a prominent `.library-empty-panel`:
- Recessed `#0f0e13` sunken well background with a 3px accent left border (`border-left: 3px solid var(--accent)`).
- Clear CTA buttons for creating a clean instance, browsing community modpacks (Modrinth/CurseForge), or importing `.mrpack` / `.zip` archives.
