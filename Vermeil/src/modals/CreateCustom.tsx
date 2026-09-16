import { Component, createSignal, createResource, createEffect, onCleanup, For, Show, createMemo } from "solid-js";
import { Portal } from "solid-js/web";
import { setActiveScreen, refetchInstances, refreshPinnedInstanceIds, showToast } from "../App";
import {
  getGameVersions,
  getFabricLoaderVersions,
  getFabricGameVersions,
  getQuiltLoaderVersions,
  getQuiltGameVersions,
  getNeoforgeVersions,
  getNeoforgeGameVersions,
  getForgeVersions,
  getForgeGameVersions,
  createInstance,
  prepareInstance,
  getSettings,
  companionSupportedVersions,
} from "../ipc/commands";
import { loaderBadgeClass, loaderLabel, loaderBannerColor } from "../lib/loader";
import {
  IconCube,
  IconLayers,
  IconBolt,
  IconWand,
  IconPuzzle,
  IconCheck,
  IconShieldCheck,
  IconPlus,
  IconX,
} from "../components/Icons";

interface LoaderInfo {
  id: string;
  name: string;
  desc: string;
  tag: string;
  colorClass: string;
  icon: () => any;
}

const LOADER_INFOS: LoaderInfo[] = [
  {
    id: "vanilla",
    name: "Vanilla",
    desc: "Clean official game without modding framework",
    tag: "Official",
    colorClass: "green",
    icon: () => <IconCube />,
  },
  {
    id: "fabric",
    name: "Fabric",
    desc: "Lightweight, modular, and fast modern mod loader",
    tag: "Popular",
    colorClass: "fabric",
    icon: () => <IconLayers />,
  },
  {
    id: "neoforge",
    name: "NeoForge",
    desc: "Modern community successor to Forge for 1.20.2+",
    tag: "Modern",
    colorClass: "purple",
    icon: () => <IconBolt />,
  },
  {
    id: "forge",
    name: "Forge",
    desc: "Classic heavyweight modding framework",
    tag: "Classic",
    colorClass: "orange",
    icon: () => <IconWand />,
  },
  {
    id: "quilt",
    name: "Quilt",
    desc: "Community fork of Fabric with wide compatibility",
    tag: "Modular",
    colorClass: "quilt",
    icon: () => <IconPuzzle />,
  },
];

