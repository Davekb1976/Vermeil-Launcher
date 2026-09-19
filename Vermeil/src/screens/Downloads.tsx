import { Component, For, Show } from "solid-js";
import { downloads, clearDownloadHistory, DownloadEntry } from "../App";
import { activeInstall, cancelActiveInstall } from "../services/installProgress";
import { IconCheck, IconX, IconDownload } from "../components/Icons";

function getCategoryLabel(category: string): string {
  switch (category) {
    case "mod": return "Mod";
    case "resourcepack": return "Resource Pack";
    case "shader": return "Shader";
    case "datapack": return "Datapack";
    case "modpack": return "Modpack";
    default: return "Download";
  }
}

const Downloads: Component = () => {
  const activeDownloads = () => downloads().filter(d => d.status === "downloading");
  const history = () => downloads().filter(d => d.status !== "downloading").slice(0, 100);

  const hasAnyActive = () => activeInstall().active || activeDownloads().length > 0;

  const timeAgo = (ts: number): string => {
    const diff = Date.now() - ts;
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return "just now";
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div class="screen-enter">
      {/* ── Section 1: Current Downloads ── */}
      <div class="section-label section-label--row">
        <span>Current Downloads</span>
        <Show when={activeDownloads().length > 0 || activeInstall().active}>
          <span class="badge" style="font-family:var(--font-mono)">
            {(activeDownloads().length || (activeInstall().active ? 1 : 0))} active
          </span>
        </Show>
      </div>

      <Show when={hasAnyActive()} fallback={
        <div class="dl-empty-well">
          No active downloads in progress.
        </div>
      }>
        {/* Orchestrator install (modpack, instance prep, loader install) */}
        <Show when={activeInstall().active}>
          <div
            class="dl-active-card"
            classList={{
              "dl-active-done": activeInstall().done,
              "dl-active-cancelling": activeInstall().cancelling,
            }}
          >
            <div class="dl-active-header">
              <div class="dl-active-title-row">
                <div class="dl-active-icon-badge">
                  <Show when={activeInstall().done} fallback={<IconDownload />}>
                    <IconCheck />
                  </Show>
                </div>
                <div class="dl-active-title-group">
                  <span class="dl-active-name" title={activeInstall().title}>{activeInstall().title}</span>
                  <span class="badge">Installing</span>
                </div>
              </div>

              <Show when={!activeInstall().done}>
                <Show
                  when={!activeInstall().cancelling}
                  fallback={<span class="dl-cancelling-tag">Cancelling...</span>}
                >
                  <button
                    class="dl-active-cancel"
                    title="Cancel installation and clean up partial files"
                    onClick={cancelActiveInstall}
                  >
                    Cancel
                  </button>
                </Show>
              </Show>
              <Show when={activeInstall().done}>
                <span class="dl-done-tag">Complete</span>
              </Show>
            </div>

            <div class="dl-active-stage-row">
              <span class="dl-active-stage">
                {activeInstall().done ? "Ready to play" : activeInstall().message}
              </span>
              <span class="dl-active-pct">
                {activeInstall().done ? "100%" : `${Math.round(activeInstall().fraction * 100)}%`}
              </span>
            </div>

            <div class="install-progress-bar-track">
              <div
                class="install-progress-bar-fill"
                classList={{ done: activeInstall().done }}
                style={{ width: `${Math.min(activeInstall().fraction * 100, 100)}%` }}
              />
            </div>
          </div>
        </Show>

        {/* Other active downloads from downloads() (e.g. background content) */}
        <Show when={activeDownloads().length > 0}>
          <div class="dl-grid" style="margin-bottom: var(--space-4);">
            <For each={activeDownloads()}>
              {(dl) => <ActiveDownloadCard entry={dl} />}
            </For>
          </div>
        </Show>
      </Show>

      {/* ── Section 2: Download History ── */}
      <div class="section-label section-label--row" style="margin-top: var(--space-5);">
        <span>Download History</span>
        <Show when={history().length > 0}>
          <button class="btn btn--sm" onClick={clearDownloadHistory}>Clear</button>
        </Show>
      </div>

      <Show when={history().length > 0} fallback={
        <div class="dl-empty-well">
          Download history will appear here.
        </div>
      }>
        <div class="dl-grid">
          <For each={history()}>
            {(dl) => <DownloadCard entry={dl} timeAgo={timeAgo} />}
          </For>
        </div>
      </Show>
    </div>
  );
};

