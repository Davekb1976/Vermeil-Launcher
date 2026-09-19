import { Component, createEffect, onCleanup, onMount } from "solid-js";
import { SkinViewer, PlayerAnimation } from "skinview3d";
import type { PlayerObject } from "skinview3d";
import { gameRunning } from "../App";

interface Props {
  skinUrl?: string | null;
  name?: string | null;
  class?: string;
}

function smoothstep(min: number, max: number, val: number): number {
  const x = Math.max(0, Math.min(1, (val - min) / (max - min)));
  return x * x * (3 - 2 * x);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Continuous ambient Minecraft character animation:
 * 1. Stands idle, smoothly looking around (left, sweeping right, back to center).
 * 2. Seamlessly begins walking in place with natural leg & arm strides.
 * 3. Stops, glances around again from different angles (curious look up-right, glance down-left).
 * 4. Smoothly centers and continuously loops without jerking or popping.
 */
class RoamAndLookAnimation extends PlayerAnimation {
  readonly cycleDuration = 16.0;

  protected animate(player: PlayerObject): void {
    const t = this.progress % this.cycleDuration;

    // --- Subtle Breathing Sway (Always running) ---
    const breath = Math.sin(this.progress * 2.2);
    const basicArmRotationZ = Math.PI * 0.02;

    // --- Walking Weight Envelope (5.5s to 9.5s) ---
    // Smoothly blends in and out so there is zero abrupt snap
    let walkWeight = 0;
    if (t >= 5.5 && t <= 9.5) {
      if (t < 6.2) {
        walkWeight = smoothstep(5.5, 6.2, t);
      } else if (t > 8.8) {
        walkWeight = 1.0 - smoothstep(8.8, 9.5, t);
      } else {
        walkWeight = 1.0;
      }
    }

    // --- Walking Strides (Arms & Legs) ---
    const walkStride = this.progress * 7.5;
    const walkLegLeft = Math.sin(walkStride) * 0.5;
    const walkLegRight = Math.sin(walkStride + Math.PI) * 0.5;
    const walkArmLeft = Math.sin(walkStride + Math.PI) * 0.5;
    const walkArmRight = Math.sin(walkStride) * 0.5;

    // Legs: swing when walking, firmly grounded when standing
    player.skin.leftLeg.rotation.x = walkLegLeft * walkWeight;
    player.skin.rightLeg.rotation.x = walkLegRight * walkWeight;
    player.skin.leftLeg.rotation.z = 0;
    player.skin.rightLeg.rotation.z = 0;

    // Arms: blend walking stride with standing idle breathing
    player.skin.leftArm.rotation.x =
      walkArmLeft * walkWeight + breath * 0.015 * (1.0 - walkWeight);
    player.skin.rightArm.rotation.x =
      walkArmRight * walkWeight - breath * 0.015 * (1.0 - walkWeight);

    player.skin.leftArm.rotation.z =
      basicArmRotationZ + breath * 0.025 * (1.0 - walkWeight);
    player.skin.rightArm.rotation.z =
      -basicArmRotationZ - breath * 0.025 * (1.0 - walkWeight);

    // --- Head Look-Around Trajectory ---
    let lookY = 0;
    let lookX = 0;
    let lookZ = 0;

    if (t < 1.4) {
      // Smoothly glance left
      const s = smoothstep(0, 1.4, t);
      lookY = lerp(0, 0.45, s);
      lookX = lerp(0, -0.05, s);
      lookZ = lerp(0, 0.04, s);
    } else if (t < 2.5) {
      // Hold glance left
      lookY = 0.45;
      lookX = -0.05;
      lookZ = 0.04;
    } else if (t < 4.0) {
      // Smooth sweep across to the right
      const s = smoothstep(2.5, 4.0, t);
      lookY = lerp(0.45, -0.42, s);
      lookX = lerp(-0.05, 0.08, s);
      lookZ = lerp(0.04, -0.04, s);
    } else if (t < 4.8) {
      // Hold glance right
      lookY = -0.42;
      lookX = 0.08;
      lookZ = -0.04;
    } else if (t < 5.5) {
      // Center head forward before walking starts
      const s = smoothstep(4.8, 5.5, t);
      lookY = lerp(-0.42, 0, s);
      lookX = lerp(0.08, 0, s);
      lookZ = lerp(-0.04, 0, s);
    } else if (t < 9.5) {
      // Walking phase: head faces front with subtle walking bob
      lookY = 0;
      lookX = 0;
      lookZ = 0;
    } else if (t < 10.8) {
      // Stopped: glance slightly upward and to the right
      const s = smoothstep(9.5, 10.8, t);
      lookY = lerp(0, -0.35, s);
      lookX = lerp(0, -0.18, s);
      lookZ = lerp(0, -0.05, s);
    } else if (t < 12.0) {
      // Hold curious glance
      lookY = -0.35;
      lookX = -0.18;
      lookZ = -0.05;
    } else if (t < 13.5) {
      // Sweep glance down and to the left
      const s = smoothstep(12.0, 13.5, t);
      lookY = lerp(-0.35, 0.32, s);
      lookX = lerp(-0.18, 0.12, s);
      lookZ = lerp(-0.05, 0.05, s);
    } else if (t < 14.8) {
      // Hold glance down-left
      lookY = 0.32;
      lookX = 0.12;
      lookZ = 0.05;
    } else {
      // Smoothly return to center for seamless loop
      const s = smoothstep(14.8, 16.0, t);
      lookY = lerp(0.32, 0, s);
      lookX = lerp(0.12, 0, s);
      lookZ = lerp(0.05, 0, s);
    }

    // Walking head bobbing
    const walkBobY = Math.sin(walkStride / 2) * 0.07;
    const walkBobX = Math.sin(walkStride / 2.5) * 0.035;

    player.skin.head.rotation.y = lookY * (1.0 - walkWeight) + walkBobY * walkWeight;
    player.skin.head.rotation.x = lookX * (1.0 - walkWeight) + walkBobX * walkWeight;
    player.skin.head.rotation.z = lookZ * (1.0 - walkWeight);

    // Cape subtle flap
    const basicCapeRotationX = Math.PI * 0.06;
    player.cape.rotation.x =
      basicCapeRotationX +
      Math.sin(this.progress * (walkWeight > 0.1 ? 5 : 2)) *
        (0.015 + 0.06 * walkWeight);
  }
}

/**
 * Interactive 3D Minecraft character stage.
 * Renders the player's active skin in a WebGL canvas using skinview3d,
 * continuously cycling through looking around, walking in place, and pausing.
 *
 * Automatically pauses the rendering loop during active gameplay to
 * ensure zero GPU/CPU drain while Minecraft is running.
 */
const CharacterStage: Component<Props> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  let containerRef: HTMLDivElement | undefined;
  let viewer: SkinViewer | undefined;

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

    // Start ambient roam & look-around animation cycle
    viewer.animation = new RoamAndLookAnimation();

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
      title="Click and drag to rotate"
    >
      <canvas ref={canvasRef} class="character-stage-canvas" />
    </div>
  );
};

export default CharacterStage;
