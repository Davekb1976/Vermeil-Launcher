import { Component } from "solid-js";
import { setActiveScreen } from "../App";
import { IconLayers, IconSettings, IconDownload } from "../components/Icons";

const CreateChoose: Component = () => {
  return (
    <div class="screen-enter">
      <div class="section-label">Create instance</div>

      <div class="create-grid">
        <div class="create-grid-card" onClick={() => setActiveScreen("create-custom")}>
          <div class="create-grid-icon" style="color:var(--accent)"><IconSettings /></div>
          <div class="create-grid-text">
            <div class="create-grid-title">Custom setup</div>
            <div class="create-grid-desc">Pick your loader, version, and configure everything manually</div>
          </div>
        </div>
        <div class="create-grid-card" onClick={() => setActiveScreen("create-modpack")}>
          <div class="create-grid-icon" style="color:var(--info)"><IconLayers /></div>
          <div class="create-grid-text">
            <div class="create-grid-title">Install modpack</div>
            <div class="create-grid-desc">Browse and install a modpack from Modrinth</div>
          </div>
        </div>
        <div class="create-grid-card" onClick={() => setActiveScreen("create-import")}>
          <div class="create-grid-icon" style="color:var(--warn)"><IconDownload /></div>
          <div class="create-grid-text">
            <div class="create-grid-title">Import</div>
            <div class="create-grid-desc">Import from CurseForge (.zip export or profile code)</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateChoose;
