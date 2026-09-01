import { Component, For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { ContentVersion, getCfModFiles, getModVersions } from "../ipc/commands";
import { filterVersions, resolveSelection } from "../lib/versionPick";
import { IconChevronDown, IconCheck, IconDownload } from "./Icons";

interface Props {
  source: "modrinth" | "curseforge";
  projectId: string;
  /** Instance loader — decides which entries come back marked compatible. */
  loader: string;
  gameVersion: string;
  /** "mod" | "resourcepack" | "shader" | "datapack" */
  category: string;
  /** Version currently installed, so the list can mark it. */
  installedVersionId?: string;
  /** True while an install for this project is in flight. */
  busy?: boolean;
  /** Install one specific version. `id` is a Modrinth version id or a CF file id. */
  onInstall: (version: ContentVersion) => void;
}

/**
 * Session cache of fetched version lists, so collapsing and re-expanding a card
 * doesn't re-hit a rate-limited API.
 *
 * Bounded because it would otherwise grow for every project a user ever
 * expands. Insertion-ordered eviction (Map preserves insertion order), which is
 * FIFO rather than LRU — good enough for a cache whose whole job is "the card I
 * just closed".
 */
const CACHE_LIMIT = 50;
const cache = new Map<string, ContentVersion[]>();

function cacheGet(key: string): ContentVersion[] | undefined {
  return cache.get(key);
}

function cacheSet(key: string, value: ContentVersion[]) {
  cache.set(key, value);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

const channelLabel = (c: string): string => {
  switch (c) {
    case "release": return "Release";
    case "beta": return "Beta";
    case "alpha": return "Alpha";
    default: return "";
  }
};

const formatSize = (bytes: number): string => {
  if (bytes <= 0) return "";
  if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(1) + " MB";
  if (bytes >= 1_000) return (bytes / 1_000).toFixed(1) + " KB";
  return bytes + " B";
};

/** Date only — the time of day is noise at this size. */
const formatDate = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

/**
 * Version list for one project, as a dropdown.
 *
 * The panel renders through a `<Portal>` with fixed positioning because the
 * `.card` it sits inside is `overflow: hidden` — an absolutely-positioned panel
 * gets clipped. Same reason and same rect math as the game-version picker in
 * `CreateCustom.tsx`.
 *
 * Compatibility is never computed here: the backend labels each entry using the
 * same functions the installer uses, so this component only renders `compatible`.
 */
const ModVersionPicker: Component<Props> = (props) => {
  const [versions, setVersions] = createSignal<ContentVersion[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [showAll, setShowAll] = createSignal(false);
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [triggerRect, setTriggerRect] = createSignal<DOMRect | null>(null);

  let triggerEl: HTMLDivElement | undefined;
  let panelEl: HTMLDivElement | undefined;

  const cacheKey = () =>
    `${props.source}:${props.projectId}:${props.loader}:${props.gameVersion}:${props.category}`;

  // Fetched once when the card expands — an explicit user action, so this isn't
  // speculative traffic. Never prefetched on hover.
  createEffect(() => {
    const key = cacheKey();
    const cached = cacheGet(key);
    if (cached) {
      setVersions(cached);
      setLoading(false);
      return;
    }
    let stale = false;
    onCleanup(() => { stale = true; });
    setLoading(true);
    setError(null);
    const request = props.source === "curseforge"
      ? getCfModFiles(props.projectId, props.loader, props.gameVersion)
      : getModVersions(props.projectId, props.loader, props.gameVersion, props.category);
    request
      .then((list) => {
        if (stale) return;
        cacheSet(key, list);
        setVersions(list);
      })
      .catch((e) => {
        if (stale) return;
        setError(typeof e === "string" ? e : "Couldn't load versions");
      })
      .finally(() => { if (!stale) setLoading(false); });
  });

  /** Defaults to whatever the plain Install button would pick. */
  const effectiveSelected = () => resolveSelection(versions(), selectedId());
  const visible = () => filterVersions(versions(), { showAll: showAll(), query: query() });

  const incompatibleCount = () => versions().filter((v) => !v.compatible).length;

  const updateRect = () => {
    if (triggerEl) setTriggerRect(triggerEl.getBoundingClientRect());
  };

  const toggle = () => {
    if (open()) { setOpen(false); return; }
    setQuery("");
    updateRect();
    setOpen(true);
  };

  /** Fixed-position panel geometry, flipping above the trigger when tight. */
  const panelStyle = () => {
    const r = triggerRect();
    if (!r) return "";
    const margin = 4;
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const openAbove = spaceBelow < 240 && spaceAbove > spaceBelow;
    const maxH = Math.max(180, Math.min(340, (openAbove ? spaceAbove : spaceBelow) - 12));
    const vert = openAbove
      ? `bottom:${Math.round(window.innerHeight - r.top + margin)}px`
      : `top:${Math.round(r.bottom + margin)}px`;
    return `position:fixed;left:${Math.round(r.left)}px;width:${Math.round(r.width)}px;${vert};max-height:${maxH}px`;
  };

  createEffect(() => {
    if (!open()) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelEl?.contains(t) || triggerEl?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
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

  return (
    <div class="version-picker">
      <div class="version-picker-head">
        <span class="control-label">Version</span>
        <Show when={incompatibleCount() > 0}>
          <button
            class={`btn btn--sm btn--ghost ${showAll() ? "btn-active" : ""}`}
            onClick={() => setShowAll(!showAll())}
            title={`${incompatibleCount()} version(s) don't match ${props.loader} ${props.gameVersion}`}
          >
            {showAll() ? "Compatible only" : `Show all (${versions().length})`}
          </button>
        </Show>
      </div>

      <Show when={!loading()} fallback={<div class="version-picker-status">Loading versions...</div>}>
        <Show when={!error()} fallback={<div class="version-picker-status is-error">{error()}</div>}>
          <Show
            when={versions().length > 0}
            fallback={<div class="version-picker-status">No versions published.</div>}
          >
            <div class="version-picker-row">
              <div class="custom-dropdown" style="--dropdown-height:var(--control-height-md)">
                <div class="custom-dropdown-selected" ref={triggerEl} onClick={toggle}>
                  <span class="version-picker-selected-label">
                    {effectiveSelected()?.name ?? "Select version"}
                  </span>
                  <Show when={effectiveSelected()?.recommended}>
                    <span class="version-tag version-tag--rec">auto</span>
                  </Show>
                  <span class="custom-dropdown-arrow" classList={{ open: open() }}>
                    <IconChevronDown />
                  </span>
                </div>
                <Show when={open()}>
                  <Portal>
                    <div
                      class="custom-dropdown-options custom-dropdown-options--floating version-picker-panel"
                      ref={panelEl}
                      style={panelStyle()}
                    >
                      <input
                        class="custom-dropdown-search"
                        placeholder="Search versions..."
                        value={query()}
                        onInput={(e) => setQuery(e.currentTarget.value)}
                        ref={(el) => setTimeout(() => el.focus(), 0)}
                      />
                      <div class="custom-dropdown-scroll">
                        <For each={visible()}>
                          {(v) => (
                            <div
                              class="custom-dropdown-option version-option"
                              classList={{
                                selected: effectiveSelected()?.id === v.id,
                                "is-incompatible": !v.compatible,
                              }}
                              onClick={() => { setSelectedId(v.id); setOpen(false); }}
                            >
                              <div class="version-option-main">
                                <span class="version-option-name">{v.name}</span>
                                <div class="version-option-tags">
                                  <Show when={channelLabel(v.channel)}>
                                    <span class={`version-tag version-tag--${v.channel}`}>
                                      {channelLabel(v.channel)}
                                    </span>
                                  </Show>
                                  <Show when={v.recommended}>
                                    <span class="version-tag version-tag--rec">auto</span>
                                  </Show>
                                  <Show when={props.installedVersionId === v.id}>
                                    <span class="version-tag version-tag--installed">installed</span>
                                  </Show>
                                  <Show when={!v.compatible}>
                                    <span class="version-tag version-tag--warn">incompatible</span>
                                  </Show>
                                </div>
                              </div>
                              <div class="version-option-meta">
                                <Show when={v.game_versions.length > 0}>
                                  <span>{v.game_versions.slice(0, 4).join(", ")}{v.game_versions.length > 4 ? " +" : ""}</span>
                                </Show>
                                <Show when={v.loaders.length > 0}>
                                  <span>· {v.loaders.join(", ")}</span>
                                </Show>
                                <Show when={formatDate(v.date_published)}>
                                  <span>· {formatDate(v.date_published)}</span>
                                </Show>
                                <Show when={formatSize(v.size)}>
                                  <span>· {formatSize(v.size)}</span>
                                </Show>
                              </div>
                            </div>
                          )}
                        </For>
                        <Show when={visible().length === 0}>
                          <div class="custom-dropdown-empty">
                            {query() ? `No versions match "${query()}"` : "No compatible versions."}
                          </div>
                        </Show>
                      </div>
                    </div>
                  </Portal>
                </Show>
              </div>

              {/* Fixed width across all three labels ("Install" / "Installed" /
                  "...") so the row can't shift as the state changes. */}
              <button
                class="btn btn--sm btn--primary btn--fixed"
                style="--btn-fixed-width:92px"
                disabled={
                  props.busy
                  || !effectiveSelected()
                  || props.installedVersionId === effectiveSelected()?.id
                }
                onClick={() => {
                  const v = effectiveSelected();
                  if (v) props.onInstall(v);
                }}
              >
                <Show when={!props.busy} fallback={"..."}>
                  <Show
                    when={props.installedVersionId === effectiveSelected()?.id}
                    fallback={<><IconDownload /> Install</>}
                  >
                    <IconCheck /> Installed
                  </Show>
                </Show>
              </button>
            </div>

            <Show when={effectiveSelected() && !effectiveSelected()!.compatible}>
              <div class="version-picker-warn">
                This version doesn't list {props.loader} {props.gameVersion}. Installing it anyway
                can stop the instance from launching.
              </div>
            </Show>
          </Show>
        </Show>
      </Show>
    </div>
  );
};

export default ModVersionPicker;
