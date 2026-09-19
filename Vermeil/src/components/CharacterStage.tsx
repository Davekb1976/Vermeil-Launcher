import { Component, createEffect, onCleanup, onMount } from "solid-js";
import { SkinViewer, IdleAnimation, WaveAnimation } from "skinview3d";
import { gameRunning } from "../App";

interface Props {
  skinUrl?: string | null;
  name?: string | null;
  class?: string;
}

/**
 * Interactive 3D Minecraft character stage.
 * Renders the player's active skin in a WebGL canvas using skinview3d,
 * playing a friendly wave animation on entrance and hover, then settling
 * into an idle stance.
 *
 * Automatically pauses the rendering loop during active gameplay to
 * ensure zero GPU/CPU drain while Minecraft is running.
 */
const CharacterStage: Component<Props> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  let containerRef: HTMLDivElement | undefined;
  let viewer: SkinViewer | undefined;
  let waveTimeout: ReturnType<typeof setTimeout> | null = null;

  const playWave = () => {
    if (!viewer) return;
    viewer.animation = new WaveAnimation("right");
    if (waveTimeout) clearTimeout(waveTimeout);
    waveTimeout = setTimeout(() => {
      if (viewer && viewer.animation instanceof WaveAnimation) {
        viewer.animation = new IdleAnimation();
      }
    }, 2800);
  };

  onMount(() => {
    if (!canvasRef || !containerRef) return;

    const rect = containerRef.getBoundingClientRect();
    const width = Math.max(160, Math.round(rect.width || 280));
    const height = Math.max(180, Math.round(rect.height || 260));

    viewer = new SkinViewer({
      canvas: canvasRef,
      width,
      height,
      skin: props.skinUrl ?? undefined,
    });

    viewer.controls.enableZoom = false;
    viewer.controls.enablePan = false;
    viewer.controls.enableRotate = true;

    // Slight angle toward the viewer for depth
    viewer.playerObject.rotation.y = -0.25;
    viewer.zoom = 0.88;

    // Initial greeting wave
    playWave();

    // Responsive resize observer
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.round(entry.contentRect.width);
        const h = Math.round(entry.contentRect.height);
        if (w > 0 && h > 0 && viewer) {
          viewer.setSize(w, h);
        }
      }
    });
    ro.observe(containerRef);

    onCleanup(() => {
      ro.disconnect();
      if (waveTimeout) clearTimeout(waveTimeout);
      viewer?.dispose();
      viewer = undefined;
    });
  });

  // React to skin updates
  createEffect(() => {
    const url = props.skinUrl;
    if (!viewer) return;
    if (url) {
      viewer.loadSkin(url, { model: "auto-detect" }).catch((e) => {
        console.error("Failed to load skin in CharacterStage:", e);
      });
    } else {
      viewer.resetSkin();
    }
  });

  // Pause render loop when game is running
  createEffect(() => {
    const running = gameRunning();
    if (!viewer || !viewer.animation) return;
    viewer.animation.paused = running;
  });

  return (
    <div
      ref={containerRef}
      class={`character-stage-container ${props.class ?? ""}`}
      onMouseEnter={playWave}
      title="Drag to rotate character"
    >
      <canvas ref={canvasRef} class="character-stage-canvas" />
    </div>
  );
};

export default CharacterStage;
