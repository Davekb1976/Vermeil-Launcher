import { Component, For, Show, createSignal, createMemo, onMount, onCleanup } from "solid-js";
import {
  setActiveScreen,
  setActiveInstanceId,
  activeInstanceId,
  setInitialInstanceTab,
  instances,
  refetchInstances,
  refreshPinnedInstanceIds,
  pinnedInstanceIds,
  downloads,
  currentThemeLogo,
} from "../App";
import { InstanceSummary, deleteInstances, getSettings } from "../ipc/commands";
import {
  IconPlus,
  IconModrinth,
  IconCurseForge,
  IconX,
  IconSearch,
  IconTrash2,
  IconFolderOpen,
  IconDownload,
  IconPin,
} from "../components/Icons";
import Dropdown from "../components/Dropdown";
import { loaderBadgeClass, loaderLabel } from "../lib/loader";
import { resolveAssetUrl } from "../lib/assets";
import { openPinInstancesModal } from "../modals/PinInstancesModal";

/** Library sort modes. Persisted in localStorage so the choice sticks between
 *  sessions (a pure view preference — kept out of the launcher settings file to
 *  avoid a full settings round-trip / clobber risk from this screen). */
type LibrarySort = "played" | "mostPlayed" | "created" | "name";
const SORT_STORAGE_KEY = "vermeil.librarySort";
const SORT_OPTIONS: { value: LibrarySort; label: string }[] = [
  { value: "played", label: "Recently played" },
  { value: "mostPlayed", label: "Most played" },
  { value: "created", label: "Recently created" },
  { value: "name", label: "Name (A–Z)" },
];

/** Epoch ms from an ISO date string, or 0 when absent/unparseable (so
 *  never-played / missing dates sort last in a descending order). */
