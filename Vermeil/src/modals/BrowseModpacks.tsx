import { Component, createSignal, createEffect, onCleanup, For, Show } from "solid-js";
import { setActiveScreen, refetchInstances, refreshPinnedInstanceIds, instances, trackDownload, completeDownload, failDownload, showToast, setDockPagination } from "../App";
import { searchModpacks, searchCurseforge, installModpack, installCfModpack, ModHit } from "../ipc/commands";
import Dropdown from "../components/Dropdown";
import { IconModrinth, IconCurseForge, IconLayers } from "../components/Icons";
import { createGridPageSize } from "../lib/gridPageSize";

const LOADER_ORDER = ["fabric", "quilt", "forge", "neoforge"];
function extractLoaders(hit: ModHit): string[] {
  const cats = hit.categories ?? [];
  return LOADER_ORDER.filter(l => cats.includes(l));
}

function extractVersionRange(hit: ModHit): string {
  const versions = hit.versions ?? [];
  if (versions.length === 0) return "";
  if (versions.length === 1) return versions[0];
  const recent = versions.slice(-3).reverse();
  return recent.join(", ");
}

const BrowseModpacks: Component = () => {
  // Column-aware page size: measures the grid and fills rows evenly at any
  // window size. track/gap/rowHeight match the .card-grid--compact + card--mod
  // geometry. Re-searches when the computed size changes (resize/maximize).
  const pageSize = createGridPageSize({ track: 240, gap: 12, rowHeight: 180, maxRows: 4 });

  const [query, setQuery] = createSignal("");
  const [results, setResults] = createSignal<ModHit[]>([]);
  const [, setSearching] = createSignal(false);
  const [installing, setInstalling] = createSignal<string | null>(null);
  const [confirmPack, setConfirmPack] = createSignal<ModHit | null>(null);
  const [page, setPage] = createSignal(1);
  const [totalHits, setTotalHits] = createSignal(0);
  const [sortBy, setSortBy] = createSignal("relevance");
  const [loaderFilter, setLoaderFilter] = createSignal("");
  const [modSource, setModSource] = createSignal<"modrinth" | "curseforge">("modrinth");

  const handleSourceToggle = () => {
    setModSource(modSource() === "modrinth" ? "curseforge" : "modrinth");
    setResults([]);
    setPage(1);
    doSearch(query(), 1);
  };

  const totalPages = () => Math.max(1, Math.ceil(totalHits() / pageSize.size()));

  let searchTimeout: number | undefined;
  let searchToken = 0;

  const doSearch = async (q: string, p: number) => {
    const token = ++searchToken;
    setSearching(true);
    try {
      const offset = (p - 1) * pageSize.size();
      const source = modSource();
      const result = source === "curseforge"
        ? await searchCurseforge(q, loaderFilter(), "", offset, pageSize.size(), sortBy(), "modpack")
        : await searchModpacks(q, offset, pageSize.size(), sortBy(), loaderFilter());
      if (token !== searchToken) return;
      setResults(result.hits);
      setTotalHits(result.total_hits);
    } catch (e) {
      if (token !== searchToken) return;
      console.error("Modpack search failed:", e);
      showToast({
        title: `${modSource() === "curseforge" ? "CurseForge" : "Modrinth"} search failed`,
        message: typeof e === "string" ? e : "Couldn't load results — try again.",
        type: "error",
      });
    } finally {
      if (token === searchToken) setSearching(false);
    }
  };

  const handleSearch = (q: string) => { setQuery(q); setPage(1); clearTimeout(searchTimeout); searchTimeout = window.setTimeout(() => doSearch(q, 1), 300); };
  const goPage = (p: number) => { if (p < 1 || p > totalPages()) return; setPage(p); doSearch(query(), p); };
  const handleFilterChange = () => { setPage(1); doSearch(query(), 1); };

  // Re-search when grid size changes (window resize/maximize).
  createEffect(() => {
    pageSize.size(); // track
    doSearch(query(), 1);
    setPage(1);
  });

  // Wire the dock's floating page slider for multi-page navigation.
  createEffect(() => {
    if (totalPages() > 1) {
      setDockPagination({ current: page(), total: totalPages(), onPageChange: goPage });
    } else {
      setDockPagination(null);
    }
  });
  onCleanup(() => setDockPagination(null));



  const getInstalledInstances = (projectId: string) => (instances() || []).filter(i => i.source_project_id === projectId);
  const getInstallCount = (projectId: string): number => getInstalledInstances(projectId).length;

  const handleInstallClick = (pack: ModHit) => {
    if (getInstallCount(pack.project_id) > 0) { setConfirmPack(pack); } else { doInstall(pack); }
  };

  const doInstall = async (pack: ModHit) => {
    setConfirmPack(null);
    setInstalling(pack.project_id);
    setActiveScreen("library");

    const dlId = trackDownload(pack.title, "modpack", {
      iconUrl: pack.icon_url,
      loader: extractLoaders(pack)[0] || "",
      gameVersion: extractVersionRange(pack),
      versionNumber: pack.version_name ?? undefined,
    });

    const installPromise = modSource() === "curseforge"
      ? installCfModpack(pack.project_id, pack.latest_version ?? undefined)
      : installModpack(pack.project_id);

    installPromise
      .then(() => { refetchInstances(); refreshPinnedInstanceIds().catch(() => {}); completeDownload(dlId); })
      .catch((e) => { console.error("Modpack install failed:", e); failDownload(dlId); alert(typeof e === "string" ? e : "Install failed"); })
      .finally(() => setInstalling(null));
  };

  const formatDownloads = (n: number): string => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
    return n.toString();
  };

  return (
    <div class="screen-enter">
      <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-4)">
        <button class="btn btn--sm btn--ghost" onClick={() => setActiveScreen("create-choose")}>← Back</button>
        <span class="section-label" style="margin-bottom:0;border-bottom:none;padding-bottom:0">Browse Modpacks</span>
      </div>

      {/* Controls row */}
      <div style="display:flex;gap:var(--space-2);align-items:center;margin-bottom:var(--space-3)">
        <button class="btn mod-source-toggle" onClick={handleSourceToggle} title={modSource() === "modrinth" ? "Switch to CurseForge" : "Switch to Modrinth"}>
          <Show when={modSource() === "modrinth"} fallback={<span class="mod-source-badge cf"><IconCurseForge /></span>}>
            <span class="mod-source-badge mr"><IconModrinth /></span>
          </Show>
        </button>
        <div class="search-field" style="flex:1">
          <input class="field-control field-control--text" placeholder={modSource() === "modrinth" ? "Search Modrinth modpacks..." : "Search CurseForge modpacks..."} value={query()} onInput={(e) => handleSearch(e.currentTarget.value)} />
        </div>
        <Dropdown value={sortBy()} options={[{ value: "relevance", label: "Relevance" }, { value: "downloads", label: "Downloads" }, { value: "follows", label: "Follows" }, { value: "newest", label: "Newest" }, { value: "updated", label: "Updated" }]} onChange={(v) => { setSortBy(v); handleFilterChange(); }} width="110px" />
        <Dropdown value={loaderFilter()} options={[{ value: "", label: "All loaders" }, { value: "fabric", label: "Fabric" }, { value: "forge", label: "Forge" }, { value: "neoforge", label: "NeoForge" }, { value: "quilt", label: "Quilt" }]} onChange={(v) => { setLoaderFilter(v); handleFilterChange(); }} width="120px" />
      </div>

      {/* Confirmation dialog */}
      <Show when={confirmPack()}>
        <div style="background:var(--surface-panel);border:1px solid var(--border);padding:12px;margin-bottom:12px">
          <div style="font-size:var(--fs-xs);color:var(--text);margin-bottom:8px">
            You already have <strong>{getInstallCount(confirmPack()!.project_id)}</strong> instance(s) of <strong>{confirmPack()!.title}</strong>:
          </div>
          <div style="max-height:80px;overflow-y:auto;margin-bottom:8px">
            <For each={getInstalledInstances(confirmPack()!.project_id)}>
              {(inst) => <div style="font-size:var(--fs-xs);color:var(--muted);padding:2px 0">• {inst.name}</div>}
            </For>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn btn--primary btn--sm" onClick={() => doInstall(confirmPack()!)}>Install Anyway</button>
            <button class="btn btn--ghost btn--sm" onClick={() => setConfirmPack(null)}>Cancel</button>
          </div>
        </div>
      </Show>

      {/* Results grid */}
      <div class="card-grid card-grid--compact" ref={pageSize.setEl}>
        <For each={results()}>
          {(pack) => {
            const count = () => getInstallCount(pack.project_id);
            return (
              <div class="card card--mod" style="position:relative">
                <div class="mod-card-header">
                  <div class="mod-card-icon" style="background:var(--accent-soft)">
                    <Show when={pack.icon_url} fallback={<IconLayers />}>
                      <img src={pack.icon_url!} style="width:100%;height:100%;border-radius:0;object-fit:cover" />
                    </Show>
                  </div>
                  <div class="mod-card-name-wrap">
                    <div class="mod-card-name">{pack.title}</div>
                    <Show when={pack.author}><div class="mod-card-author">by {pack.author}</div></Show>
                  </div>
                  <Show when={count() > 0}>
                    <span class="badge badge--version" style="font-size:9px;margin-left:auto">Installed{count() > 1 ? ` (${count()})` : ""}</span>
                  </Show>
                </div>
                <div class="mod-card-desc">{pack.description}</div>
                <div class="mod-card-tags">
                  <For each={extractLoaders(pack)}>{(l) => <span class={`badge badge--loader badge--${l}`}>{l}</span>}</For>
                  <Show when={extractVersionRange(pack)}><span class="badge badge--version">{extractVersionRange(pack)}</span></Show>
                  <Show when={pack.version_name}><span class="badge badge--vnum" title={pack.version_name!}>{pack.version_name}</span></Show>
                </div>
                <div class="mod-card-footer">
                  <div class="mod-card-meta">↓ {formatDownloads(pack.downloads)} · ♥ {formatDownloads(pack.follows)}</div>
                  <div class="mod-card-actions">
                    <button class="btn btn--primary btn--sm" disabled={installing() === pack.project_id} onClick={() => handleInstallClick(pack)}>
                      {installing() === pack.project_id ? "Installing..." : "Install"}
                    </button>
                  </div>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
};

export default BrowseModpacks;
