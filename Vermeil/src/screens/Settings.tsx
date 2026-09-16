import { Component, createSignal, createResource, Show, For, onMount, onCleanup, createEffect } from "solid-js";
import { getSettings, saveSettings, getCacheSize, purgeCache, getAppDirectory, openAppDirectory, LauncherSettings, detectJavaInstallations, validateJavaPath, setJavaPath, installRecommendedJava, deleteJavaInstall, pruneInvalidJavaPaths, getSystemMemory, JavaInstall } from "../ipc/commands";
import { setActiveScreen, setActiveInstanceId, setInitialInstanceTab, instances, showToast } from "../App";
import { checkForUpdates } from "../services/updater";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { IconDownload, IconSearch, IconFolderOpen, IconTrash, IconModrinth, IconCurseForge, IconChevronRight, IconGlobe, IconSettings as IconSettingsIcon, IconLayers, IconCube, IconMonitor, IconBolt, IconX } from "../components/Icons";
import JavaPathInput from "../components/JavaPathInput";
import JavaChooserModal from "../modals/JavaChooserModal";
import Dropdown from "../components/Dropdown";
import KeybindCapture from "../components/KeybindCapture";
import { loaderBadgeClass, loaderLabel } from "../lib/loader";
import { KEYBINDS, resolveBinding } from "../lib/keybinds";
import { listen } from "@tauri-apps/api/event";

type SettingsTab = "all" | "general" | "resources" | "instances" | "keybinds";

/// Clamp a concurrency setting to a per-field range. The download semaphore is
/// capped at 10 because most CDNs throttle individual clients past that point;
/// the write semaphore can safely go higher because disk I/O is local.
const clampConcurrency = (n: number, max: number): number =>
  Math.max(1, Math.min(max, Math.round(Number.isNaN(n) ? 10 : n)));

