import { Component, For, Show } from "solid-js";
import {
  downloads,
  clearDownloadHistory,
  failDownload,
  DownloadEntry,
  isBulkInstall,
  bulkBatchSize,
  bulkDone,
  bulkProgress,
} from "../App";
import { activeInstall, cancelActiveInstall } from "../services/installProgress";
import { activeInstallTask, queuedInstallTasks, cancelQueuedTask } from "../services/modpackQueue";
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

  // The active orchestrator install (e.g. modpack from installQueue)
  const activeInstallEntry = () => {
    if (!activeInstall().active) return null;
    const task = activeInstallTask();
    if (task) {
      const found = downloads().find((d) => d.id === task.id);
      if (found) return found;
    }
    const list = activeDownloads();
    if (list.length === 0) return null;

    const activeTitle = activeInstall().title.trim().toLowerCase();
    if (activeTitle) {
      const match = list.find((dl) => {
        const dlName = dl.name.trim().toLowerCase();
        return dlName === activeTitle || activeTitle.includes(dlName) || dlName.includes(activeTitle);
      });
      if (match) return match;
    }

    return null;
  };

  // Active content download (when not orchestrated by activeInstall)
  const activeContentItem = () => {
    if (activeInstall().active) return null;
    const task = activeInstallTask();
    if (task && !task.isOrchestrator) {
      const found = downloads().find((d) => d.id === task.id);
      if (found) return found;
    }
    const list = activeDownloads();
    if (list.length === 0) return null;
    return list[list.length - 1];
  };

  const queuedDownloads = () => {
    const qTasks = queuedInstallTasks();
    if (qTasks.length > 0) {
      return qTasks.map((task) => {
        const found = downloads().find((d) => d.id === task.id);
        if (found) return found;
        const synthetic: DownloadEntry = {
          id: task.id,
          name: task.title,
          category: task.category,
          status: "downloading",
          timestamp: Date.now(),
          iconUrl: task.meta?.iconUrl ?? undefined,
          loader: task.meta?.loader,
          gameVersion: task.meta?.gameVersion,
          versionNumber: task.meta?.versionNumber ?? undefined,
          author: task.meta?.author ?? undefined,
        };
        return synthetic;
      });
    }

    const list = activeDownloads();
    if (activeInstall().active) {
      const currentModpack = activeInstallEntry();
      return currentModpack ? list.filter((dl) => dl.id !== currentModpack.id) : list;
    }
    const currentContent = activeContentItem();
    return currentContent ? list.filter((dl) => dl.id !== currentContent.id) : [];
  };

  const totalActiveCount = () => {
    const qCount = queuedDownloads().length;
    const hasActive = activeInstall().active || Boolean(activeContentItem());
    return qCount + (hasActive ? 1 : 0);
  };

  const hasAnyActive = () => activeInstall().active || Boolean(activeInstallTask()) || activeDownloads().length > 0;

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
        <Show when={hasAnyActive()}>
          <span class="badge" style="font-family:var(--font-mono)">
            {totalActiveCount()} active
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
                  <Show when={activeInstall().done} fallback={
                    <Show when={activeInstallEntry()?.iconUrl} fallback={<IconDownload />}>
                      <img src={activeInstallEntry()!.iconUrl!} alt="" draggable={false} />
                    </Show>
                  }>
                    <IconCheck />
                  </Show>
                </div>
                <div class="dl-active-title-group">
                  <span class="dl-active-name" title={activeInstall().title}>{activeInstall().title}</span>
                  <Show when={activeInstallEntry()?.author}>
                    <span class="dl-card-author">by {activeInstallEntry()!.author}</span>
                  </Show>
                  <Show when={activeInstallEntry()?.category}>
                    <span class="badge">{getCategoryLabel(activeInstallEntry()!.category)}</span>
                  </Show>
                  <Show when={activeInstallEntry()?.loader}>
                    <span class={`badge badge--loader badge--${activeInstallEntry()!.loader}`}>
                      {activeInstallEntry()!.loader}
                    </span>
                  </Show>
                  <Show when={activeInstallEntry()?.gameVersion}>
                    <span class="badge badge--version">{activeInstallEntry()!.gameVersion}</span>
                  </Show>
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

        {/* Content download (single mod, update, bulk mod install) */}
        <Show when={!activeInstall().active && Boolean(activeContentItem())}>
          <div class="dl-active-card">
            <div class="dl-active-header">
              <div class="dl-active-title-row">
                <div class="dl-active-icon-badge">
                  <Show
                    when={activeContentItem()?.iconUrl}
                    fallback={<IconDownload />}
                  >
                    <img
                      src={activeContentItem()!.iconUrl!}
                      alt=""
                      draggable={false}
                    />
                  </Show>
                </div>
                <div class="dl-active-title-group">
                  <span class="dl-active-name" title={activeContentItem()?.name}>
                    {activeContentItem()?.name}
                  </span>
                  <Show when={activeContentItem()?.author}>
                    <span class="dl-card-author">by {activeContentItem()?.author}</span>
                  </Show>
                  <span class="badge">{getCategoryLabel(activeContentItem()?.category || "")}</span>
                  <Show when={activeContentItem()?.loader}>
                    <span class={`badge badge--loader badge--${activeContentItem()!.loader}`}>
                      {activeContentItem()!.loader}
                    </span>
                  </Show>
                  <Show when={activeContentItem()?.gameVersion}>
                    <span class="badge badge--version">{activeContentItem()!.gameVersion}</span>
                  </Show>
                  <Show when={activeContentItem()?.versionNumber}>
                    <span class="badge badge--vnum" title={activeContentItem()!.versionNumber!}>
                      {activeContentItem()!.versionNumber}
                    </span>
                  </Show>
                </div>
              </div>

              <div style="display: flex; align-items: center; gap: var(--space-2); flex-shrink: 0;">
                <Show when={isBulkInstall()}>
                  <span class="badge" style="font-family: var(--font-mono); font-size: var(--fs-xs);">
                    {bulkDone()} / {bulkBatchSize()}
                  </span>
                </Show>
                <span class="badge" style="color: var(--accent); border-color: rgba(139, 92, 246, 0.3);">
                  Installing
                </span>
              </div>
            </div>

            <div class="dl-active-stage-row">
              <span class="dl-active-stage">
                {isBulkInstall()
                  ? `Installing ${activeContentItem()?.name} (${bulkDone()} of ${bulkBatchSize()} completed)`
                  : `Downloading and installing ${activeContentItem()?.name}...`}
              </span>
              <Show when={isBulkInstall()}>
                <span class="dl-active-pct">
                  {`${Math.round(bulkProgress() * 100)}%`}
                </span>
              </Show>
            </div>

            <div class="install-progress-bar-track">
              <div
                class="install-progress-bar-fill"
                classList={{ indeterminate: !isBulkInstall() }}
                style={isBulkInstall() ? { width: `${Math.min(bulkProgress() * 100, 100)}%` } : undefined}
              />
            </div>
          </div>
        </Show>

        {/* Queued / other active downloads from downloads() */}
        <Show when={queuedDownloads().length > 0}>
          <div class="dl-queue-section-header">
            <span>Next in queue</span>
            <span class="badge" style="font-family:var(--font-mono)">
              {queuedDownloads().length}
            </span>
          </div>
          <div class="dl-queue-list">
            <For each={queuedDownloads()}>
              {(dl, index) => <ActiveDownloadCard entry={dl} position={index() + 1} />}
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

