import { Component, createSignal, createResource, createEffect, onCleanup, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { setActiveScreen, refetchInstances, refreshPinnedInstanceIds, showToast } from "../App";
import { getGameVersions, getFabricLoaderVersions, getFabricGameVersions, getQuiltLoaderVersions, getQuiltGameVersions, getNeoforgeVersions, getNeoforgeGameVersions, getForgeVersions, getForgeGameVersions, createInstance, prepareInstance, getSettings, companionSupportedVersions } from "../ipc/commands";

const LOADERS = ["vanilla", "fabric", "neoforge", "forge", "quilt"] as const;

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

  const handleCreate = async () => {
    const instanceName = name().trim();
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
    <div class="screen-enter">
      <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-4)">
        <button class="btn btn--sm btn--ghost" onClick={() => setActiveScreen("create-choose")}>← Back</button>
        <span class="section-label" style="margin-bottom:0;border-bottom:none;padding-bottom:0">Custom setup</span>
      </div>

      <div class="settings-group" style="max-width:560px">
        <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:var(--space-2)">
          <div class="settings-key">Name</div>
          <input class="field-control field-control--text" placeholder="e.g. Fabric 1.21.4" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        </div>

        <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:var(--space-2)">
          <div class="settings-key">Loader</div>
          <div class="tab-strip">
            <For each={LOADERS}>
              {(l) => (
                <div class={`tab ${loader() === l ? "active" : ""}`} onClick={() => { setLoader(l); setGameVersion(""); }}>
                  {l === "neoforge" ? "NeoForge" : l.charAt(0).toUpperCase() + l.slice(1)}
                </div>
              )}
            </For>
          </div>
        </div>

        <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:var(--space-2)">
          <div class="settings-key">Game version</div>
          <Show when={gameVersionList().length > 0} fallback={<div class="settings-val">Loading versions...</div>}>
            <div class="custom-dropdown" style="--dropdown-height:var(--control-height-md)">
              <div class="custom-dropdown-selected" ref={triggerEl} onClick={toggleVersionDrop}>
                <span>{selectedGameVersion() || "Select version"}{latestVersionId() === selectedGameVersion() ? " (latest)" : ""}</span>
                <Show when={isCompanionSupported(selectedGameVersion())}>
                  <img class="companion-version-mark" src="/logo.png" alt="" title="Vermeil companion mod supported" draggable={false} />
                </Show>
                <span class="custom-dropdown-arrow" classList={{ open: versionDropOpen() }}>▾</span>
              </div>
              <Show when={versionDropOpen()}>
                <Portal>
                  <div class="custom-dropdown-options custom-dropdown-options--floating" ref={panelEl} style={panelStyle()}>
                    <input class="custom-dropdown-search" placeholder="Search versions..." value={versionQuery()} onInput={(e) => setVersionQuery(e.currentTarget.value)} ref={(el) => setTimeout(() => el.focus(), 0)} />
                    <div class="custom-dropdown-scroll">
                      <For each={filteredVersions()}>
                        {(v) => (
                          <div class="custom-dropdown-option" classList={{ selected: selectedGameVersion() === v.id }} onClick={() => { setGameVersion(v.id); setVersionDropOpen(false); }}>
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

        <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:var(--space-2)">
          <div class="settings-key">Loader version</div>
          <Show when={loader() !== "vanilla"} fallback={<div class="settings-val">No mod loader selected</div>}>
            <div class="tab-strip">
              <div class={`tab ${loaderVersionMode() === "stable" ? "active" : ""}`} onClick={() => setLoaderVersionMode("stable")}>Stable</div>
              <div class={`tab ${loaderVersionMode() === "latest" ? "active" : ""}`} onClick={() => setLoaderVersionMode("latest")}>Beta</div>
            </div>
            <Show when={loaderVersion()}>
              <div class="settings-val" style="margin-top:var(--space-1);font-family:var(--font-mono)">→ {loader() === "fabric" && isLegacyVersion() ? "Legacy " : ""}{loaderVersion()}</div>
            </Show>
          </Show>
        </div>
      </div>

      <div style="margin-top:var(--space-5)">
        <button class="btn btn--primary" onClick={handleCreate} disabled={creating() || !name().trim()}>
          {creating() ? "Creating..." : "+ Create instance"}
        </button>
      </div>
    </div>
  );
};

export default CreateCustom;