function epoch(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const t = new Date(dateStr).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function bannerColor(loader: string): string {
  switch (loader) {
    case "fabric": return "fabric";
    case "quilt": return "quilt";
    case "neoforge": return "blue";
    case "forge": return "orange";
    default: return "green"; // vanilla
  }
}

/**
 * Resolve an instance's banner icon. We treat the literal `"cube"` value as
 * the sentinel "no real icon, fall back to the loader badge" because that's
 * what the backend writes for instances created without an `icon_url`.
 */
function instanceIconUrl(inst: { icon: string }): string | undefined {
  return resolveAssetUrl(inst.icon);
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never played";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function formatPlaytime(seconds: number): string {
  if (!seconds || seconds <= 0) return "0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

const Library: Component = () => {
  const [selectMode, setSelectMode] = createSignal(false);
  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = createSignal(false);
  const [deleteInput, setDeleteInput] = createSignal("");
  const [isDeleting, setIsDeleting] = createSignal(false);

  const [search, setSearch] = createSignal("");
  const [loaderFilter, setLoaderFilter] = createSignal("all");

  // Escape exits multi-select mode or clears search
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (selectMode()) {
        setSelectMode(false);
        setSelected(new Set<string>());
        setShowDeleteConfirm(false);
        setDeleteInput("");
      } else if (search()) {
        setSearch("");
      }
    }
  };
  onMount(() => document.addEventListener("keydown", handleKey));
  onCleanup(() => document.removeEventListener("keydown", handleKey));

  // Sort mode, seeded from localStorage so it persists across sessions.
  const storedSort = (typeof localStorage !== "undefined" && localStorage.getItem(SORT_STORAGE_KEY)) as LibrarySort | null;
  const [sortBy, setSortBy] = createSignal<LibrarySort>(
    SORT_OPTIONS.some(o => o.value === storedSort) ? (storedSort as LibrarySort) : "played"
  );
  const changeSort = (v: string) => {
    setSortBy(v as LibrarySort);
    try { localStorage.setItem(SORT_STORAGE_KEY, v); } catch { /* non-fatal */ }
  };

  // Comparator for active sort mode
  const compare = (a: InstanceSummary, b: InstanceSummary): number => {
    switch (sortBy()) {
      case "mostPlayed": return (b.total_play_seconds || 0) - (a.total_play_seconds || 0);
      case "created": return epoch(b.created_at) - epoch(a.created_at);
      case "name": return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
      case "played":
      default: return epoch(b.last_played) - epoch(a.last_played);
    }
  };

  const allList = () => instances() ?? [];
  const pinnedSet = () => new Set(pinnedInstanceIds());

  const totalPlaySeconds = createMemo(() => {
    return allList().reduce((acc, i) => acc + (i.total_play_seconds || 0), 0);
  });

  const pinnedList = createMemo(() => {
    const pSet = pinnedSet();
    return allList().filter(i => pSet.has(i.id)).sort(compare);
  });

  // Unique loaders among installed instances for dynamic filter pills
  const availableLoaders = createMemo(() => {
    const set = new Set<string>();
    for (const inst of allList()) {
      set.add((inst.loader?.type || "vanilla").toLowerCase());
    }
    return Array.from(set).sort();
  });

  // Filtered instances
  const filteredInstances = createMemo(() => {
    let list = [...allList()];
    const q = search().trim().toLowerCase();
    const lFilter = loaderFilter().toLowerCase();

    if (q) {
      list = list.filter(inst =>
        (inst.name || "").toLowerCase().includes(q) ||
        (inst.game_version || "").toLowerCase().includes(q) ||
        (inst.loader?.type || "").toLowerCase().includes(q)
      );
    }

    if (lFilter === "pinned") {
      const pSet = pinnedSet();
      list = list.filter(inst => pSet.has(inst.id));
    } else if (lFilter === "played") {
      list = list.filter(inst => (inst.total_play_seconds || 0) > 0 || Boolean(inst.last_played));
    } else if (lFilter === "unplayed") {
      list = list.filter(inst => !inst.last_played && (!inst.total_play_seconds || inst.total_play_seconds === 0));
    } else if (lFilter !== "all") {
      list = list.filter(inst => (inst.loader?.type || "vanilla").toLowerCase() === lFilter);
    }

    list.sort(compare);
    return list;
  });

  // Transient drag-select state
  let dragStartId: string | null = null;
  let dragExtended = false;

  const toggleSelect = (id: string) => {
    const s = new Set(selected());
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  };

  const deleteSelected = async () => {
    const ids = Array.from(selected());
    if (ids.length === 0) return;

    setIsDeleting(true);
    try {
      await deleteInstances(ids);
      if (activeInstanceId() && ids.includes(activeInstanceId()!)) {
        setActiveInstanceId(null);
      }
      setSelected(new Set<string>());
      setSelectMode(false);
      setShowDeleteConfirm(false);
      setDeleteInput("");
      refetchInstances();
      refreshPinnedInstanceIds().catch(() => {});
    } catch (e) {
      console.error("Batch delete failed:", e);
    } finally {
      setIsDeleting(false);
    }
  };

  const openInstance = (inst: InstanceSummary) => {
    if (selectMode()) { toggleSelect(inst.id); return; }
    setActiveInstanceId(inst.id);
    setInitialInstanceTab("content");
    setActiveScreen("mods");
  };

  const isInstanceInstalling = (inst: InstanceSummary) => {
    return downloads().some(
      (d) =>
        d.status === "downloading" &&
        (d.instanceId ? d.instanceId === inst.id : d.category === "instance" && d.name === inst.name)
    );
  };

  const renderInstanceCard = (inst: InstanceSummary) => (
    <div
      class={`card--inst ${selectMode() && selected().has(inst.id) ? "inst-card-selected" : ""}`}
      style={{
        cursor: "pointer",
        opacity: isDeleting() && selected().has(inst.id) ? "0.4" : "1",
      }}
      onClick={() => {
        if (selectMode() && dragExtended) {
          dragExtended = false;
          dragStartId = null;
          return;
        }
        openInstance(inst);
        dragStartId = null;
      }}
      onMouseDown={(e) => {
        if (selectMode() && e.button === 0) {
          dragStartId = inst.id;
          dragExtended = false;
        }
      }}
      onMouseEnter={(e) => {
        if (selectMode() && e.buttons === 1 && dragStartId && dragStartId !== inst.id) {
          const s = new Set(selected());
          if (dragStartId && !s.has(dragStartId)) {
            s.add(dragStartId);
          }
          if (!s.has(inst.id)) {
            s.add(inst.id);
          }
          setSelected(s);
          dragExtended = true;
        }
      }}
    >
      {/* Flush Left Square Thumbnail */}
      <div class={`inst-card-thumb inst-card-icon ${bannerColor(inst.loader?.type || "vanilla")}`}>
        <Show when={instanceIconUrl(inst)} fallback={
          <span class="inst-card-thumb-letter">{(inst.name || "?").trim().charAt(0).toUpperCase() || "?"}</span>
        }>
          <img
            src={instanceIconUrl(inst)!}
            alt=""
            draggable={false}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </Show>
        <Show when={selectMode()}>
          <div class={`inst-card-check ${selected().has(inst.id) ? "is-selected" : ""}`}>
            <Show when={selected().has(inst.id)}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </Show>
          </div>
        </Show>
      </div>

      {/* Right Content Area: Title, Subtitle, Badges */}
      <div class="inst-card-body">
        <div class="inst-card-title" data-tip={inst.name}>
          {inst.name}
        </div>
        <div class="inst-card-sub">
          <Show
            when={isInstanceInstalling(inst)}
            fallback={`${inst.mod_count} ${inst.mod_count === 1 ? "mod" : "mods"} · ${timeAgo(inst.last_played)}`}
          >
            Downloading game files...
          </Show>
        </div>
        <div class="inst-card-badges">
          <div class="inst-card-badges-track">
            <Show when={isInstanceInstalling(inst)}>
              <span class="badge badge--installing tip-below" data-tip="Downloading game files and libraries">
                <IconDownload />
                Installing...
              </span>
            </Show>
            <Show when={pinnedSet().has(inst.id)}>
              <span
                class="badge badge--pinned tip-below"
                data-tip="Pinned to floating dock (click to manage)"
                style="cursor: pointer;"
                onClick={(e) => {
                  e.stopPropagation();
                  openPinInstancesModal();
                }}
              >
                <IconPin />
              </span>
            </Show>
            <Show when={!inst.last_played && (!inst.total_play_seconds || inst.total_play_seconds === 0)}>
              <span class="badge badge--unplayed">Unplayed</span>
            </Show>
            <span class="badge badge--version">{inst.game_version}</span>
            <span class={`badge badge--loader ${loaderBadgeClass(inst.loader?.type || "vanilla")}`}>
              {loaderLabel(inst.loader?.type || "vanilla")}
            </span>
            <Show when={inst.source_project_id && inst.source_version}>
              <span class="badge badge--vnum" data-tip={`Modpack version ${inst.source_version}`}>
                {inst.source_version}
              </span>
            </Show>
            <span class="badge badge--ram">{inst.java?.memory_max_mb ?? 4096} MB</span>
            <Show when={(inst.source_platforms || []).includes("modrinth")}>
              <span class="badge badge--source badge--modrinth tip-below" data-tip="Available on Modrinth">
                <IconModrinth />
              </span>
            </Show>
            <Show when={(inst.source_platforms || []).includes("curseforge")}>
              <span class="badge badge--source badge--curseforge tip-below" data-tip="Available on CurseForge">
                <IconCurseForge />
              </span>
            </Show>
            <Show when={inst.ingame_cape_supported}>
              <span class="badge badge--companion tip-below" data-tip="Vermeil companion mod supported">
                <img src="/logo.png" alt="Vermeil" draggable={false} />
              </span>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div class="screen-enter">
      {/* ═══ EMPTY STATE: Shown when 0 instances exist in the entire launcher ═══ */}
      <Show when={allList().length === 0}>
        <div class="page-title" style="margin-bottom:var(--space-4);">Library</div>
        <div class="library-empty-panel">
          <div class="library-empty-icon">
            <img src={currentThemeLogo()} alt="Vermeil" draggable={false} />
          </div>
          <div class="library-empty-title">No Instances Created Yet</div>
          <div class="library-empty-subtitle">
            Create a clean vanilla setup, explore community modpacks on Modrinth or CurseForge, or import an archive to start playing.
          </div>
          <div class="library-empty-actions">
            <button class="btn btn--primary" onClick={() => setActiveScreen("create-choose")}>
              <IconPlus />
              <span>Create Instance</span>
            </button>
            <button class="btn btn--neutral" onClick={() => setActiveScreen("create-modpack")}>
              <IconDownload />
              <span>Browse Modpacks</span>
            </button>
            <button class="btn btn--ghost" onClick={() => setActiveScreen("create-import")}>
              <IconFolderOpen />
              <span>Import Archive</span>
            </button>
          </div>
        </div>
      </Show>

      {/* ═══ MAIN LIBRARY VIEW: Shown when user has 1+ instances ═══ */}
      <Show when={allList().length > 0}>
        {/* Header with Title, Telemetry & Toolbar */}
        <div class="library-header">
          <div class="library-header-top">
            <div>
              <div class="page-title">Library</div>
              <div class="library-header-meta">
                <span>{allList().length} {allList().length === 1 ? "instance" : "instances"}</span>
                <span>·</span>
                <span
                  class="library-meta-link tip-below"
                  data-tip="Manage quick-launch pins"
                  onClick={openPinInstancesModal}
                >
                  {pinnedList().length} pinned
                </span>
                <span>·</span>
                <span>{formatPlaytime(totalPlaySeconds())} played</span>
              </div>
            </div>

            <div class="library-toolbar">
              <div class="library-search">
                <IconSearch />
                <input
                  type="text"
                  class="library-search-input"
                  placeholder="Filter instances..."
                  value={search()}
                  onInput={(e) => setSearch(e.currentTarget.value)}
                />
                <Show when={search()}>
                  <button class="library-search-clear" onClick={() => setSearch("")}>
                    <IconX />
                  </button>
                </Show>
              </div>

              <Dropdown
                value={sortBy()}
                options={SORT_OPTIONS}
                onChange={changeSort}
                width="150px"
              />

              <button
                class="btn tip-below tip-right"
                data-tip={selectMode() ? "Exit select mode" : "Batch delete"}
                onClick={() => {
                  setSelectMode(!selectMode());
                  setSelected(new Set<string>());
                  setShowDeleteConfirm(false);
                }}
              >
                {selectMode() ? <IconX /> : <IconTrash2 />}
              </button>
            </div>
          </div>

          {/* Filter Pills */}
          <div class="library-filter-pills">
            <button
              class={`library-filter-pill ${loaderFilter() === "all" ? "active" : ""}`}
              onClick={() => setLoaderFilter("all")}
            >
              All ({allList().length})
            </button>
            <Show when={pinnedList().length > 0}>
              <button
                class={`library-filter-pill ${loaderFilter() === "pinned" ? "active" : ""}`}
                onClick={() => setLoaderFilter("pinned")}
              >
                <IconPin />
                <span>Pinned ({pinnedList().length})</span>
              </button>
            </Show>
            <button
              class={`library-filter-pill ${loaderFilter() === "played" ? "active" : ""}`}
              onClick={() => setLoaderFilter("played")}
            >
              Played
            </button>
            <button
              class={`library-filter-pill ${loaderFilter() === "unplayed" ? "active" : ""}`}
              onClick={() => setLoaderFilter("unplayed")}
            >
              Unplayed
            </button>
            <For each={availableLoaders()}>
              {(loader) => (
                <button
                  class={`library-filter-pill ${loaderFilter() === loader ? "active" : ""}`}
                  onClick={() => setLoaderFilter(loader)}
                >
                  {loaderLabel(loader)}
                </button>
              )}
            </For>
          </div>
        </div>

        {/* ═══ SHELF 1: PINNED FAVORITES (Shown when browsing default view & pins exist) ═══ */}
        <Show when={!search() && loaderFilter() === "all" && pinnedList().length > 0}>
          <div class="library-section-shelf">
            <div class="section-label section-label--row">
              <div style="display:flex;align-items:center;gap:8px;">
                <span class="card-section-tag tag-settings-accent">PINNED FAVORITES ({pinnedList().length})</span>
                <span style="color:var(--text-muted);font-size:var(--fs-xs);">Quick-launch on floating dock</span>
              </div>
              <button class="btn btn--sm btn--subtle" onClick={openPinInstancesModal}>
                <IconPin />
                <span>Manage Pins</span>
              </button>
            </div>

            <div class="card-grid">
              <For each={pinnedList()}>
                {(inst) => renderInstanceCard(inst)}
              </For>
            </div>
          </div>
        </Show>

        {/* ═══ SHELF 2: ALL INSTANCES (OR SEARCH/FILTER RESULTS) ═══ */}
        <div class="library-section-shelf">
          <div class="section-label section-label--row">
            <Show when={search() || loaderFilter() !== "all"} fallback={
              <div style="display:flex;align-items:center;gap:8px;">
                <span class="card-section-tag tag-settings-general">ALL INSTANCES ({allList().length})</span>
              </div>
            }>
              <div style="display:flex;align-items:center;gap:8px;">
                <span class="card-section-tag tag-settings-general">RESULTS ({filteredInstances().length})</span>
                <span style="color:var(--text-muted);font-size:var(--fs-xs);">
                  Matching "{search() || loaderFilter()}"
                </span>
              </div>
              <button
                class="btn btn--xs btn--ghost"
                onClick={() => { setSearch(""); setLoaderFilter("all"); }}
              >
                Clear Filters
              </button>
            </Show>
          </div>

          <Show when={filteredInstances().length > 0} fallback={
            <div style="padding:var(--space-6);text-align:center;background:var(--surface-panel);border:1px dashed var(--border);color:var(--text-muted);font-size:var(--fs-sm);">
              No instances match your filter.
              <button class="btn btn--xs btn--neutral" style="margin-left:var(--space-2);" onClick={() => { setSearch(""); setLoaderFilter("all"); }}>
                Reset Filters
              </button>
            </div>
          }>
            <div class="card-grid">
              <For each={filteredInstances()}>
                {(inst) => renderInstanceCard(inst)}
              </For>

              {/* Add instance card */}
              <div class="add-card" onClick={() => setActiveScreen("create-choose")}>
                <div class="add-card-thumb">
                  <IconPlus />
                </div>
                <div class="add-card-body">
                  <span class="add-card-title">New instance</span>
                  <span class="add-card-sub">Create or import</span>
                </div>
              </div>
            </div>
          </Show>
        </div>
      </Show>

      {/* Floating action bar — appears at bottom-center when in select mode. */}
      <Show when={selectMode()}>
        <div class="library-delete-bar">
          <span style="font-size:var(--fs-xs);color:var(--text)">{selected().size} selected</span>
          <Show when={!showDeleteConfirm()} fallback={
            <>
              <input
                class="field-control field-control--text"
                style="max-width:120px;border-color:var(--danger)"
                placeholder="Type Confirm"
                value={deleteInput()}
                onInput={(e) => setDeleteInput(e.currentTarget.value)}
              />
              <button
                class="btn btn--danger"
                disabled={deleteInput() !== "Confirm" || isDeleting()}
                onClick={deleteSelected}
              >
                {isDeleting() ? "Deleting..." : "Delete All"}
              </button>
              <button
                class="btn btn--ghost"
                disabled={isDeleting()}
                onClick={() => { setShowDeleteConfirm(false); setDeleteInput(""); }}
              >
                Cancel
              </button>
            </>
          }>
            <button
              class="btn btn--danger"
              disabled={selected().size === 0 || isDeleting()}
              onClick={async () => {
                const settings = await getSettings();
                if (settings.force_delete) {
                  await deleteSelected();
                } else {
                  setShowDeleteConfirm(true);
                }
              }}
            >
              {isDeleting() ? "Deleting..." : `Delete (${selected().size})`}
            </button>
            <button
              class="btn btn--ghost"
              disabled={isDeleting()}
              onClick={() => { setSelectMode(false); setSelected(new Set<string>()); }}
            >
              Cancel
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default Library;