const Settings: Component = () => {
  const [tab, setTab] = createSignal<SettingsTab>("all");
  const [search, setSearch] = createSignal("");
  const q = () => search().trim().toLowerCase();
  const isSearching = () => q().length > 0;
  const matches = (...texts: (string | undefined | null | number)[]): boolean => {
    const query = q();
    if (!query) return true;
    return texts.some(t => t !== null && t !== undefined && String(t).toLowerCase().includes(query));
  };
  const matchesGeneral = () => matches(
    "Launcher", "Minimize to tray on launch", "Hides launcher when game starts",
    "Pop out logs on launch", "Opens the game log in a separate window",
    "Auto-update launcher", "Boot splash", "Show the animated logo splash on startup",
    "Check for updates", "Discord Rich Presence", "Show snapshots", "Include experimental versions",
    "Force delete", "Skip confirmation when deleting instances",
    "About", "Vermeil", "Version", "Website", "vermeillauncher.app", "Disclaimer", "Privacy"
  );
  const matchesResources = () => matches(
    "Storage", "App directory", "App cache", "Version metadata and loader installers",
    "Performance", "Concurrent downloads", "Concurrent writes",
    "Java", "runtime", "Adoptium", "GC preset", "g1gc", "zgc", "shenandoah", "slots", "location"
  );
  const matchesInstances = () => matches(
    "Video", "Max FPS", "VSync", "View Bobbing", "GUI Scale", "FOV", "FOV Effects",
    "Sound", "Master", "Music",
    "Window", "Resolution", "Maximized",
    "Memory", "Maximum RAM", "adaptive",
    "Select an instance to configure", "instance"
  ) || (instances() || []).some(i => matches(i.name, i.game_version, i.loader.type));
  const matchesKeybinds = () => KEYBINDS.some(a => matches(a.label, a.description));
  const hasAnyMatches = () => !isSearching() || matchesGeneral() || matchesResources() || matchesInstances() || matchesKeybinds();
  const [settings, { refetch, mutate }] = createResource(getSettings);
  const [appVersion] = createResource(getVersion);
  const [appDirectory] = createResource(getAppDirectory);
  const [systemMemoryMb] = createResource(getSystemMemory);
  const [cacheSize, setCacheSize] = createSignal(0);
  const [purging, setPurging] = createSignal(false);

  // Video settings read straight from the resource — `updateSetting` mutates it
  // optimistically (see below), so reads are always the latest value, no
  // separate mirror to drift out of sync. Only valid inside `<Show when={settings()}>`.
  type VS = LauncherSettings["video_settings"];
  const vs = (): VS => settings()!.video_settings;

  // When the game exits, the backend reads options.txt back and emits the
  // merged video settings. Fold them into the resource so an open Settings
  // screen reflects in-game changes live (single source of truth).
  onMount(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    listen<VS>("video-settings-synced", (e) => {
      const cur = settings();
      if (cur) mutate({ ...cur, video_settings: e.payload });
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    onCleanup(() => { cancelled = true; unlisten?.(); });
  });

  // Same optimistic-display pattern for the concurrency sliders. Without
  // these, the displayed number lags the thumb because the read source
  // (`settings()!.concurrent_*`) only refreshes after the save+refetch
  // round-trip completes.
  const [dlDraft, setDlDraft] = createSignal<number | null>(null);
  const [wrDraft, setWrDraft] = createSignal<number | null>(null);
  const dlValue = (): number => dlDraft() ?? Math.min(settings()?.concurrent_downloads ?? 10, 20);
  const wrValue = (): number => wrDraft() ?? settings()?.concurrent_writes ?? 10;
  createEffect(() => {
    const s = settings();
    const d = dlDraft();
    if (s && d !== null && Math.min(s.concurrent_downloads, 20) === d) setDlDraft(null);
  });
  createEffect(() => {
    const s = settings();
    const w = wrDraft();
    if (s && w !== null && s.concurrent_writes === w) setWrDraft(null);
  });

  // Java location finder — populated by `runDetect()` and re-run on demand.
  // The four "slots" (8/17/21/25) cover every Minecraft version that exists.
  // Anything missing falls back to auto-detection / auto-install at launch.
  const JAVA_SLOTS: number[] = [25, 21, 17, 8];
  const [javaDetections, setJavaDetections] = createSignal<JavaInstall[]>([]);
  const [javaBusy, setJavaBusy] = createSignal<Record<number, "install" | "detect" | "browse" | "delete" | null>>({});
  const setJavaSlotBusy = (major: number, busy: "install" | "detect" | "browse" | "delete" | null) => {
    setJavaBusy(prev => ({ ...prev, [major]: busy }));
  };

  /** Best detected install for a given major, used as the path display fallback. */
  const detectionFor = (major: number): JavaInstall | undefined =>
    javaDetections().find(i => i.major === major);
  /** Resolved path for a given major: user override beats detection. */
  const javaPathFor = (major: number): string => {
    const userSet = settings()?.java_paths?.[major];
    if (userSet) return userSet;
    return detectionFor(major)?.path ?? "";
  };

  // Chooser-modal state. When `Detect` finds more than one matching JRE for
  // a major, we surface this modal so the user picks one explicitly instead
  // of silently auto-selecting the first by source priority. Single matches
  // still auto-apply — no popup for the obvious case.
  const [chooser, setChooser] = createSignal<{ major: number; options: JavaInstall[] } | null>(null);

  /** Apply a detected install: persist, refetch settings, toast. */
  const applyDetection = async (major: number, install: JavaInstall) => {
    await setJavaPath(major, install.path);
    await refetch();
    setJavaDetections((prev) => {
      const without = prev.filter((i) => i.path !== install.path);
      return [...without, install];
    });
    showToast({ title: `Java ${major} set`, message: install.path, type: "success" });
  };

  const runDetect = async (major?: number) => {
    if (major !== undefined) setJavaSlotBusy(major, "detect");
    try {
      const found = await detectJavaInstallations();
      setJavaDetections(found);
      if (major !== undefined) {
        const matches = found.filter((i) => i.major === major);
        if (matches.length === 0) {
          showToast({ title: `Java ${major} not found`, message: "Try Install recommended or Browse manually.", type: "info" });
        } else if (matches.length === 1) {
          await applyDetection(major, matches[0]);
        } else {
          // Multiple matches — let the user pick. The chooser handles the
          // apply step itself via `onPick`.
          setChooser({ major, options: matches });
        }
      } else {
        showToast({ title: `Found ${found.length} Java install${found.length === 1 ? "" : "s"}`, type: "success" });
      }
    } catch (e) {
      showToast({ title: "Detection failed", message: String(e), type: "error" });
    } finally {
      if (major !== undefined) setJavaSlotBusy(major, null);
    }
  };

  const runDelete = async (major: number) => {
    setJavaSlotBusy(major, "delete");
    try {
      const deletedDir = await deleteJavaInstall(major);
      await refetch();
      // Path-scoped cache invalidation: only drop detections inside the
      // directory we just removed. Filtering by `major` would also wipe an
      // unrelated user JDK for the same major (Oracle / Microsoft / etc.),
      // hiding it from the slot until the next full re-detect.
      setJavaDetections((prev) => prev.filter((i) => !i.path.startsWith(deletedDir)));
      showToast({ title: `Java ${major} removed`, message: "Vermeil's downloaded copy was deleted.", type: "success" });
    } catch (e) {
      showToast({ title: `Java ${major} delete failed`, message: String(e), type: "error" });
    } finally {
      setJavaSlotBusy(major, null);
    }
  };

  const runInstall = async (major: number) => {
    setJavaSlotBusy(major, "install");
    try {
      const install = await installRecommendedJava(major);
      await refetch();
      // Refresh detections so the install shows up in the local cache too.
      setJavaDetections(prev => {
        const without = prev.filter(i => i.path !== install.path);
        return [...without, install];
      });
      showToast({ title: `Java ${major} installed`, message: install.full_version, type: "success" });
    } catch (e) {
      showToast({ title: `Java ${major} install failed`, message: String(e), type: "error" });
    } finally {
      setJavaSlotBusy(major, null);
    }
  };

  const runBrowse = async (major: number) => {
    setJavaSlotBusy(major, "browse");
    try {
      const isWin = navigator.userAgent.includes("Windows");
      const picked = await openFileDialog({
        multiple: false,
        directory: false,
        filters: isWin
          ? [{ name: "Java executable", extensions: ["exe"] }]
          : [],
      });
      if (!picked) return;
      const path = typeof picked === "string" ? picked : (picked as { path: string }).path;
      const install = await validateJavaPath(path);
      if (install.major !== major) {
        showToast({
          title: `That's Java ${install.major}, not ${major}`,
          message: "Pick a JRE matching the requested major version.",
          type: "warning",
        });
        return;
      }
      await setJavaPath(major, install.path);
      await refetch();
      setJavaDetections(prev => {
        const without = prev.filter(i => i.path !== install.path);
        return [...without, install];
      });
      showToast({ title: `Java ${major} updated`, message: install.path, type: "success" });
    } catch (e) {
      showToast({ title: "Browse failed", message: String(e), type: "error" });
    } finally {
      setJavaSlotBusy(major, null);
    }
  };

  onMount(async () => {
    try { setCacheSize(await getCacheSize()); } catch {}
    // Self-heal stale Java overrides. The user may have deleted a JRE
    // manually (or uninstalled an external one) since the last launch — we
    // clear those entries before showing them so the input never displays
    // a path pointing at nothing. Each cleared major gets its own toast so
    // the cause-effect is visible to the user.
    try {
      const cleared = await pruneInvalidJavaPaths();
      if (cleared.length > 0) {
        await refetch();
        for (const m of cleared) {
          showToast({
            title: `Java ${m} path cleared`,
            message: "The previous file no longer exists on disk.",
            type: "info",
          });
        }
      }
    } catch (e) {
      console.error("Java path prune failed:", e);
    }
    // Fire-and-forget initial detection so the Java section has paths to show
    // when the user first opens the Resources tab.
    detectJavaInstallations().then(setJavaDetections).catch(() => {});
  });

  const formatCacheSize = () => (cacheSize() / (1024 * 1024)).toFixed(1);

  const handlePurgeCache = async () => {
    setPurging(true);
    try {
      await purgeCache();
      setCacheSize(0);
    } catch (e) { console.error(e); }
    finally { setPurging(false); }
  };

  // Adaptive RAM defaults — mirrors `services::memory::default_max_for_system`
  // and `default_min_for_system` so the Settings UI can show real numbers in
  // placeholders without an extra IPC round trip. **PARALLEL SURFACE**: if
  // either Rust function changes its constants, update this too.
  const adaptiveDefaultMax = (systemMb: number): number => {
    if (!systemMb) return 4096;
    const [reserve, pct] = systemMb <= 6144
      ? [1024, 0.90]
      : systemMb <= 12288
        ? [1536, 0.85]
        : [4096, 0.75];
    const usable = Math.max(0, systemMb - reserve);
    const aligned = Math.floor(Math.floor(usable * pct) / 256) * 256;
    return Math.max(1024, Math.min(aligned, 16384));
  };

  /** Format MB as "X.X GB" matching the rest of the launcher's memory text. */
  const formatMemoryGb = (mb: number): string => {
    const gb = mb / 1024;
    return `${gb.toFixed(gb < 10 ? 1 : 0).replace(/\.0$/, "")} GB`;
  };

  const updateSetting = async <K extends keyof LauncherSettings>(key: K, value: LauncherSettings[K]) => {
    const current = settings();
    if (!current) return;
    const updated = { ...current, [key]: value };
    // Optimistic: update the resource synchronously so the UI (toggles, sliders,
    // dropdowns) reflects the change immediately and the next read-modify-write
    // sees the latest state — no save→refetch round-trip to lag behind or clobber.
    mutate(updated);
    try {
      await saveSettings(updated);
      // Notify the global keydown handler that the keybind cache is stale.
      // App.tsx listens for this event and re-reads settings.keybinds.
      if (key === "keybinds") {
        window.dispatchEvent(new CustomEvent("vermeil-keybinds-changed"));
      }
      // The per-instance Java-args editor pre-fills from the global GC preset.
      // It lives on another screen, so fire after the save lands (not just the
      // optimistic mutate) — it reads settings from disk and would otherwise
      // race this write. The instance screen re-derives its args on this event.
      if (key === "gc_preset") {
        window.dispatchEvent(new CustomEvent("vermeil-gc-preset-changed"));
      }
    } catch (e) {
      console.error("Failed to save setting:", e);
      // Persist failed — pull the real state back so the UI doesn't lie.
      await refetch();
    }
  };

  // Patch helper for video_settings: merges onto the current resource value and
  // writes through `updateSetting` (which mutates optimistically, so the slider
  // tracks the thumb live with no separate mirror).
  const updateVideoSettings = (patch: Partial<VS>) => {
    const cur = settings()?.video_settings;
    if (!cur) return;
    updateSetting("video_settings", { ...cur, ...patch });
  };

  const openInstanceOptions = (id: string) => {
    setActiveInstanceId(id);
    setInitialInstanceTab("settings");
    setActiveScreen("mods");
  };

  return (
    <div class="screen-enter">
      <div class="section-label">Settings</div>

      <div class="settings-layout">
        {/* Sidebar navigation */}
        <aside class="settings-sidebar">
          <div class="settings-sidebar-sticky">
            {/* Search input */}
            <div class="settings-search-wrap">
              <span class="settings-search-icon">
                <IconSearch />
              </span>
              <input
                type="text"
                class="settings-search-input"
                placeholder="Search..."
                value={search()}
                onInput={(e) => setSearch(e.currentTarget.value)}
              />
              <Show when={search()}>
                <button
                  type="button"
                  class="settings-search-clear"
                  onClick={() => setSearch("")}
                  title="Clear search"
                >
                  <IconX />
                </button>
              </Show>
            </div>

            {/* Tab Buttons */}
            <div class={`settings-nav-item ${tab() === "all" && !isSearching() ? "active" : ""}`} onClick={() => { setTab("all"); setSearch(""); }}>
              <IconLayers /> All
            </div>
            <div class={`settings-nav-item ${tab() === "general" && !isSearching() ? "active" : ""}`} onClick={() => { setTab("general"); setSearch(""); }}>
              <IconSettingsIcon /> General
            </div>
            <div class={`settings-nav-item ${tab() === "resources" && !isSearching() ? "active" : ""}`} onClick={() => { setTab("resources"); setSearch(""); }}>
              <IconCube /> Resources
            </div>
            <div class={`settings-nav-item ${tab() === "instances" && !isSearching() ? "active" : ""}`} onClick={() => { setTab("instances"); setSearch(""); }}>
              <IconMonitor /> Instance
            </div>
            <div class={`settings-nav-item ${tab() === "keybinds" && !isSearching() ? "active" : ""}`} onClick={() => { setTab("keybinds"); setSearch(""); }}>
              <IconBolt /> Keybinds
            </div>
          </div>
        </aside>

        {/* Content area */}
        <div class="settings-content">
      <Show when={settings()}>
        {/* ═══ GENERAL ═══ */}
        <Show when={isSearching() ? matchesGeneral() : (tab() === "all" || tab() === "general")}>
          <div class="settings-section">
            <div class="settings-section-header">
              <div>
                <div class="settings-section-title">General</div>
                <div class="settings-section-desc">Core launcher preferences, startup options, and updates</div>
              </div>
            </div>

            <div class="settings-panel">
              <div class="settings-group-header">
                <span class="settings-badge settings-badge--launcher">LAUNCHER</span>
                <span class="settings-group-title">Launcher Preferences</span>
                <span class="settings-group-desc">Client lifecycle and startup options</span>
              </div>

              <div class="settings-grid">
                <Show when={matches("Minimize to tray on launch", "Hides launcher when game starts")}>
                  <div class="settings-cell">
                    <div class="settings-cell-content">
                      <div class="settings-cell-title">Minimize to tray on launch</div>
                      <div class="settings-cell-desc">Hides launcher when game starts</div>
                    </div>
                    <div class="settings-cell-control">
                      <div class={`toggle ${settings()!.close_on_launch ? "on" : ""}`} onClick={() => updateSetting("close_on_launch", !settings()!.close_on_launch)} />
                    </div>
                  </div>
                </Show>

                <Show when={matches("Pop out logs on launch", "Opens the game log in a separate window")}>
                  <div class="settings-cell">
                    <div class="settings-cell-content">
                      <div class="settings-cell-title">Pop out logs on launch</div>
                      <div class="settings-cell-desc">Opens the game log in a separate window</div>
                    </div>
                    <div class="settings-cell-control">
                      <div class={`toggle ${settings()!.popout_logs ? "on" : ""}`} onClick={() => updateSetting("popout_logs", !settings()!.popout_logs)} />
                    </div>
                  </div>
                </Show>

                <Show when={matches("Auto-update launcher", "Automatically checks for updates")}>
                  <div class="settings-cell">
                    <div class="settings-cell-content">
                      <div class="settings-cell-title">Auto-update launcher</div>
                      <div class="settings-cell-desc">Keep launcher up to date</div>
                    </div>
                    <div class="settings-cell-control">
                      <div class={`toggle ${settings()!.auto_update ? "on" : ""}`} onClick={() => updateSetting("auto_update", !settings()!.auto_update)} />
                    </div>
                  </div>
                </Show>

                <Show when={matches("Boot splash", "Show the animated logo splash on startup")}>
                  <div class="settings-cell">
                    <div class="settings-cell-content">
                      <div class="settings-cell-title">Boot splash</div>
                      <div class="settings-cell-desc">Show animated logo splash on startup</div>
                    </div>
                    <div class="settings-cell-control">
                      <div class={`toggle ${settings()!.splash_screen ? "on" : ""}`} onClick={() => updateSetting("splash_screen", !settings()!.splash_screen)} />
                    </div>
                  </div>
                </Show>

                <Show when={matches("Discord Rich Presence", "Display playing status")}>
                  <div class="settings-cell">
                    <div class="settings-cell-content">
                      <div class="settings-cell-title">Discord Rich Presence</div>
                      <div class="settings-cell-desc">Show game status in Discord</div>
                    </div>
                    <div class="settings-cell-control">
                      <div class={`toggle ${settings()!.discord_rpc ? "on" : ""}`} onClick={() => updateSetting("discord_rpc", !settings()!.discord_rpc)} />
                    </div>
                  </div>
                </Show>

                <Show when={matches("Show snapshots", "Include experimental versions")}>
                  <div class="settings-cell">
                    <div class="settings-cell-content">
                      <div class="settings-cell-title">Show snapshots</div>
                      <div class="settings-cell-desc">Include experimental versions</div>
                    </div>
                    <div class="settings-cell-control">
                      <div class={`toggle ${settings()!.show_snapshots ? "on" : ""}`} onClick={() => updateSetting("show_snapshots", !settings()!.show_snapshots)} />
                    </div>
                  </div>
                </Show>

                <Show when={matches("Force delete", "Skip confirmation when deleting instances")}>
                  <div class="settings-cell">
                    <div class="settings-cell-content">
                      <div class="settings-cell-title">Force delete</div>
                      <div class="settings-cell-desc">Skip confirmation when deleting instances</div>
                    </div>
                    <div class="settings-cell-control">
                      <div class={`toggle ${settings()!.force_delete ? "on" : ""}`} onClick={() => updateSetting("force_delete", !settings()!.force_delete)} />
                    </div>
                  </div>
                </Show>

                <Show when={matches("Check for updates", "Manually check for a new version")}>
                  <div class="settings-cell">
                    <div class="settings-cell-content">
                      <div class="settings-cell-title">Check for updates</div>
                      <div class="settings-cell-desc">Manually check for a new version</div>
                    </div>
                    <div class="settings-cell-control">
                      <button class="btn btn--sm" onClick={() => checkForUpdates(false)}>Check now</button>
                    </div>
                  </div>
                </Show>
              </div>
            </div>

            <div class="settings-panel">
              <div class="settings-group-header">
                <span class="settings-badge settings-badge--about">ABOUT</span>
                <span class="settings-group-title">About Vermeil</span>
                <span class="settings-group-desc">Version info, privacy, and community links</span>
              </div>

              <div class="settings-grid">
                <Show when={matches("Vermeil", "Version", appVersion())}>
                  <div class="settings-cell">
                    <div class="settings-cell-content">
                      <div class="settings-cell-title">Vermeil</div>
                      <div class="settings-cell-desc">Version {appVersion() || "..."}</div>
                    </div>
                    <div class="settings-cell-control">
                      <button class="btn btn--sm" onClick={() => openUrl("https://github.com/Davekb1976/Vermeil-Launcher")} title="GitHub Repository">
                        <svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                      </button>
                    </div>
                  </div>
                </Show>

                <Show when={matches("Website", "vermeillauncher.app")}>
                  <div class="settings-cell">
                    <div class="settings-cell-content">
                      <div class="settings-cell-title">Website</div>
                      <div class="settings-cell-desc">vermeillauncher.app</div>
                    </div>
                    <div class="settings-cell-control">
                      <button class="btn btn--sm" onClick={() => openUrl("https://vermeillauncher.app/")}>
                        <IconGlobe />
                        Visit
                      </button>
                    </div>
                  </div>
                </Show>

                <Show when={matches("Privacy", "No data is collected")}>
                  <div class="settings-cell">
                    <div class="settings-cell-content">
                      <div class="settings-cell-title">Privacy</div>
                      <div class="settings-cell-desc">Zero telemetry, all data on device</div>
                    </div>
                    <div class="settings-cell-control">
                      <button class="btn btn--sm" onClick={() => openUrl("https://github.com/Davekb1976/Vermeil-Launcher/blob/main/PRIVACY.md")}>
                        Read policy
                      </button>
                    </div>
                  </div>
                </Show>

                <Show when={matches("Disclaimer", "unofficial Minecraft launcher")}>
                  <div class="settings-cell settings-cell--full">
                    <div class="settings-cell-content">
                      <div class="settings-cell-title">Disclaimer</div>
                      <div class="settings-cell-desc" style="line-height:1.5">
                        Vermeil is an unofficial Minecraft launcher. Not affiliated with, endorsed by, or sponsored by Mojang Studios or Microsoft.
                        Minecraft is a trademark of Mojang Synergies AB.
                      </div>
                    </div>
                  </div>
                </Show>
              </div>
            </div>
          </div>
        </Show>

        {/* ═══ RESOURCES ═══ */}
        <Show when={isSearching() ? matchesResources() : (tab() === "all" || tab() === "resources")}>
          <div class="settings-section">
            <div class="settings-section-header">
              <div>
                <div class="settings-section-title">Resources</div>
                <div class="settings-section-desc">Storage paths, download concurrency, and Java environment</div>
              </div>
              <button class="btn btn--sm" onClick={handlePurgeCache} disabled={purging()}>
                {purging() ? "Purging..." : "Purge cache"}
              </button>
            </div>

            <div class="settings-panel">
              <div class="settings-group-header">
                <span class="settings-badge settings-badge--storage">STORAGE</span>
                <span class="settings-group-title">Storage Management</span>
                <span class="settings-group-desc">Application data path and local caches</span>
              </div>

              <div class="settings-grid settings-grid--2col">
                <div
                  class="settings-cell"
                  style="cursor:pointer"
                  onClick={() => openAppDirectory()}
                  title="Open in file manager"
                >
                  <div class="settings-cell-content">
                    <div class="settings-cell-title">App directory</div>
                    <div class="settings-cell-desc settings-val--mono">{appDirectory() ?? "…"}</div>
                  </div>
                  <div class="settings-cell-control">
                    <button
                      class="btn btn--sm"
                      onClick={(e) => { e.stopPropagation(); openAppDirectory(); }}
                    >
                      <IconFolderOpen /> Open
                    </button>
                  </div>
                </div>

                <div class="settings-cell">
                  <div class="settings-cell-content">
                    <div class="settings-cell-title">App cache</div>
                    <div class="settings-cell-desc">{formatCacheSize()} MB cached metadata and installers</div>
                  </div>
                  <div class="settings-cell-control">
                    <button class="btn btn--sm" onClick={handlePurgeCache} disabled={purging()}>
                      {purging() ? "Purging..." : "Purge cache"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="settings-panel">
              <div class="settings-group-header">
                <span class="settings-badge settings-badge--perf">PERFORMANCE</span>
                <span class="settings-group-title">Concurrency Limits</span>
                <span class="settings-group-desc">Max concurrent downloads and disk writes</span>
              </div>

              <div class="settings-grid settings-grid--2col">
                <div class="settings-cell">
                  <div class="settings-cell-content">
                    <div class="settings-cell-title">Concurrent downloads</div>
                    <div class="settings-cell-desc">Max files downloading simultaneously (1–20)</div>
                  </div>
                  <div class="settings-cell-control">
                    <div class="concurrency-control">
                      <input
                        class="concurrency-slider"
                        type="range"
                        min="1"
                        max="20"
                        step="1"
                        value={dlValue()}
                        style={`--slider-pct: ${((dlValue() - 1) / 19) * 100}%`}
                        onInput={(e) => {
                          const safe = clampConcurrency(parseInt(e.currentTarget.value), 20);
                          e.currentTarget.style.setProperty('--slider-pct', `${((safe - 1) / 19) * 100}%`);
                          setDlDraft(safe);
                          updateSetting("concurrent_downloads", safe);
                        }}
                      />
                      <input
                        class="concurrency-number"
                        type="number"
                        min="1"
                        max="20"
                        value={dlValue()}
                        onChange={(e) => {
                          const safe = clampConcurrency(parseInt(e.currentTarget.value), 20);
                          e.currentTarget.value = String(safe);
                          setDlDraft(safe);
                          updateSetting("concurrent_downloads", safe);
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div class="settings-cell">
                  <div class="settings-cell-content">
                    <div class="settings-cell-title">Concurrent writes</div>
                    <div class="settings-cell-desc">Max files being written to disk simultaneously (1–50)</div>
                  </div>
                  <div class="settings-cell-control">
                    <div class="concurrency-control">
                      <input
                        class="concurrency-slider"
                        type="range"
                        min="1"
                        max="50"
                        step="1"
                        value={wrValue()}
                        style={`--slider-pct: ${((wrValue() - 1) / 49) * 100}%`}
                        onInput={(e) => {
                          const safe = clampConcurrency(parseInt(e.currentTarget.value), 50);
                          e.currentTarget.style.setProperty('--slider-pct', `${((safe - 1) / 49) * 100}%`);
                          setWrDraft(safe);
                          updateSetting("concurrent_writes", safe);
                        }}
                      />
                      <input
                        class="concurrency-number"
                        type="number"
                        min="1"
                        max="50"
                        value={wrValue()}
                        onChange={(e) => {
                          const safe = clampConcurrency(parseInt(e.currentTarget.value), 50);
                          e.currentTarget.value = String(safe);
                          setWrDraft(safe);
                          updateSetting("concurrent_writes", safe);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="settings-panel">
              <div class="settings-group-header">
                <span class="settings-badge settings-badge--java">JAVA</span>
                <span class="settings-group-title">Java Environment</span>
                <span class="settings-group-desc">Runtime provider, garbage collection preset, and version slots</span>
              </div>

              <div class="settings-grid settings-grid--2col" style="margin-bottom:14px">
                <div class="settings-cell">
                  <div class="settings-cell-content">
                    <div class="settings-cell-title">Java runtime</div>
                    <div class="settings-cell-desc">{settings()!.java_runtime === "auto" ? "Auto-managed (Adoptium)" : settings()!.java_runtime}</div>
                  </div>
                  <div class="settings-cell-control">
                    <Dropdown
                      value={settings()!.java_runtime}
                      options={[
                        { value: "auto", label: "Auto (Adoptium)" },
                        { value: "system", label: "System Java" },
                      ]}
                      onChange={(val) => updateSetting("java_runtime", val)}
                    />
                  </div>
                </div>

                <div class="settings-cell">
                  <div class="settings-cell-content">
                    <div class="settings-cell-title">GC preset</div>
                    <div class="settings-cell-desc">{settings()!.gc_preset === "g1gc" ? "G1GC (recommended)" : settings()!.gc_preset.toUpperCase()}</div>
                  </div>
                  <div class="settings-cell-control">
                    <Dropdown
                      value={settings()!.gc_preset}
                      options={[
                        { value: "g1gc", label: "G1GC (recommended)" },
                        { value: "zgc", label: "ZGC (Java 21+)" },
                        { value: "shenandoah", label: "Shenandoah" },
                      ]}
                      onChange={(val) => updateSetting("gc_preset", val)}
                    />
                  </div>
                </div>
              </div>
            <div class="java-slots">
              <For each={JAVA_SLOTS}>
                {(major) => {
                  const path = () => javaPathFor(major);
                  const installed = () => Boolean(path());
                  const det = () => detectionFor(major);
                  const busy = () => javaBusy()[major] ?? null;
                  const eraLabel = () => {
                    switch (major) {
                      case 25: return "Minecraft 26.x+";
                      case 21: return "Minecraft 1.20.5 – 1.21.x";
                      case 17: return "Minecraft 1.18 – 1.20.4";
                      case 8: return "Minecraft 1.8.9 – 1.16";
                      default: return "";
                    }
                  };
                  return (
                    <div class="java-slot">
                      <div class="java-slot-header">
                        <div class="java-slot-title-wrap">
                          <span class="java-slot-title">Java {major}</span>
                          <span class="java-slot-subtitle">{eraLabel()}</span>
                        </div>
                        <Show when={installed()} fallback={
                          <span class="java-status-badge java-status-badge--missing">Missing</span>
                        }>
                          <span class="java-status-badge java-status-badge--ready">
                            {det()?.is_vermeil_managed ? "Managed" : "Ready"}
                          </span>
                        </Show>
                      </div>
                      <JavaPathInput
                        major={major}
                        value={path()}
                        placeholder={`No Java ${major} configured`}
                        disabled={busy() !== null}
                        onCommit={async (newPath) => {
                          // Refresh the settings resource so other UI sees the
                          // change, and refresh detections so the meta line
                          // under the input picks up the new install.
                          await refetch();
                          if (newPath) {
                            try {
                              const install = await validateJavaPath(newPath);
                              setJavaDetections(prev => {
                                const without = prev.filter(i => i.path !== install.path);
                                return [...without, install];
                              });
                            } catch {
                              // Already toasted by JavaPathInput on the unhappy path.
                            }
                          }
                        }}
                      />
                      <Show when={det() && installed()}>
                        <div class="java-slot-meta">
                          {det()!.full_version} · {det()!.arch} · {det()!.source.replace("_", " ")}
                        </div>
                      </Show>
                      <div class="java-slot-actions">
                        <button
                          class={`btn btn--sm ${installed() ? "btn--neutral" : "btn--primary"}`}
                          onClick={() => runInstall(major)}
                          disabled={busy() !== null}
                          title={installed() ? "Replace with a fresh Adoptium download" : "Download from Adoptium"}
                        >
                          <IconDownload />
                          {busy() === "install" ? "Installing..." : "Install recommended"}
                        </button>
                        <button
                          class="btn btn--sm btn--neutral"
                          onClick={() => runDetect(major)}
                          disabled={busy() !== null}
                        >
                          <IconSearch />
                          {busy() === "detect" ? "Detecting..." : "Detect"}
                        </button>
                        <button
                          class="btn btn--sm btn--neutral"
                          onClick={() => runBrowse(major)}
                          disabled={busy() !== null}
                        >
                          <IconFolderOpen />
                          {busy() === "browse" ? "Picking..." : "Browse"}
                        </button>
                        {(() => {
                          const det = javaDetections().find((i) => i.path === path());
                          const ownsCurrent = det?.is_vermeil_managed === true;
                          return (
                            <Show when={ownsCurrent}>
                              <button
                                class="btn btn--sm btn--danger"
                                onClick={() => runDelete(major)}
                                disabled={busy() !== null}
                                title="Delete Vermeil's downloaded copy"
                              >
                                <IconTrash />
                                {busy() === "delete" ? "Deleting..." : "Delete"}
                              </button>
                            </Show>
                          );
                        })()}
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>{/* .java-slots */}
          </div>{/* .settings-panel */}
        </div>{/* .settings-section */}
      </Show>

        {/* ═══ INSTANCE OPTIONS ═══ */}
        <Show when={isSearching() ? matchesInstances() : (tab() === "all" || tab() === "instances")}>
          <div class="settings-section">
            <div class="settings-section-header">
              <div>
                <div class="settings-section-title">Global Instance Defaults</div>
                <div class="settings-section-desc">Default video, audio, window, and memory configurations applied to all instances</div>
              </div>
              <button class="btn btn--sm" onClick={() => {
                updateVideoSettings({ max_fps: 120, vsync: true, view_bobbing: true, gui_scale: 0, fov: 0.0, fov_effects: 1.0, master_volume: 1.0, music_volume: 1.0, window_width: null, window_height: null, start_maximized: null });
              }}>Reset All</button>
            </div>

            {/* Video Panel */}
            <div class="settings-panel">
              <div class="settings-group-header">
                <span class="settings-badge settings-badge--video">VIDEO</span>
                <span class="settings-group-title">Display & Rendering</span>
                <span class="settings-group-desc">Framerate, VSync, FOV, and visual effects</span>
              </div>

              <div class="settings-grid">
                {/* Max Framerate — slider */}
                <div class="settings-cell">
                  <div class="settings-cell-content">
                    <div class="settings-cell-title">Max FPS</div>
                    <div class="settings-cell-desc">{(vs().max_fps ?? 120) === 260 ? "Unlimited" : `${vs().max_fps ?? 120} FPS`}</div>
                  </div>
                  <div class="settings-cell-control">
                    <input
                      type="range"
                      min="10"
                      max="260"
                      step="10"
                      value={vs().max_fps ?? 120}
                      class="slider vs-slider"
                      style={`--slider-pct:${((vs().max_fps ?? 120) - 10) / 250 * 100}%`}
                      onInput={(e) => {
                        const val = parseInt(e.currentTarget.value);
                        e.currentTarget.style.setProperty('--slider-pct', `${(val - 10) / 250 * 100}%`);
                        updateVideoSettings({ max_fps: val });
                      }}
                    />
                  </div>
                </div>

                {/* VSync */}
                <div class="settings-cell">
                  <div class="settings-cell-content">
                    <div class="settings-cell-title">VSync</div>
                    <div class="settings-cell-desc">Sync frame rate with monitor</div>
                  </div>
                  <div class="settings-cell-control">
                    <Dropdown
                      value={(vs().vsync ?? true) ? "true" : "false"}
                      options={[
                        { value: "true", label: "On" },
                        { value: "false", label: "Off" },
                      ]}
                      onChange={(val) => {
                        updateVideoSettings({ vsync: val === "true" });
                      }}
                    />
                  </div>
                </div>

                {/* View Bobbing */}
                <div class="settings-cell">
                  <div class="settings-cell-content">
                    <div class="settings-cell-title">View Bobbing</div>
                    <div class="settings-cell-desc">Camera motion while walking</div>
                  </div>
                  <div class="settings-cell-control">
                    <Dropdown
                      value={(vs().view_bobbing ?? true) ? "true" : "false"}
                      options={[
                        { value: "true", label: "On" },
                        { value: "false", label: "Off" },
                      ]}
                      onChange={(val) => {
                        updateVideoSettings({ view_bobbing: val === "true" });
                      }}
                    />
                  </div>
                </div>

                {/* GUI Scale */}
                <div class="settings-cell">
                  <div class="settings-cell-content">
                    <div class="settings-cell-title">GUI Scale</div>
                    <div class="settings-cell-desc">User interface scale</div>
                  </div>
                  <div class="settings-cell-control">
                    <Dropdown
                      value={String(vs().gui_scale ?? 0)}
                      options={[
                        { value: "0", label: "Auto" },
                        { value: "1", label: "Small" },
                        { value: "2", label: "Normal" },
                        { value: "3", label: "Large" },
                        { value: "4", label: "Huge" },
                      ]}
                      onChange={(val) => {
                        updateVideoSettings({ gui_scale: parseInt(val) });
                      }}
                    />
                  </div>
                </div>

                {/* FOV */}
                <div class="settings-cell">
                  <div class="settings-cell-content">
                    <div class="settings-cell-title">FOV</div>
                    <div class="settings-cell-desc">{`${Math.round(40 * (vs().fov ?? 0) + 70)}°`}</div>
                  </div>
                  <div class="settings-cell-control">
                    <input
                      type="range"
                      min="30"
                      max="110"
                      step="1"
                      value={vs().fov === null ? 70 : Math.round(40 * vs().fov! + 70)}
                      class="slider vs-slider"
                      style={`--slider-pct:${((vs().fov === null ? 70 : Math.round(40 * vs().fov! + 70)) - 30) / 80 * 100}%`}
                      onInput={(e) => {
                        const degrees = parseInt(e.currentTarget.value);
                        e.currentTarget.style.setProperty('--slider-pct', `${(degrees - 30) / 80 * 100}%`);
                        const fovValue = (degrees - 70) / 40;
                        updateVideoSettings({ fov: fovValue });
                      }}
                    />
                  </div>
                </div>

                {/* FOV Effects */}
                <div class="settings-cell">
                  <div class="settings-cell-content">
                    <div class="settings-cell-title">FOV Effects</div>
                    <div class="settings-cell-desc">{`${Math.round((vs().fov_effects ?? 1) * 100)}%`}</div>
                  </div>
                  <div class="settings-cell-control">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={vs().fov_effects === null ? 100 : Math.round(vs().fov_effects! * 100)}
                      class="slider vs-slider"
                      style={`--slider-pct:${(vs().fov_effects === null ? 100 : Math.round(vs().fov_effects! * 100))}%`}
                      onInput={(e) => {
                        const pct = parseInt(e.currentTarget.value);
                        e.currentTarget.style.setProperty('--slider-pct', `${pct}%`);
                        updateVideoSettings({ fov_effects: pct / 100 });
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Audio Panel */}
            <div class="settings-panel">
              <div class="settings-group-header">
                <span class="settings-badge settings-badge--audio">AUDIO</span>
                <span class="settings-group-title">Sound Levels</span>
                <span class="settings-group-desc">Master and music volume levels</span>
              </div>

              <div class="settings-grid settings-grid--2col">
                {/* Master Volume */}
                <div class="settings-cell">
                  <div class="settings-cell-content">
                    <div class="settings-cell-title">Master Volume</div>
                    <div class="settings-cell-desc">{`${Math.round((vs().master_volume ?? 1) * 100)}%`}</div>
                  </div>
                  <div class="settings-cell-control">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={vs().master_volume === null ? 100 : Math.round(vs().master_volume! * 100)}
                      class="slider vs-slider"
                      style={`--slider-pct:${(vs().master_volume === null ? 100 : Math.round(vs().master_volume! * 100))}%`}
                      onInput={(e) => {
                        const pct = parseInt(e.currentTarget.value);
                        e.currentTarget.style.setProperty('--slider-pct', `${pct}%`);
                        updateVideoSettings({ master_volume: pct / 100 });
                      }}
                    />
                  </div>
                </div>

                {/* Music Volume */}
                <div class="settings-cell">
                  <div class="settings-cell-content">
                    <div class="settings-cell-title">Music Volume</div>
                    <div class="settings-cell-desc">{`${Math.round((vs().music_volume ?? 1) * 100)}%`}</div>
                  </div>
                  <div class="settings-cell-control">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={vs().music_volume === null ? 100 : Math.round(vs().music_volume! * 100)}
                      class="slider vs-slider"
                      style={`--slider-pct:${(vs().music_volume === null ? 100 : Math.round(vs().music_volume! * 100))}%`}
                      onInput={(e) => {
                        const pct = parseInt(e.currentTarget.value);
                        e.currentTarget.style.setProperty('--slider-pct', `${pct}%`);
                        updateVideoSettings({ music_volume: pct / 100 });
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Window & Memory Panel */}
            <div class="settings-panel">
              <div class="settings-group-header">
                <span class="settings-badge settings-badge--window">WINDOW & RAM</span>
                <span class="settings-group-title">Window & Memory Defaults</span>
                <span class="settings-group-desc">Launch dimensions and adaptive RAM ceiling</span>
              </div>

              <div class="settings-grid">
                {/* Resolution preset dropdown */}
                <div class="settings-cell">
                  <div class="settings-cell-content">
                    <div class="settings-cell-title">Resolution</div>
                    <div class="settings-cell-desc">Default window size</div>
                  </div>
                  <div class="settings-cell-control">
                    <Dropdown
                      disabled={!!vs().start_maximized}
                      value={vs().window_width && vs().window_height ? `${vs().window_width}x${vs().window_height}` : "1280x720"}
                      options={[
                        { value: "1280x720", label: "1280 × 720" },
                        { value: "1366x768", label: "1366 × 768" },
                        { value: "1600x900", label: "1600 × 900" },
                        { value: "1920x1080", label: "1920 × 1080" },
                        { value: "2560x1440", label: "2560 × 1440" },
                        { value: "3840x2160", label: "3840 × 2160" },
                      ]}
                      onChange={(val) => {
                        const [w, h] = val.split("x").map(Number);
                        updateVideoSettings({ window_width: w, window_height: h });
                      }}
                    />
                  </div>
                </div>

                {/* Maximized toggle */}
                <div class="settings-cell">
                  <div class="settings-cell-content">
                    <div class="settings-cell-title">Maximized</div>
                    <div class="settings-cell-desc">Launch filled to monitor</div>
                  </div>
                  <div class="settings-cell-control">
                    <div class={`toggle ${vs().start_maximized ? "on" : ""}`} onClick={() => updateVideoSettings({ start_maximized: !vs().start_maximized })} />
                  </div>
                </div>

                {/* Maximum RAM cap */}
                <div class="settings-cell">
                  <div class="settings-cell-content">
                    <div class="settings-cell-title">Maximum RAM</div>
                    <div class="settings-cell-desc">Adaptive ceiling</div>
                  </div>
                  <div class="settings-cell-control">
                    <Dropdown
                      value={String(settings()!.adaptive_ram_max_mb || 0)}
                      options={(() => {
                        const sysMb = systemMemoryMb() || 0;
                        const auto = adaptiveDefaultMax(sysMb);
                        return [
                          { value: "0", label: `Auto (${formatMemoryGb(auto)})` },
                          { value: "2048", label: "2 GB" },
                          { value: "3072", label: "3 GB" },
                          { value: "4096", label: "4 GB" },
                          { value: "6144", label: "6 GB" },
                          { value: "8192", label: "8 GB" },
                          { value: "10240", label: "10 GB" },
                          { value: "12288", label: "12 GB" },
                          { value: "14336", label: "14 GB" },
                          { value: "16384", label: "16 GB" },
                        ];
                      })()}
                      onChange={(val) => {
                        updateSetting("adaptive_ram_max_mb", parseInt(val) || 0);
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Instances Panel */}
            <div class="settings-panel">
              <div class="settings-group-header">
                <span class="settings-badge settings-badge--instances">INSTANCES</span>
                <span class="settings-group-title">Configure Instances</span>
                <span class="settings-group-desc">Select an instance to configure overrides</span>
              </div>
              <div class="card-grid">
                <For each={instances() || []}>
                  {(inst) => {
                    const iconUrl = (!inst.icon || inst.icon === "cube") ? undefined : inst.icon;
                    const colorClass = (() => {
                      switch (inst.loader.type) {
                        case "fabric": return "fabric";
                        case "quilt": return "quilt";
                        case "neoforge": return "blue";
                        case "forge": return "orange";
                        default: return "green";
                      }
                    })();
                    return (
                      <div class="card card--inst" style="cursor:pointer" onClick={() => openInstanceOptions(inst.id)}>
                        <div class="card-body">
                          <div class={`inst-card-icon ${colorClass}`}>
                            <Show when={iconUrl} fallback={
                              <span class="inst-card-icon-letter">{inst.name.trim().charAt(0).toUpperCase() || "?"}</span>
                            }>
                              <img src={iconUrl!} alt="" draggable={false} />
                            </Show>
                          </div>
                          <div class="inst-card-content">
                            <div class="card-title">{inst.name}</div>
                            <div class="card-sub">
                              {inst.game_version} · {inst.mods.length} mods · {inst.window.width}x{inst.window.height}
                            </div>
                            <div class="inst-card-badges">
                              <span class={`badge badge--loader ${loaderBadgeClass(inst.loader.type)}`}>{loaderLabel(inst.loader.type)}</span>
                              <Show when={(inst.source_platforms || []).includes("modrinth")}>
                                <span class="badge badge--source badge--modrinth"><IconModrinth /></span>
                              </Show>
                              <Show when={(inst.source_platforms || []).includes("curseforge")}>
                                <span class="badge badge--source badge--curseforge"><IconCurseForge /></span>
                              </Show>
                              <Show when={inst.ingame_cape_supported}>
                                <span class="badge badge--companion" title="Vermeil companion mod supported">
                                  <img src="/logo.png" alt="Vermeil" draggable={false} />
                                </span>
                              </Show>
                            </div>
                          </div>
                          <span class="side-icon" style="color:var(--muted)"><IconChevronRight /></span>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          </div>
        </Show>

        {/* ═══ KEYBINDS ═══ */}
        <Show when={isSearching() ? matchesKeybinds() : (tab() === "all" || tab() === "keybinds")}>
          <div class="settings-section">
            <div class="settings-section-header">
              <div>
                <div class="settings-section-title">Keybinds</div>
                <div class="settings-section-desc">Global keyboard shortcuts and in-app navigation hotkeys</div>
              </div>
              <button class="btn btn--sm" onClick={() => updateSetting("keybinds", {})}>Reset to Defaults</button>
            </div>

            <div class="settings-panel">
              <div class="settings-group-header">
                <span class="settings-badge settings-badge--shortcuts">SHORTCUTS</span>
                <span class="settings-group-title">Global Launcher Hotkeys</span>
                <span class="settings-group-desc">Click any key badge to record a new key combination</span>
              </div>

              <div class="settings-grid">
                <For each={KEYBINDS}>
                  {(action) => (
                    <Show when={matches(action.label, action.description)}>
                      <div class="settings-cell">
                        <div class="settings-cell-content">
                          <div class="settings-cell-title">{action.label}</div>
                          <Show when={action.description}>
                            <div class="settings-cell-desc">{action.description}</div>
                          </Show>
                        </div>
                        <div class="settings-cell-control">
                          <KeybindCapture
                            binding={resolveBinding(action.id, settings()?.keybinds)}
                            defaultBinding={action.default}
                            onChange={(newBinding) => {
                              const current = { ...(settings()?.keybinds ?? {}) };
                              if (!newBinding) {
                                // Reset → remove override so default kicks in
                                delete current[action.id];
                              } else {
                                current[action.id] = newBinding;
                              }
                              updateSetting("keybinds", current);
                            }}
                          />
                        </div>
                      </div>
                    </Show>
                  )}
                </For>
              </div>

              <div class="settings-hint" style="margin-top:12px">
                Click a binding and press the new key combination. Escape cancels capture. The reset arrow restores default.
              </div>
            </div>
          </div>
        </Show>

        {/* Empty state when search has no results */}
        <Show when={!hasAnyMatches()}>
          <div class="settings-no-results">
            No settings found matching "{search()}"
          </div>
        </Show>
        </Show>
        </div>{/* .settings-content */}
      </div>{/* .settings-layout */}

      {/* Chooser modal — rendered at the screen root so it overlays the
          Settings tabs when the Detect action returns multiple matches. The
          single-match path bypasses this entirely (auto-applied in
          `runDetect`). */}
      <Show when={chooser()}>
        <JavaChooserModal
          major={chooser()!.major}
          options={chooser()!.options}
          onCancel={() => setChooser(null)}
          onPick={async (install) => {
            const major = chooser()!.major;
            setChooser(null);
            await applyDetection(major, install);
          }}
        />
      </Show>
    </div>
  );
};

export default Settings;
