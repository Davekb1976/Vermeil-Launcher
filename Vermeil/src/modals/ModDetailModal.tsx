import { Component, For, Show, createEffect, onCleanup } from "solid-js";
import ModVersionPicker from "../components/ModVersionPicker";
import { IconBolt, IconX } from "../components/Icons";
import { ContentVersion, ModHit } from "../ipc/commands";
import { formatDownloads, formatVersionRange } from "../lib/format";

interface Props {
  /** The mod to describe. `null` closes the modal. */
  mod: ModHit | null;
  source: "modrinth" | "curseforge";
  loader: string;
  gameVersion: string;
  category: string;
  /** Loader names to show as pills — the screen already knows how to derive these. */
  loaders: string[];
  installedVersionId?: string;
  busy?: boolean;
  onClose: () => void;
  onInstall: (version: ContentVersion) => void;
}

/**
 * Detail view for one Browse result: summary, a few facts, and the version
 * picker.
 *
 * An overlay rather than an in-place card expansion. Expanding the card meant
 * spanning the grid row and reflowing everything after it, which moved the rest
 * of the results around the thing the user was reading.
 *
 * The facts deliberately summarize. A project like Fabric API supports several
 * hundred game versions, and listing them all — which is what the first pass at
 * this did — produced a wall of text that buried the controls. The range plus a
 * count says the same thing in one line; the exact per-version support lives in
 * the picker, where it's attached to the version it describes.
 */
const ModDetailModal: Component<Props> = (props) => {
  // Capture phase + stopImmediatePropagation: the global handler in App.tsx
  // treats Escape on the instance screen as "back to Library", and it's
  // registered on `document` in the bubble phase. Capture runs first, so this
  // closes the modal without also navigating away.
  createEffect(() => {
    if (!props.mod) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      props.onClose();
    };
    document.addEventListener("keydown", onKey, true);
    onCleanup(() => document.removeEventListener("keydown", onKey, true));
  });

  const versionCount = () => props.mod?.versions?.length ?? 0;
  const environment = () => {
    const m = props.mod;
    if (!m) return "";
    const parts: string[] = [];
    if (m.client_side) parts.push(`client ${m.client_side}`);
    if (m.server_side) parts.push(`server ${m.server_side}`);
    return parts.join(" · ");
  };

  return (
    <Show when={props.mod}>
      {(mod) => (
        <div class="modal-overlay mod-detail-overlay" onClick={props.onClose}>
          <div class="modal mod-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal-header mod-detail-header">
              <div class="mod-detail-identity">
                <div class="mod-card-icon" style="background:var(--accent-soft)">
                  <Show when={mod().icon_url} fallback={<IconBolt />}>
                    <img src={mod().icon_url!} alt="" draggable={false}
                      style="width:100%;height:100%;object-fit:cover" />
                  </Show>
                </div>
                <div class="mod-detail-names">
                  <span class="modal-title">{mod().title}</span>
                  <Show when={mod().author}>
                    <span class="mod-detail-author">by {mod().author}</span>
                  </Show>
                </div>
              </div>
              <button class="modal-close" title="Close" onClick={props.onClose}><IconX /></button>
            </div>

            <div class="modal-body mod-detail-body">
              <p class="mod-detail-summary">{mod().description}</p>

              <div class="mod-detail-stats">
                <div class="mod-detail-stat">
                  <span class="mod-detail-stat-label">Downloads</span>
                  <span class="mod-detail-stat-value">{formatDownloads(mod().downloads)}</span>
                </div>
                <div class="mod-detail-stat">
                  <span class="mod-detail-stat-label">Followers</span>
                  <span class="mod-detail-stat-value">{formatDownloads(mod().follows)}</span>
                </div>
                <Show when={versionCount() > 0}>
                  <div class="mod-detail-stat">
                    <span class="mod-detail-stat-label">Game versions</span>
                    <span class="mod-detail-stat-value">
                      {formatVersionRange(mod().versions)}
                      <Show when={versionCount() > 1}>
                        <span class="mod-detail-stat-note">{versionCount()} total</span>
                      </Show>
                    </span>
                  </div>
                </Show>
                <Show when={environment()}>
                  <div class="mod-detail-stat">
                    <span class="mod-detail-stat-label">Environment</span>
                    <span class="mod-detail-stat-value">{environment()}</span>
                  </div>
                </Show>
              </div>

              <Show when={props.loaders.length > 0}>
                <div class="mod-detail-loaders">
                  <span class="mod-detail-stat-label">Loaders</span>
                  <div class="mod-card-tags">
                    <For each={props.loaders}>
                      {(l) => <span class={`mod-tag mod-tag-loader loader-${l}`}>{l}</span>}
                    </For>
                  </div>
                </div>
              </Show>

              <ModVersionPicker
                source={props.source}
                projectId={mod().project_id}
                loader={props.loader}
                gameVersion={props.gameVersion}
                category={props.category}
                installedVersionId={props.installedVersionId}
                busy={props.busy}
                onInstall={props.onInstall}
              />
            </div>

            <div class="modal-footer">
              <button class="btn btn--neutral" onClick={props.onClose}>Close</button>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
};

export default ModDetailModal;