/** Card for queued items waiting in the download queue. */
const ActiveDownloadCard: Component<{ entry: DownloadEntry; position?: number }> = (props) => {
  const dl = () => props.entry;

  const handleCancel = (e: MouseEvent) => {
    e.stopPropagation();
    const handled = cancelQueuedTask(dl().id);
    if (!handled) {
      failDownload(dl().id, "Install cancelled");
    }
  };

  return (
    <div class="dl-queue-card">
      <div class="dl-queue-main">
        <div class="dl-queue-icon">
          <Show when={dl().iconUrl} fallback={
            <span class="dl-queue-icon-fallback">{dl().name.charAt(0).toUpperCase()}</span>
          }>
            <img src={dl().iconUrl!} alt="" draggable={false} />
          </Show>
        </div>
        <div class="dl-queue-info">
          <div class="dl-queue-title-row">
            <span class="dl-queue-name" title={dl().name}>{dl().name}</span>
            <Show when={dl().author}>
              <span class="dl-queue-author">by {dl().author}</span>
            </Show>
          </div>
          <div class="dl-queue-meta-row">
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
          </div>
        </div>
      </div>

      <div class="dl-queue-actions">
        <span class="dl-queue-badge">
          <span class="dl-queue-badge-dot" />
          {props.position !== undefined ? `Queued #${props.position}` : "In Queue"}
        </span>
        <button
          type="button"
          class="dl-queue-cancel"
          title="Cancel this queued download"
          onClick={handleCancel}
        >
          Cancel
        </button>
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
