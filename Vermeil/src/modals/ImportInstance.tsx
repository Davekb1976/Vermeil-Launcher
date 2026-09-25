import { Component, createSignal, Show, For, onMount, onCleanup, createMemo } from "solid-js";
import { setActiveScreen } from "../App";
import { importCfZip, importMrpack, previewShareCode, importShareCode, ShareCodePreview } from "../ipc/commands";
import { enqueueModpack } from "../services/modpackQueue";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { loaderLabel } from "../lib/loader";
import { resolveAssetUrl } from "../lib/assets";
import {
  IconModrinth,
  IconCurseForge,
  IconUpload,
  IconFileText,
  IconCheck,
  IconX,
  IconAlertTriangle,
  IconInfo,
  IconShare2,
  IconSearch,
  IconPackage,
  IconPuzzle,
  IconClipboard,
} from "../components/Icons";

type ImportPlatform = "modrinth" | "curseforge" | "sharecode";

const ImportInstance: Component = () => {
  const [activePlatform, setActivePlatform] = createSignal<ImportPlatform>("modrinth");
  const [selectedPath, setSelectedPath] = createSignal<string | null>(null);
  const [shareCodeText, setShareCodeText] = createSignal<string>("");
  const [sharePreview, setSharePreview] = createSignal<ShareCodePreview | null>(null);
  const [isScanned, setIsScanned] = createSignal(false);
  const [scanning, setScanning] = createSignal(false);
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

  const handleShareCodeInput = (raw: string) => {
    setShareCodeText(raw);
    setIsScanned(false);
    setSharePreview(null);
    setError(null);
  };

  const handleScanCode = async () => {
    const trimmed = shareCodeText().trim();
    if (!trimmed) {
      setError("Please paste a share code to scan.");
      return;
    }
    setScanning(true);
    setError(null);
    try {
      const p = await previewShareCode(trimmed);
      setSharePreview(p);
      setIsScanned(true);
    } catch (e: any) {
      setSharePreview(null);
      setIsScanned(false);
      setError(typeof e === "string" ? e : e?.message || "Invalid or expired share code.");
    } finally {
      setScanning(false);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setShareCodeText(text.trim());
        setIsScanned(false);
        setSharePreview(null);
        setError(null);
      }
    } catch {
      setError("Could not read from clipboard. Please paste with Ctrl+V.");
    }
  };

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
    if (activePlatform() === "sharecode") {
      const code = shareCodeText().trim();
      const preview = sharePreview();
      if (!code || !preview) {
        setError("Please paste a valid share code.");
        return;
      }
      setError(null);
      setImporting(true);
      try {
        setActiveScreen("library");
        enqueueModpack({
          projectId: `sharecode:${Date.now()}`,
          title: preview.name || "Shared Instance",
          category: "modpack",
          meta: {
            iconUrl: preview.icon_url ?? undefined,
            loader: preview.loader_type,
            gameVersion: preview.game_version,
            versionNumber: "VML Share Code",
            author: "Vermeil Share Code",
          },
          execute: () => importShareCode(code),
        });
        setImporting(false);
      } catch (e: any) {
        setError(typeof e === "string" ? e : e?.message || "Failed to initiate share code import");
        setImporting(false);
      }
      return;
    }

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

  const isReadyToImport = () =>
    activePlatform() === "sharecode" ? (isScanned() && !!sharePreview()) : !!selectedPath();

  return (
    <div class="screen-enter import-screen">
      {/* Top Header */}
      <div class="page-header" style="margin-bottom: var(--space-4);">
        <div class="page-title-group">
          <div class="page-title">Import Instance</div>
          <div class="page-subtitle">
            Import Minecraft modpacks and instances from Modrinth (.mrpack), CurseForge (.zip), or a Vermeil Share Code (VML)
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
              <span class="card-section-label">Import Source</span>
              <span class="card-section-desc">Choose the archive format or share code you wish to import</span>
            </div>
            <div class="card-section-body">
              <div class="import-platform-tabs" style="grid-template-columns: repeat(3, minmax(0, 1fr));">
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

                {/* Vermeil Share Code (VML) Card */}
                <div
                  class="import-tab-card"
                  classList={{
                    selected: activePlatform() === "sharecode",
                  }}
                  onClick={() => {
                    setActivePlatform("sharecode");
                    setError(null);
                  }}
                >
                  <div class="import-tab-icon" style="color: var(--accent); background: rgba(139, 92, 246, 0.14); border: 1px solid rgba(139, 92, 246, 0.35);">
                    <IconShare2 />
                  </div>
                  <div class="import-tab-info">
                    <div class="import-tab-top">
                      <span class="import-tab-name">Share Code</span>
                      <span class="import-tab-tag" style="background: rgba(139, 92, 246, 0.16); color: var(--accent); border: 1px solid rgba(139, 92, 246, 0.4);">VML</span>
                    </div>
                    <div class="import-tab-desc">
                      Paste a serverless VML instance blueprint code
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ SECTION 2: DROPZONE OR SHARE CODE INPUT ═══ */}
          <Show
            when={activePlatform() === "sharecode"}
            fallback={
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
                          <div class="import-selected-path">
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
            }
          >
            <div class="card-gamemode-section">
              <div class="card-section-header">
                <span class="card-section-tag tag-settings-profiles">BLUEPRINT</span>
                <span class="card-section-label">Vermeil Share Code</span>
                <span class="card-section-desc">
                  Paste a share code below and click Scan Code to inspect its contents
                </span>
              </div>
              <div class="card-section-body" style="display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; gap: 8px; align-items: stretch;">
                  <input
                    type="text"
                    class="field-control field-control--text"
                    style="flex: 1; font-family: var(--font-mono, monospace); font-size: 12px;"
                    placeholder="Paste share code (e.g. VML-XXXX-XXXX or VML...) here"
                    value={shareCodeText()}
                    onInput={(e) => handleShareCodeInput(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (!isScanned()) {
                          handleScanCode();
                        } else if (isReadyToImport()) {
                          handleImport();
                        }
                      }
                    }}
                    spellcheck={false}
                  />
                  <Show
                    when={shareCodeText().trim().length > 0}
                    fallback={
                      <button
                        type="button"
                        class="btn btn--neutral tip-left"
                        data-tip="Paste from clipboard"
                        onClick={handlePasteClipboard}
                        disabled={scanning() || importing()}
                        style="display: flex; align-items: center; justify-content: center; width: var(--control-height-md); height: var(--control-height-md); min-width: var(--control-height-md); padding: 0; flex-shrink: 0; align-self: stretch;"
                      >
                        <IconClipboard />
                      </button>
                    }
                  >
                    <button
                      type="button"
                      class="btn btn--neutral tip-left"
                      data-tip="Clear code"
                      onClick={() => handleShareCodeInput("")}
                      disabled={scanning() || importing()}
                      style="display: flex; align-items: center; justify-content: center; width: var(--control-height-md); height: var(--control-height-md); min-width: var(--control-height-md); padding: 0; flex-shrink: 0; align-self: stretch;"
                    >
                      <IconX />
                    </button>
                  </Show>
                </div>

                <Show when={sharePreview()}>
                  {(p) => (
                    <Show
                      when={p().is_modpack}
                      fallback={
                        /* ─── CUSTOM INSTANCE: LIST MODS ─── */
                        <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 4px;">
                          <div class="setting-row" style="justify-content: space-between; border-left-color: var(--accent);">
                            <div class="setting-info">
                              <span class="setting-name">{p().name}</span>
                              <span class="setting-desc">
                                Custom Instance · {loaderLabel(p().loader_type)} {p().loader_version || ""} · Minecraft {p().game_version} · {p().total_count} total items
                              </span>
                            </div>
                            <span class="badge" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4);">
                              Custom Collection
                            </span>
                          </div>

                          <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 4px;">
                            <span style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">
                              Mod &amp; Content List ({p().items.length} items)
                            </span>
                            <span class="badge badge--sm" style="font-size: 10px;">
                              {p().mod_count} Mods · {p().shader_count} Shaders · {p().resourcepack_count} Packs
                            </span>
                          </div>

                          <div style="max-height: 280px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; padding-right: 2px;">
                            <For each={p().items}>
                              {(item) => (
                                <div
                                  class="setting-row"
                                  style={`padding: 7px 10px; font-size: 11px; align-items: center; justify-content: space-between; border-left-color: ${item.enabled ? "var(--accent)" : "var(--border)"};`}
                                >
                                  <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
                                    <Show
                                      when={resolveAssetUrl(item.icon_url)}
                                      fallback={
                                        <div style="width: 28px; height: 28px; border-radius: 4px; background: rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--text-muted);">
                                          <IconPuzzle />
                                        </div>
                                      }
                                    >
                                      {(iconSrc) => (
                                        <img
                                          src={iconSrc()}
                                          alt=""
                                          style="width: 28px; height: 28px; border-radius: 4px; object-fit: contain; background: rgba(0,0,0,0.3); flex-shrink: 0;"
                                        />
                                      )}
                                    </Show>
                                    <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1;">
                                      <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                                        <span style="font-weight: 600; color: var(--text-main); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; font-size: 12px;">
                                          {item.name}
                                        </span>
                                        <Show when={item.version}>
                                          <span class="badge badge--sm" style="font-size: 9px; padding: 1px 5px; background: rgba(255,255,255,0.06); color: var(--text-muted); border: 1px solid var(--border); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                            {item.version}
                                          </span>
                                        </Show>
                                      </div>
                                      <div style="display: flex; align-items: center; gap: 6px;">
                                        <span class="badge badge--sm" style="font-size: 8.5px; padding: 0 4px;">
                                          {item.category === "shader" ? "SHADER" : item.category === "resourcepack" ? "PACK" : "MOD"}
                                        </span>
                                        <span style="font-size: 10px; color: var(--text-muted);">{item.source}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                                    <Show when={!item.enabled}>
                                      <span class="badge badge--dim" style="font-size: 9px;">DISABLED</span>
                                    </Show>
                                  </div>
                                </div>
                              )}
                            </For>
                          </div>
                        </div>
                      }
                    >
                      {/* ─── MODPACK BLUEPRINT: NO NEED TO LIST 300 MODS, SHOW MODPACK API INFO ─── */}
                      <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 4px;">
                        <div class="setting-row" style="justify-content: space-between; border-left-color: #1bd96a;">
                          <div style="display: flex; align-items: center; gap: 12px;">
                            <Show
                              when={resolveAssetUrl(p().icon_url)}
                              fallback={
                                <div style="width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.05); border-radius: 4px;">
                                  <IconPackage />
                                </div>
                              }
                            >
                              {(iconSrc) => (
                                <img
                                  src={iconSrc()}
                                  alt="Modpack icon"
                                  style="width: 38px; height: 38px; object-fit: contain; border-radius: 4px; background: rgba(0,0,0,0.3);"
                                />
                              )}
                            </Show>
                            <div class="setting-info">
                              <span class="setting-name">{p().name}</span>
                              <span class="setting-desc">
                                {p().base_pack_platform || "Official"} Modpack · {loaderLabel(p().loader_type)} {p().loader_version || ""} · Minecraft {p().game_version}
                              </span>
                            </div>
                          </div>
                          <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4);">
                            {p().base_pack_platform ? `${p().base_pack_platform} Pack` : "Official Modpack"}
                          </span>
                        </div>

                        <div class="import-callout-box">
                          <div class="import-callout-icon">
                            <IconInfo />
                          </div>
                          <div style="font-size: 11px; line-height: 1.4;">
                            <strong>Official Modpack Distribution:</strong> This instance is based on an official modpack ({p().mod_count} mods). All mods, configs, scripts, and overrides will be fetched directly via the official {p().base_pack_platform || "modpack"} API without requiring individual mod resolution.
                          </div>
                        </div>

                        <Show when={p().items.length > 0}>
                          <div style="display: flex; flex-direction: column; gap: 6px; padding-top: 4px;">
                            <span style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">
                              Custom Modifications (+{p().items.length} mods added on top)
                            </span>
                            <div style="max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;">
                              <For each={p().items}>
                                {(item) => (
                                  <div
                                    class="setting-row"
                                    style={`padding: 6px 10px; font-size: 11px; align-items: center; justify-content: space-between; border-left-color: ${item.enabled ? "var(--accent)" : "var(--border)"};`}
                                  >
                                    <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                                      <Show
                                        when={resolveAssetUrl(item.icon_url)}
                                        fallback={
                                          <div style="width: 24px; height: 24px; border-radius: 4px; background: rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--text-muted);">
                                            <IconPuzzle />
                                          </div>
                                        }
                                      >
                                        {(iconSrc) => (
                                          <img
                                            src={iconSrc()}
                                            alt=""
                                            style="width: 24px; height: 24px; border-radius: 4px; object-fit: contain; background: rgba(0,0,0,0.3); flex-shrink: 0;"
                                          />
                                        )}
                                      </Show>
                                      <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1;">
                                        <span style="font-weight: 600; color: var(--text-main); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; font-size: 11.5px;">
                                          {item.name}
                                        </span>
                                        <Show when={item.version}>
                                          <span class="badge badge--sm" style="font-size: 8.5px; padding: 0 4px; background: rgba(255,255,255,0.06); color: var(--text-muted); border: 1px solid var(--border);">
                                            {item.version}
                                          </span>
                                        </Show>
                                      </div>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                                      <span class="badge badge--sm" style="font-size: 8.5px; padding: 0 4px;">{item.category.toUpperCase()}</span>
                                      <Show when={!item.enabled}>
                                        <span class="badge badge--dim" style="font-size: 8.5px;">DISABLED</span>
                                      </Show>
                                    </div>
                                  </div>
                                )}
                              </For>
                            </div>
                          </div>
                        </Show>
                      </div>
                    </Show>
                  )}
                </Show>
              </div>
            </div>
          </Show>

          {/* ═══ SECTION 3: INSTRUCTIONS & SPECIFICATIONS ═══ */}
          <Show
            when={activePlatform() === "sharecode"}
            fallback={
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
            }
          >
            <div class="card-gamemode-section">
              <div class="card-section-header">
                <span class="card-section-tag tag-settings-general">INFO</span>
                <span class="card-section-label">Vermeil Share Codes</span>
                <span class="card-section-desc">Short 3-minute share codes & offline blueprints</span>
              </div>
              <div class="card-section-body" style="display: flex; flex-direction: column; gap: 10px;">
                <div class="setting-row" style="background: transparent; border: none; padding: 0;">
                  <div class="setting-text">
                    <div class="setting-name">How to generate a Share Code</div>
                    <div class="setting-desc">
                      Open any instance in your Library and click the <strong>Share Code</strong> icon in the top-right action bar to copy its code (e.g. <code>VML-XXXX-XXXX</code> or <code>VML...</code>) to your clipboard.
                    </div>
                  </div>
                </div>
                <div class="setting-row" style="background: transparent; border: none; padding: 0;">
                  <div class="setting-text">
                    <div class="setting-name">Verified Content Resolution</div>
                    <div class="setting-desc">
                      All mods, shaders, and resource packs are fetched directly from official Modrinth and CurseForge CDNs with cryptographic SHA-1 verification. Mods whose authors disabled third-party distribution on CurseForge will prompt for manual download.
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
                    activePlatform() === "modrinth"
                      ? "green"
                      : activePlatform() === "curseforge"
                        ? "orange"
                        : "purple"
                  }`}
                  style="display: flex; align-items: center; justify-content: center;"
                >
                  <Show
                    when={activePlatform() !== "sharecode"}
                    fallback={
                      <span style="display: flex; width: 22px; height: 22px; color: #ffffff;">
                        <IconShare2 />
                      </span>
                    }
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
                  </Show>
                </div>
                <div class="inst-card-body">
                  <div class="inst-card-title">
                    {activePlatform() === "sharecode"
                      ? sharePreview()?.name || "Vermeil Share Code"
                      : selectedPackName() || (activePlatform() === "modrinth" ? "Modrinth Pack" : "CurseForge Profile")}
                  </div>
                  <div class="inst-card-sub">
                    {activePlatform() === "sharecode"
                      ? sharePreview()
                        ? `${loaderLabel(sharePreview()!.loader_type)} · MC ${sharePreview()!.game_version}`
                        : "Awaiting share code"
                      : selectedFileName() || "No archive chosen"}
                  </div>
                  <div class="inst-card-badges">
                    <div class="inst-card-badges-track">
                      <span class="badge badge--version">
                        {activePlatform() === "sharecode"
                          ? sharePreview()?.game_version || "VML"
                          : activePlatform() === "modrinth"
                            ? ".mrpack"
                            : ".zip"}
                      </span>
                      <span
                        class="badge"
                        style={
                          activePlatform() === "modrinth"
                            ? "background:rgba(27,217,106,0.15);color:#4ade80;border:1px solid rgba(27,217,106,0.4);"
                            : activePlatform() === "curseforge"
                              ? "background:rgba(241,100,54,0.15);color:#fb923c;border:1px solid rgba(241,100,54,0.4);"
                              : "background:rgba(139,92,246,0.15);color:#a78bfa;border:1px solid rgba(139,92,246,0.4);"
                        }
                      >
                        {activePlatform() === "sharecode"
                          ? sharePreview()
                            ? loaderLabel(sharePreview()!.loader_type)
                            : "Blueprint"
                          : activePlatform() === "modrinth"
                            ? "Modrinth"
                            : "CurseForge"}
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
                    {activePlatform() === "sharecode"
                      ? "Vermeil Share Code"
                      : activePlatform() === "modrinth"
                        ? "Modrinth"
                        : "CurseForge"}
                  </span>
                </div>
                <div class="create-spec-row">
                  <span class="create-spec-label">
                    {activePlatform() === "sharecode" ? "Blueprint Type" : "Package Format"}
                  </span>
                  <span class="create-spec-value">
                    {activePlatform() === "sharecode"
                      ? sharePreview()
                        ? (sharePreview()!.is_modpack ? `${sharePreview()!.base_pack_platform || "Official"} Modpack` : "Custom Instance")
                        : (isScanned() ? "Unknown" : "Share Code")
                      : activePlatform() === "modrinth"
                        ? ".mrpack archive"
                        : ".zip export"}
                  </span>
                </div>
                <div class="create-spec-row">
                  <span class="create-spec-label">
                    {activePlatform() === "sharecode" ? "Content Count" : "Archive File"}
                  </span>
                  <span
                    class="create-spec-value"
                    style="max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                  >
                    {activePlatform() === "sharecode"
                      ? sharePreview()
                        ? `${sharePreview()!.total_count} items (${sharePreview()!.mod_count}M / ${sharePreview()!.shader_count}S / ${sharePreview()!.resourcepack_count}RP)`
                        : "None"
                      : selectedFileName() || "None"}
                  </span>
                </div>
                <div class="create-spec-row">
                  <span class="create-spec-label">
                    {activePlatform() === "sharecode" ? "Loader / MC" : "Overrides"}
                  </span>
                  <span class="create-spec-value create-spec-value--active">
                    {activePlatform() === "sharecode"
                      ? sharePreview()
                        ? `${loaderLabel(sharePreview()!.loader_type)} ${sharePreview()!.game_version}`
                        : "—"
                      : "Extracted"}
                  </span>
                </div>
                <div class="create-spec-row">
                  <span class="create-spec-label">Status</span>
                  <span
                    class="create-spec-value"
                    classList={{
                      "create-spec-value--active": isReadyToImport(),
                      "create-spec-value--warning": !isReadyToImport(),
                    }}
                  >
                    {isReadyToImport()
                      ? "Ready to import"
                      : activePlatform() === "sharecode"
                        ? (isScanned() ? "Ready to import" : "Awaiting scan")
                        : "Awaiting archive"}
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
                <Show
                  when={activePlatform() === "sharecode" && !isScanned()}
                  fallback={
                    <button
                      type="button"
                      class="btn btn--primary btn--lg create-submit-btn"
                      onClick={handleImport}
                      disabled={importing() || !isReadyToImport()}
                    >
                      <Show when={importing()} fallback={<><IconCheck /> Import Instance</>}>
                        Importing...
                      </Show>
                    </button>
                  }
                >
                  <button
                    type="button"
                    class="btn btn--primary btn--lg create-submit-btn"
                    onClick={handleScanCode}
                    disabled={scanning() || shareCodeText().trim().length === 0}
                  >
                    <Show when={scanning()} fallback={<><IconSearch /> Scan Code</>}>
                      Scanning...
                    </Show>
                  </button>
                </Show>
              </div>

              {/* Hint text */}
              <div class="create-hint-text">
                <Show
                  when={isReadyToImport()}
                  fallback={
                    <span>
                      {activePlatform() === "sharecode"
                        ? (isScanned()
                            ? "Code verified. Click Import Instance to begin installation."
                            : "Paste a share code and click Scan Code to inspect.")
                        : "Drop archive or click anywhere in the well to browse."}
                    </span>
                  }
                >
                  Ready to install. Click Import Instance to download all verified content.
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