/** Card for actively downloading individual items. */
const ActiveDownloadCard: Component<{ entry: DownloadEntry }> = (props) => {
  const dl = () => props.entry;

  return (
    <div class="card card--inst dl-card" style="border-left: 3px solid var(--accent);">
      <div class="card-body">
        <div class="dl-card-icon">
          <Show when={dl().iconUrl} fallback={
            <span class="dl-card-icon-fallback">{dl().name.charAt(0).toUpperCase()}</span>
          }>
            <img src={dl().iconUrl!} alt="" draggable={false} />
          </Show>
        </div>
        <div class="dl-card-body">
          <div class="dl-card-header">
            <div class="dl-card-title-group">
              <span class="dl-card-name" title={dl().name}>{dl().name}</span>
              <Show when={dl().author}>
                <span class="dl-card-author">by {dl().author}</span>
              </Show>
            </div>
            <span class="toast-spinner" style="width: 14px; height: 14px; border-width: 2px;" />
          </div>
          <div class="dl-card-meta">
            <span class="badge">{getCategoryLabel(dl().category)}</span>
            <Show when={dl().loader}>
              <span class={`badge badge--loader badge--${dl().loader}`}>{dl().loader}</span>
            </Show>
            <Show when={dl().gameVersion}>
              <span class="badge badge--version">{dl().gameVersion}</span>
            </Show>
            <Show when={dl().versionNumber}>
              <span class="badge badge--vnum" title={dl().versionNumber!}>{dl().versionNumber}</span>
            </Show>
            <span class="dl-card-time" style="color:var(--accent);font-weight:600">Downloading...</span>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Individual download history card with icon, metadata pills, and status. */
const DownloadCard: Component<{ entry: DownloadEntry; timeAgo: (ts: number) => string }> = (props) => {
  const dl = () => props.entry;
  const failed = () => dl().status === "failed";

  return (
    <div class="card card--inst dl-card" classList={{ "dl-card-failed": failed() }}>
      <div class="card-body">
        <div class="dl-card-icon">
          <Show when={dl().iconUrl} fallback={
            <span class="dl-card-icon-fallback">{dl().name.charAt(0).toUpperCase()}</span>
          }>
            <img src={dl().iconUrl!} alt="" draggable={false} />
          </Show>
        </div>
        <div class="dl-card-body">
          <div class="dl-card-header">
            <div class="dl-card-title-group">
              <span class="dl-card-name" title={dl().name}>{dl().name}</span>
              <Show when={dl().author}>
                <span class="dl-card-author">by {dl().author}</span>
              </Show>
            </div>
            <span class={`dl-card-status side-icon ${failed() ? "failed" : "success"}`}>
              {failed() ? <IconX /> : <IconCheck />}
            </span>
          </div>
          <div class="dl-card-meta">
            <span class="badge">{getCategoryLabel(dl().category)}</span>
            <Show when={dl().loader}>
              <span class={`badge badge--loader badge--${dl().loader}`}>{dl().loader}</span>
            </Show>
            <Show when={dl().gameVersion}>
              <span class="badge badge--version">{dl().gameVersion}</span>
            </Show>
            <Show when={dl().versionNumber}>
              <span class="badge badge--vnum" title={dl().versionNumber!}>{dl().versionNumber}</span>
            </Show>
            <span class="dl-card-time">{props.timeAgo(dl().timestamp)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Downloads;
