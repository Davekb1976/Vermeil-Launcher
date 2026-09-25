import { Component, createSignal, Show, onMount, onCleanup, createMemo } from "solid-js";
import { setActiveScreen } from "../App";
import { importCfZip, importMrpack } from "../ipc/commands";
import { enqueueModpack } from "../services/modpackQueue";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  IconModrinth,
  IconCurseForge,
  IconUpload,
  IconFileText,
  IconCheck,
  IconX,
  IconAlertTriangle,
  IconInfo,
} from "../components/Icons";

type ImportPlatform = "modrinth" | "curseforge";

const ImportInstance: Component = () => {
  const [activePlatform, setActivePlatform] = createSignal<ImportPlatform>("modrinth");
  const [selectedPath, setSelectedPath] = createSignal<string | null>(null);
  const [isDragging, setIsDragging] = createSignal(false);
  const [importing, setImporting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const selectedFileName = createMemo(() => {
    const path = selectedPath();
    if (!path) return "";
    return path.split(/[\\/]/).pop() || "";
  });

  const selectedPackName = createMemo(() => {
    return selectedFileName().replace(/\.(mrpack|zip)$/i, "");
  });

  const handleSelectFile = (path: string) => {
    setError(null);
    const lower = path.toLowerCase();
    if (lower.endsWith(".mrpack")) {
      setActivePlatform("modrinth");
      setSelectedPath(path);
    } else if (lower.endsWith(".zip")) {
      setActivePlatform("curseforge");
      setSelectedPath(path);
    } else {
      setError("Unsupported format. Please select a .mrpack (Modrinth) or .zip (CurseForge) file.");
    }
  };

  const handleBrowse = async () => {
    setError(null);
    try {
      const isModrinth = activePlatform() === "modrinth";
      const selected = await open({
        multiple: false,
        filters: isModrinth
          ? [
              { name: "Modrinth Modpack (.mrpack)", extensions: ["mrpack"] },
              { name: "All Supported Archives", extensions: ["mrpack", "zip"] },
            ]
          : [
              { name: "CurseForge Export (.zip)", extensions: ["zip"] },
              { name: "All Supported Archives", extensions: ["zip", "mrpack"] },
            ],
      });

      if (selected && typeof selected === "string") {
        handleSelectFile(selected);
      }
    } catch (e: any) {
      console.error("Failed to open file picker:", e);
      setError(typeof e === "string" ? e : e.message || "Failed to open file browser");
    }
  };

  const handleImport = async () => {
    const path = selectedPath();
    if (!path) {
      setError("Please select a file to import.");
      return;
    }

    const lower = path.toLowerCase();
    const isMrpack = lower.endsWith(".mrpack");
    const isZip = lower.endsWith(".zip");

    if (!isMrpack && !isZip) {
      setError("Unsupported format. Please select a .mrpack (Modrinth) or .zip (CurseForge) file.");
      return;
    }

    if (activePlatform() === "modrinth" && !isMrpack) {
      setError("You selected a .zip file while on the Modrinth tab. Please switch to CurseForge or select a .mrpack file.");
      return;
    }

    if (activePlatform() === "curseforge" && !isZip) {
      setError("You selected a .mrpack file while on the CurseForge tab. Please switch to Modrinth or select a .zip file.");
      return;
    }

    setError(null);
    setImporting(true);

    try {
      const platform = activePlatform();
      const title = selectedPackName() || (platform === "modrinth" ? "Modrinth pack" : "CurseForge pack");

      setActiveScreen("library");

      enqueueModpack({
        projectId: path,
        title,
        category: "modpack",
        meta: {
          iconUrl: undefined,
          loader: undefined,
          gameVersion: undefined,
          versionNumber: undefined,
          author: undefined,
        },
        execute: () => {
          if (platform === "modrinth") {
            return importMrpack(path);
          } else {
            return importCfZip(path);
          }
        },
      });

      setImporting(false);
    } catch (e: any) {
      console.error("Import failed:", e);
      setError(typeof e === "string" ? e : e.message || "Failed to initiate import");
      setImporting(false);
    }
  };

  let unlistenDrag: (() => void) | undefined;
  let isUnmounted = false;

  onMount(() => {
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (isUnmounted) return;
        if (event.payload.type === "over") {
          setIsDragging(true);
        } else if (event.payload.type === "leave") {
          setIsDragging(false);
        } else if (event.payload.type === "drop") {
          setIsDragging(false);
          const paths = event.payload.paths;
          if (paths && paths.length > 0) {
            handleSelectFile(paths[0]);
          }
        }
      })
      .then((unlisten) => {
        if (isUnmounted) {
          unlisten();
        } else {
          unlistenDrag = unlisten;
        }
      })
      .catch((e) => {
        console.warn("Drag-and-drop listener unavailable:", e);
      });
  });

  onCleanup(() => {
    isUnmounted = true;
    if (unlistenDrag) {
      unlistenDrag();
    }
  });

  return (
    <div class="screen-enter import-screen">
      {/* Top Header */}
      <div class="page-header" style="margin-bottom: var(--space-4);">
        <div class="page-title-group">
          <div class="page-title">Import Instance</div>
          <div class="page-subtitle">
            Import Minecraft modpacks and profiles from Modrinth (.mrpack) or CurseForge (.zip)
          </div>
        </div>
      </div>

      {/* 2-Column Responsive Layout (fills width on all window sizes) */}
      <div class="import-layout">
        {/* Left Column: Form & Dropzone & Guides */}
        <div class="import-main-column">
          {/* ═══ SECTION 1: PLATFORM SELECTOR ═══ */}
          <div class="card-gamemode-section">
            <div class="card-section-header">
              <span class="card-section-tag tag-settings-general">SOURCE</span>
              <span class="card-section-label">Import Platform</span>
              <span class="card-section-desc">Choose the archive format you wish to import</span>
            </div>
            <div class="card-section-body">
              <div class="import-platform-tabs">
                {/* Modrinth Card */}
                <div
                  class="import-tab-card"
                  classList={{
                    selected: activePlatform() === "modrinth",
                    "is-modrinth": activePlatform() === "modrinth",
                  }}
                  onClick={() => {
                    setActivePlatform("modrinth");
                    setError(null);
                    if (selectedPath() && selectedPath()!.toLowerCase().endsWith(".zip")) {
                      setSelectedPath(null);
                    }
                  }}
                >
                  <div class="import-tab-icon modrinth">
                    <IconModrinth />
                  </div>
                  <div class="import-tab-info">
                    <div class="import-tab-top">
                      <span class="import-tab-name">Modrinth Pack</span>
                      <span class="import-tab-tag tag-mrpack">.mrpack</span>
                    </div>
                    <div class="import-tab-desc">
                      Open archive with embedded CDN links & overrides
                    </div>
                  </div>
                </div>

                {/* CurseForge Card */}
                <div
                  class="import-tab-card"
                  classList={{
                    selected: activePlatform() === "curseforge",
                    "is-curseforge": activePlatform() === "curseforge",
                  }}
                  onClick={() => {
                    setActivePlatform("curseforge");
                    setError(null);
                    if (selectedPath() && selectedPath()!.toLowerCase().endsWith(".mrpack")) {
                      setSelectedPath(null);
                    }
                  }}
                >
                  <div class="import-tab-icon curseforge">
                    <IconCurseForge />
                  </div>
                  <div class="import-tab-info">
                    <div class="import-tab-top">
                      <span class="import-tab-name">CurseForge Profile</span>
                      <span class="import-tab-tag tag-cfzip">.zip export</span>
                    </div>
                    <div class="import-tab-desc">
                      Exported profile zip containing manifest & overrides
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ SECTION 2: DROPZONE & FILE PICKER ═══ */}
          <div class="card-gamemode-section">
            <div class="card-section-header">
              <span class="card-section-tag tag-settings-storage">FILE</span>
              <span class="card-section-label">
                {activePlatform() === "modrinth" ? "Modrinth Archive (.mrpack)" : "CurseForge Archive (.zip)"}
              </span>
              <span class="card-section-desc">
                Drag and drop your file into the well or browse locally
              </span>
            </div>
            <div class="card-section-body" style="display: flex; flex-direction: column; gap: 12px;">
              {/* Sunken Dropzone Well */}
              <div
                class="import-dropzone"
                classList={{ dragging: isDragging() }}
                onClick={handleBrowse}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleBrowse();
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Browse for ${activePlatform() === "modrinth" ? ".mrpack" : ".zip"} file`}
              >
                <div class="import-dropzone-icon">
                  <IconUpload />
                </div>
                <div class="import-dropzone-content">
                  <div class="import-dropzone-title">
                    {isDragging()
                      ? "Release to drop file..."
                      : `Drag & drop your ${activePlatform() === "modrinth" ? ".mrpack" : ".zip"} file here`}
                  </div>
                  <div class="import-dropzone-subtitle">
                    Supports native file drop or click anywhere in this zone to browse
                  </div>
                </div>
              </div>

              {/* Selected File Card */}
              <Show when={selectedPath()}>
                <div
                  class="import-selected-file"
                  classList={{
                    modrinth: activePlatform() === "modrinth",
                    curseforge: activePlatform() === "curseforge",
                  }}
                >
                  <div class="import-selected-left">
                    <div
                      class="import-selected-icon"
                      classList={{
                        modrinth: activePlatform() === "modrinth",
                        curseforge: activePlatform() === "curseforge",
                      }}
                    >
                      <IconFileText />
                    </div>
                    <div class="import-selected-meta">
                      <div class="import-selected-name">{selectedFileName()}</div>
                      <div class="import-selected-path tip-below tip-left" data-tip={selectedPath() || ""}>
                        {selectedPath()}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="btn btn--sm btn--ghost tip-left"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPath(null);
                    }}
                    data-tip="Remove selected file"
                    aria-label="Remove selected file"
                    style="color: var(--muted); padding: 4px 8px;"
                  >
                    <IconX />
                  </button>
                </div>
              </Show>
            </div>
          </div>

          {/* ═══ SECTION 3: INSTRUCTIONS & SPECIFICATIONS ═══ */}
          <Show
            when={activePlatform() === "modrinth"}
            fallback={
              <div class="card-gamemode-section">
                <div class="card-section-header">
                  <span class="card-section-tag tag-settings-performance">GUIDE</span>
                  <span class="card-section-label">CurseForge App Export Instructions</span>
                  <span class="card-section-desc">How to generate a compatible profile export</span>
                </div>
                <div class="card-section-body" style="display: flex; flex-direction: column; gap: 12px;">
                  <div class="import-step-list">
                    <div class="import-step-item">
                      <span class="import-step-number">1</span>
                      <span>Open the <strong>CurseForge App</strong> and click on the Minecraft modpack or profile you want to export.</span>
                    </div>
                    <div class="import-step-item">
                      <span class="import-step-number">2</span>
                      <span>Click the three dots menu (<strong>⋮</strong>) next to the Play button, then click <strong>Export Profile</strong> (or <em>Share Profile → Export as .zip</em>).</span>
                    </div>
                    <div class="import-step-item">
                      <span class="import-step-number">3</span>
                      <span>Ensure all mods and configs are checked, click <strong>Export</strong>, and drop or choose the resulting <code>.zip</code> file above.</span>
                    </div>
                  </div>

                  <div class="import-callout-box">
                    <div class="import-callout-icon">
                      <IconInfo />
                    </div>
                    <div>
                      <strong>Why .zip exports?</strong> CurseForge share codes are temporary 7-day Overwolf client sessions without a public third-party API. The official <code>.zip</code> export contains your complete modpack manifest, options, and configs, and installs reliably in Vermeil.
                    </div>
                  </div>
                </div>
              </div>
            }
          >
            <div class="card-gamemode-section">
              <div class="card-section-header">
                <span class="card-section-tag tag-settings-general">INFO</span>
                <span class="card-section-label">Modrinth .mrpack Standard</span>
                <span class="card-section-desc">Fast, open, and fully verified modpack format</span>
              </div>
              <div class="card-section-body" style="display: flex; flex-direction: column; gap: 10px;">
                <div class="setting-row" style="background: transparent; border: none; padding: 0;">
                  <div class="setting-text">
                    <div class="setting-name">Direct Signed CDN URLs</div>
                    <div class="setting-desc">
                      Unlike other platforms, <code>.mrpack</code> files contain signed CDN download links and SHA hashes for every mod, eliminating API rate-limits and blocked downloads.
                    </div>
                  </div>
                </div>
                <div class="setting-row" style="background: transparent; border: none; padding: 0;">
                  <div class="setting-text">
                    <div class="setting-name">Where to find .mrpack files</div>
                    <div class="setting-desc">
                      Download any modpack release directly from <span style="color: #1bd96a; font-weight: 600;">Modrinth.com</span> by choosing "Download .mrpack", or export one from other launchers.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Show>
        </div>

        {/* Right Column: Station / Preview & Actions (matches CreateCustom style) */}
        <div class="import-sidebar-column">
          <div class="card-gamemode-section">
            <div class="card-section-header">
              <span class="card-section-tag tag-settings-performance">PREVIEW</span>
              <span class="card-section-label">Instance Preview</span>
            </div>
            <div class="card-section-body" style="gap: 12px;">
              {/* Instance Card Preview */}
              <div class="card card--inst create-preview-card">
                <div
                  class={`inst-card-thumb inst-card-icon ${
                    activePlatform() === "modrinth" ? "green" : "orange"
                  }`}
                  style="display: flex; align-items: center; justify-content: center;"
                >
                  <Show
                    when={activePlatform() === "modrinth"}
                    fallback={
                      <span style="display: flex; width: 22px; height: 22px; color: #ffffff;">
                        <IconCurseForge />
                      </span>
                    }
                  >
                    <span style="display: flex; width: 22px; height: 22px; color: #ffffff;">
                      <IconModrinth />
                    </span>
                  </Show>
                </div>
                <div class="inst-card-body">
                  <div class="inst-card-title">
                    {selectedPackName() || (activePlatform() === "modrinth" ? "Modrinth Pack" : "CurseForge Profile")}
                  </div>
                  <div class="inst-card-sub">
                    {selectedFileName() || "No archive chosen"}
                  </div>
                  <div class="inst-card-badges">
                    <div class="inst-card-badges-track">
                      <span class="badge badge--version">
                        {activePlatform() === "modrinth" ? ".mrpack" : ".zip"}
                      </span>
                      <span
                        class="badge"
                        style={
                          activePlatform() === "modrinth"
                            ? "background:rgba(27,217,106,0.15);color:#4ade80;border:1px solid rgba(27,217,106,0.4);"
                            : "background:rgba(241,100,54,0.15);color:#fb923c;border:1px solid rgba(241,100,54,0.4);"
                        }
                      >
                        {activePlatform() === "modrinth" ? "Modrinth" : "CurseForge"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Specification Table */}
              <div class="create-specs-box">
                <div class="create-spec-row">
                  <span class="create-spec-label">Source Platform</span>
                  <span class="create-spec-value">
                    {activePlatform() === "modrinth" ? "Modrinth" : "CurseForge"}
                  </span>
                </div>
                <div class="create-spec-row">
                  <span class="create-spec-label">Package Format</span>
                  <span class="create-spec-value">
                    {activePlatform() === "modrinth" ? ".mrpack archive" : ".zip export"}
                  </span>
                </div>
                <div class="create-spec-row">
                  <span class="create-spec-label">Archive File</span>
                  <span
                    class="create-spec-value tip-left"
                    style="max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                    data-tip={selectedFileName() || ""}
                  >
                    {selectedFileName() || "None"}
                  </span>
                </div>
                <div class="create-spec-row">
                  <span class="create-spec-label">Overrides</span>
                  <span class="create-spec-value create-spec-value--active">Extracted</span>
                </div>
                <div class="create-spec-row">
                  <span class="create-spec-label">Status</span>
                  <span
                    class="create-spec-value"
                    classList={{
                      "create-spec-value--active": !!selectedPath(),
                      "create-spec-value--warning": !selectedPath(),
                    }}
                  >
                    {selectedPath() ? "Ready to import" : "Awaiting archive"}
                  </span>
                </div>
              </div>

              {/* Error Display */}
              <Show when={error()}>
                <div
                  style="display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; background: var(--danger-soft); border: 1px solid var(--danger); border-left: 3px solid var(--danger); color: var(--danger); font-size: 11px; line-height: 1.4;"
                >
                  <IconAlertTriangle />
                  <span>{error()}</span>
                </div>
              </Show>

              {/* Action Buttons */}
              <div class="create-actions-row">
                <button
                  type="button"
                  class="btn btn--neutral btn--lg create-cancel-btn"
                  onClick={() => setActiveScreen("create-choose")}
                  disabled={importing()}
                >
                  <IconX /> Cancel
                </button>
                <button
                  type="button"
                  class="btn btn--primary btn--lg create-submit-btn"
                  onClick={handleImport}
                  disabled={importing() || !selectedPath()}
                >
                  <Show when={importing()} fallback={<><IconCheck /> Import</>}>
                    Importing...
                  </Show>
                </button>
              </div>

              {/* Hint text */}
              <div class="create-hint-text">
                <Show
                  when={selectedPath()}
                  fallback={<span>Drop archive or click anywhere in the well to browse.</span>}
                >
                  Ready to install. Click Import to extract configs and download mods.
                </Show>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportInstance;