const CreateCustom: Component = () => {
  const [name, setName] = createSignal("");
  const [loader, setLoader] = createSignal<string>("vanilla");
  const [gameVersion, setGameVersion] = createSignal("");
  const [loaderVersionMode, setLoaderVersionMode] = createSignal<"stable" | "latest" | "other">("stable");
  const [creating, setCreating] = createSignal(false);
  const [versionDropOpen, setVersionDropOpen] = createSignal(false);
  const [versionQuery, setVersionQuery] = createSignal("");
  const [triggerRect, setTriggerRect] = createSignal<DOMRect | null>(null);
  let triggerEl: HTMLDivElement | undefined;
  let panelEl: HTMLDivElement | undefined;

  const updateRect = () => { if (triggerEl) setTriggerRect(triggerEl.getBoundingClientRect()); };
  const toggleVersionDrop = () => {
    if (versionDropOpen()) { setVersionDropOpen(false); return; }
    setVersionQuery("");
    updateRect();
    setVersionDropOpen(true);
  };

  const panelStyle = () => {
    const r = triggerRect();
    if (!r) return "";
    const margin = 4;
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const openAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
    const maxH = Math.max(160, Math.min(300, (openAbove ? spaceAbove : spaceBelow) - 12));
    const vert = openAbove
      ? `bottom:${Math.round(window.innerHeight - r.top + margin)}px`
      : `top:${Math.round(r.bottom + margin)}px`;
    return `position:fixed;left:${Math.round(r.left)}px;width:${Math.round(r.width)}px;${vert};max-height:${maxH}px`;
  };

  createEffect(() => {
    if (!versionDropOpen()) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelEl?.contains(t) || triggerEl?.contains(t)) return;
      setVersionDropOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setVersionDropOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    onCleanup(() => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    });
  });

  const [versions] = createResource(async () => {
    const settings = await getSettings();
    return getGameVersions(settings.show_snapshots);
  });
  const [fabricVersions] = createResource(getFabricLoaderVersions);
  const [fabricGameVersions] = createResource(getFabricGameVersions);
  const [quiltVersions] = createResource(getQuiltLoaderVersions);
  const [quiltGameVersions] = createResource(getQuiltGameVersions);
  const [neoforgeGameVersions] = createResource(getNeoforgeGameVersions);
  const [forgeGameVersions] = createResource(getForgeGameVersions);

  const [companionVersions] = createResource(() => loader(), (l) => companionSupportedVersions(l));
  const isCompanionSupported = (id: string) => !!id && (companionVersions() || []).includes(id);

  const isLegacyVersion = () => {
    const gv = selectedGameVersion();
    const parts = gv.split(".");
    if (parts[0] !== "1") return false;
    if (parts.length < 2) return true;
    return parseInt(parts[1]) < 14;
  };

  const gameVersionList = () => {
    const all = versions() || [];
    const l = loader();
    if (l === "vanilla") return all;
    if (l === "fabric") { const s = fabricGameVersions() || []; return s.length ? all.filter(v => s.includes(v.id)) : all; }
    if (l === "neoforge") { const s = neoforgeGameVersions() || []; return s.length ? all.filter(v => s.includes(v.id)) : all; }
    if (l === "forge") { const s = forgeGameVersions() || []; return s.length ? all.filter(v => s.includes(v.id)) : all; }
    if (l === "quilt") { const s = quiltGameVersions() || []; return s.length ? all.filter(v => s.includes(v.id)) : all; }
    return all;
  };

  const selectedGameVersion = () => gameVersion() || (gameVersionList().length > 0 ? gameVersionList()[0].id : "");
  const latestVersionId = () => { const l = gameVersionList(); return l.length > 0 ? l[0].id : ""; };
  const filteredVersions = () => {
    const q = versionQuery().trim().toLowerCase();
    const all = gameVersionList();
    return q ? all.filter(v => v.id.toLowerCase().includes(q)) : all;
  };

  const [neoforgeVersions] = createResource(() => selectedGameVersion(), (gv) => gv ? getNeoforgeVersions(gv) : Promise.resolve([]));
  const [forgeVersions] = createResource(() => selectedGameVersion(), (gv) => gv ? getForgeVersions(gv) : Promise.resolve([]));

  const loaderVersion = () => {
    const mode = loaderVersionMode();
    const l = loader();
    if (l === "fabric") { const fv = fabricVersions(); if (!fv?.length) return null; return mode === "stable" ? (fv.find(v => v.stable)?.version || fv[0].version) : fv[0].version; }
    if (l === "quilt") { const qv = quiltVersions(); return qv?.length ? qv[0].version : null; }
    if (l === "neoforge") { const nv = neoforgeVersions(); return nv?.length ? nv[0].version : null; }
    if (l === "forge") { const fv = forgeVersions(); if (!fv?.length) return null; return mode === "stable" ? (fv.find(v => v.stable)?.version || fv[0].version) : fv[0].version; }
    return null;
  };

  const suggestedName = createMemo(() => {
    const l = loaderLabel(loader());
    const v = selectedGameVersion();
    return v ? `${l} ${v}` : l;
  });

  const handleCreate = async () => {
    const instanceName = name().trim() || suggestedName();
    if (!instanceName) return;
    setCreating(true);
    try {
      const instance = await createInstance({
        name: instanceName,
        game_version: selectedGameVersion(),
        loader_type: loader(),
        loader_version: loader() === "vanilla" ? null : loaderVersion() || null,
        icon: null,
        memory_max_mb: 4096,
      });
      await refetchInstances();
      refreshPinnedInstanceIds().catch(() => {});
      setActiveScreen("library");
      prepareInstance(instance.id).catch((e) => {
        showToast({ title: "Install failed", message: String(e), type: "error", autoCloseMs: 8000 });
      });
    } catch (e) {
      console.error("Failed to create instance:", e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div class="screen-enter create-custom-screen">
      {/* Top Header */}
      <div class="page-header" style="margin-bottom: var(--space-4);">
        <div class="page-title-group">
          <div class="page-title">Custom Setup</div>
          <div class="page-subtitle">Configure your Minecraft version, mod loader, and instance identity</div>
        </div>
      </div>

      {/* 2-Column Responsive Layout */}
      <div class="create-custom-layout">
        {/* Left Column: Form Sections */}
        <div class="create-form-column">
          {/* ═══ SECTION 1: INSTANCE IDENTITY ═══ */}
          <div class="card-gamemode-section">
            <div class="card-section-header">
              <span class="card-section-tag tag-settings-general">IDENTITY</span>
              <span class="card-section-label">Instance Profile</span>
              <span class="card-section-desc">Choose a unique display name for your new instance</span>
            </div>
            <div class="card-section-body">
              <div class="setting-row">
                <div class="setting-text">
                  <div class="setting-name">Instance Name</div>
                  <div class="setting-desc">Visible across Library and Continue shelves</div>
                </div>
                <div class="setting-control" style="flex: 1; max-width: 320px; display: flex; gap: 8px;">
                  <input
                    class="field-control field-control--text"
                    placeholder={`e.g. ${suggestedName()}`}
                    value={name()}
                    onInput={(e) => setName(e.currentTarget.value)}
                    style="flex: 1;"
                  />
                  <button
                    type="button"
                    class="btn btn--sm btn--neutral"
                    onClick={() => setName(suggestedName())}
                    data-tip={`Set name to "${suggestedName()}"`}
                    style="white-space: nowrap;"
                  >
                    Auto-name
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ SECTION 2: MOD LOADER SELECTION ═══ */}
          <div class="card-gamemode-section">
            <div class="card-section-header">
              <span class="card-section-tag tag-settings-account">LOADER</span>
              <span class="card-section-label">Modding Framework</span>
              <span class="card-section-desc">Select the runtime environment for your instance</span>
            </div>
            <div class="card-section-body">
              <div class="loader-grid">
                <For each={LOADER_INFOS}>
                  {(item) => {
                    const isSelected = () => loader() === item.id;
                    return (
                      <div
                        class="loader-card"
                        classList={{ selected: isSelected() }}
                        onClick={() => {
                          setLoader(item.id);
                          setGameVersion("");
                        }}
                      >
                        <div class={`loader-card-icon ${item.colorClass}`}>
                          {item.icon()}
                        </div>
                        <div class="loader-card-info">
                          <div class="loader-card-top">
                            <span class="loader-card-name">{item.name}</span>
                            <span class="loader-card-tag">{item.tag}</span>
                          </div>
                          <div class="loader-card-desc">{item.desc}</div>
                        </div>
                        <Show when={isSelected()}>
                          <div class="loader-card-check">
                            <IconCheck />
                          </div>
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          </div>

          {/* ═══ SECTION 3: VERSION SELECTION ═══ */}
          <div class="card-gamemode-section">
            <div class="card-section-header">
              <span class="card-section-tag tag-settings-storage">VERSIONS</span>
              <span class="card-section-label">Game & Runtime Version</span>
              <span class="card-section-desc">Select Minecraft release and compatible loader build</span>
            </div>
            <div class="card-section-body">
              {/* Game Version Plate */}
              <div class="setting-row">
                <div class="setting-text">
                  <div class="setting-name">Minecraft Version</div>
                  <div class="setting-desc">Select release or snapshot version for this instance</div>
                </div>
                <div class="setting-control" style="flex: 1; max-width: 320px;">
                  <Show when={gameVersionList().length > 0} fallback={<div class="settings-val">Loading versions...</div>}>
                    <div class="custom-dropdown" style="--dropdown-height:var(--control-height-md)">
                      <div class="custom-dropdown-selected" ref={triggerEl} onClick={toggleVersionDrop}>
                        <span>{selectedGameVersion() || "Select version"}{latestVersionId() === selectedGameVersion() ? " (latest)" : ""}</span>
                        <Show when={isCompanionSupported(selectedGameVersion())}>
                          <span class="companion-tag tip-below" data-tip="Vermeil companion mod supported">
                            <IconShieldCheck /> Companion
                          </span>
                        </Show>
                        <span class="custom-dropdown-arrow" classList={{ open: versionDropOpen() }}>▾</span>
                      </div>
                      <Show when={versionDropOpen()}>
                        <Portal>
                          <div class="custom-dropdown-options custom-dropdown-options--floating" ref={panelEl} style={panelStyle()}>
                            <input
                              class="custom-dropdown-search"
                              placeholder="Search versions..."
                              value={versionQuery()}
                              onInput={(e) => setVersionQuery(e.currentTarget.value)}
                              ref={(el) => setTimeout(() => el.focus(), 0)}
                            />
                            <div class="custom-dropdown-scroll">
                              <For each={filteredVersions()}>
                                {(v) => (
                                  <div
                                    class="custom-dropdown-option"
                                    classList={{ selected: selectedGameVersion() === v.id }}
                                    onClick={() => { setGameVersion(v.id); setVersionDropOpen(false); }}
                                  >
                                    <span>{v.id}{latestVersionId() === v.id ? " (latest)" : ""}</span>
                                    <Show when={isCompanionSupported(v.id)}>
                                      <img class="companion-version-mark" src="/logo.png" alt="" title="Vermeil companion mod supported" draggable={false} />
                                    </Show>
                                  </div>
                                )}
                              </For>
                              <Show when={filteredVersions().length === 0}>
                                <div class="custom-dropdown-empty">No versions match "{versionQuery()}"</div>
                              </Show>
                            </div>
                          </div>
                        </Portal>
                      </Show>
                    </div>
                  </Show>
                </div>
              </div>

              {/* Mod Loader Build Channel Plate (Only when loader !== "vanilla") */}
              <Show when={loader() !== "vanilla"}>
                <div class="setting-row">
                  <div class="setting-text">
                    <div class="setting-name">{loaderLabel(loader())} Build Channel</div>
                    <div class="setting-desc">Stable is recommended for standard gameplay; Beta includes preview fixes</div>
                  </div>
                  <div class="setting-control" style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
                    <div class="loader-build-toggles">
                      <button
                        type="button"
                        class={`btn btn--sm ${loaderVersionMode() === "stable" ? "btn--primary" : "btn--neutral"}`}
                        onClick={() => setLoaderVersionMode("stable")}
                      >
                        Stable
                      </button>
                      <button
                        type="button"
                        class={`btn btn--sm ${loaderVersionMode() === "latest" ? "btn--primary" : "btn--neutral"}`}
                        onClick={() => setLoaderVersionMode("latest")}
                      >
                        Beta / Latest
                      </button>
                    </div>
                    <Show when={loaderVersion()}>
                      <div class="loader-resolved-badge">
                        <span>Build:</span>
                        <code>{loader() === "fabric" && isLegacyVersion() ? "Legacy " : ""}{loaderVersion()}</code>
                      </div>
                    </Show>
                  </div>
                </div>
              </Show>

              {/* Companion Mod Status Notice */}
              <Show when={isCompanionSupported(selectedGameVersion())}>
                <div class="create-companion-banner">
                  <IconShieldCheck />
                  <div class="create-companion-text">
                    <span class="create-companion-title">Vermeil Companion Mod Supported</span>
                    <span class="create-companion-desc">In-game skin & cape sync, rich presence, and performance telemetry will be active for this instance.</span>
                  </div>
                </div>
              </Show>
            </div>
          </div>
        </div>

        {/* Right Column: Live Preview & Creation Station */}
        <div class="create-preview-column">
          <div class="create-preview-station">
            <div class="card-gamemode-section">
              <div class="card-section-header">
                <span class="card-section-tag tag-settings-performance">PREVIEW</span>
                <span class="card-section-label">Instance Card</span>
              </div>
              <div class="card-section-body" style="gap: 12px;">
                {/* Instance Card Preview */}
                <div class="card card--inst create-preview-card">
                  <div class="card-body">
                    <div class={`inst-card-icon ${loaderBannerColor(loader())}`}>
                      <span class="inst-card-icon-letter">
                        {(name().trim() || suggestedName() || "?").charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div class="inst-card-content">
                      <div class="card-title">
                        {name().trim() || suggestedName() || "New Instance"}
                      </div>
                      <div class="card-sub">
                        0 mods · Just created
                      </div>
                      <div class="inst-card-badges">
                        <span class="badge badge--version">{selectedGameVersion() || "..."}</span>
                        <span class={`badge badge--loader ${loaderBadgeClass(loader())}`}>
                          {loaderLabel(loader())}
                        </span>
                        <Show when={loader() !== "vanilla" && loaderVersion()}>
                          <span class="badge badge--vnum">{loaderVersion()}</span>
                        </Show>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Specification Table */}
                <div class="create-specs-box">
                  <div class="create-spec-row">
                    <span class="create-spec-label">Minecraft</span>
                    <span class="create-spec-value">{selectedGameVersion() || "Select version"}</span>
                  </div>
                  <div class="create-spec-row">
                    <span class="create-spec-label">Mod Loader</span>
                    <span class="create-spec-value">{loaderLabel(loader())}</span>
                  </div>
                  <Show when={loader() !== "vanilla"}>
                    <div class="create-spec-row">
                      <span class="create-spec-label">Loader Build</span>
                      <span class="create-spec-value">
                        {loaderVersion() || "Resolving..."} ({loaderVersionMode()})
                      </span>
                    </div>
                  </Show>
                  <div class="create-spec-row">
                    <span class="create-spec-label">Companion Mod</span>
                    <span
                      class="create-spec-value"
                      classList={{ "create-spec-value--active": isCompanionSupported(selectedGameVersion()) }}
                    >
                      {isCompanionSupported(selectedGameVersion()) ? "Supported" : "Not available"}
                    </span>
                  </div>
                  <div class="create-spec-row">
                    <span class="create-spec-label">Allocated RAM</span>
                    <span class="create-spec-value">4096 MB (Default)</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div class="create-actions-row">
                  <button
                    type="button"
                    class="btn btn--neutral btn--lg create-cancel-btn"
                    onClick={() => setActiveScreen("create-choose")}
                  >
                    <IconX /> Cancel
                  </button>
                  <button
                    type="button"
                    class="btn btn--primary btn--lg create-submit-btn"
                    onClick={handleCreate}
                    disabled={creating()}
                  >
                    <Show when={creating()} fallback={<><IconPlus /> Create Instance</>}>
                      Create Instance
                    </Show>
                  </button>
                </div>

                <div class="create-hint-text">
                  Ready to build. Click to set up files and register in Library.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateCustom;
