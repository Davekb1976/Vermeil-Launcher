import { Component, createSignal, Show } from "solid-js";
import { setActiveScreen, refetchInstances, refreshPinnedInstanceIds, showToast, trackDownload, completeDownload, failDownload } from "../App";
import { importCfZip } from "../ipc/commands";
import { open } from "@tauri-apps/plugin-dialog";

const ImportCurseForge: Component = () => {
  const [importing, setImporting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const handleImportZip = async () => {
    setError(null);
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "CurseForge Export", extensions: ["zip"] }],
      });
      if (!selected) return;

      setActiveScreen("library");
      setImporting(true);

      const fileName = (selected as string).split(/[\\/]/).pop() || "CurseForge pack";
      const dlId = trackDownload(fileName.replace(/\.zip$/i, ""), "modpack");

      importCfZip(selected as string)
        .then((instance) => {
          refetchInstances();
          refreshPinnedInstanceIds().catch(() => {});
          completeDownload(dlId, instance.name);
          showToast({ title: "Import complete", message: `${instance.name} imported successfully`, type: "success" });
        })
        .catch((e: any) => {
          failDownload(dlId);
          showToast({
            title: "Import failed",
            message: typeof e === "string" ? e : e.message || "Import failed",
            type: "error",
            autoCloseMs: 6000,
          });
        })
        .finally(() => setImporting(false));
    } catch (e: any) {
      setError(typeof e === "string" ? e : e.message || "Import failed");
      setImporting(false);
    }
  };

  return (
    <div class="screen-enter">
      <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-4)">
        <button class="btn btn--sm btn--ghost" onClick={() => setActiveScreen("create-choose")}>← Back</button>
        <span class="section-label" style="margin-bottom:0;border-bottom:none;padding-bottom:0">Import from CurseForge</span>
      </div>

      <div class="settings-group" style="max-width:560px">
        <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:var(--space-2)">
          <div class="settings-key">Import .zip export</div>
          <div class="settings-val" style="line-height:1.5">
            In the CurseForge app: select your profile → three dots → Share Profile → Export as .zip.
            Then import that file here.
          </div>
          <button
            class="btn btn--primary"
            onClick={handleImportZip}
            disabled={importing()}
          >
            {importing() ? "Importing..." : "Choose .zip file"}
          </button>
        </div>
      </div>

      <Show when={error()}>
        <div style="color:var(--danger);font-size:var(--fs-xs);margin-top:var(--space-3);padding:8px 10px;background:var(--danger-soft);border:1px solid var(--danger);max-width:560px">
          {error()}
        </div>
      </Show>
    </div>
  );
};

export default ImportCurseForge;
