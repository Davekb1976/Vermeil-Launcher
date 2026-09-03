/* Runnable self-check for the cape transform maths — the logarithmic scale
 * slider mapping, the untrusted-value clamps, and the rotation geometry.
 * No framework — run with:
 *   npx tsx src/lib/capeTransform.selfcheck.ts
 * Exits non-zero (throws) on the first failed case. */
import {
  PANEL,
  SCALE_MIN,
  SCALE_MAX,
  SCALE_STEPS,
  posToScale,
  scaleToPos,
  clampScale,
  clampRot,
  computeBaseFit,
  drawPlacedImage,
} from "./cape";

let failed = 0;
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failed++;
    console.error(`FAIL: ${label}`);
  }
};
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

// ─── Scale slider mapping ───

check("pos 0 → SCALE_MIN", near(posToScale(0), SCALE_MIN));
check("pos SCALE_STEPS → SCALE_MAX", near(posToScale(SCALE_STEPS), SCALE_MAX));

// Round-trips both ways, so a future edit can't invert one half of the pair.
for (const pos of [0, 1, 137, 500, 763, SCALE_STEPS]) {
  check(`round-trip pos ${pos}`, near(scaleToPos(posToScale(pos)), pos, 1e-6));
}
for (const s of [SCALE_MIN, 0.5, 1, 2.5, 10, SCALE_MAX]) {
  check(`round-trip scale ${s}`, near(posToScale(scaleToPos(s)), s, 1e-6));
}

// Monotonic increasing — a sign slip would make the slider run backwards.
let prev = -Infinity;
for (let pos = 0; pos <= SCALE_STEPS; pos += 25) {
  const s = posToScale(pos);
  check(`monotonic at pos ${pos}`, s > prev);
  prev = s;
}

// The defining property of a log track: equal position deltas give equal
// ratios, which is what keeps precision near 1x while allowing a high ceiling.
const d = 100;
const r1 = posToScale(d) / posToScale(0);
const r2 = posToScale(500 + d) / posToScale(500);
check("equal position deltas give equal ratios", near(r1, r2, 1e-9));

// 1x must be reachable and sit in the lower-middle of the travel (the common
// range gets most of the slider, not a sliver at the far left).
const posAt1x = scaleToPos(1);
check("1x is reachable", near(posToScale(posAt1x), 1, 1e-9));
check("1x sits in the first half of the travel", posAt1x > 0 && posAt1x < SCALE_STEPS * 0.5);

// The ceiling exists to serve extreme-aspect sources: a 4000x100 banner
// contain-fits to a sliver, and must still be able to fill the panel height.
// This is the regression guard on SCALE_MAX itself.
const wide = computeBaseFit(4000, 100);
check("SCALE_MAX can fill the panel height with a 4000x100 source", wide.baseDh * SCALE_MAX >= PANEL.h);
const tall = computeBaseFit(100, 4000);
check("SCALE_MAX can fill the panel width with a 100x4000 source", tall.baseDw * SCALE_MAX >= PANEL.w);

// ─── Clamps (transform blob is opaque to the backend → untrusted) ───

check("clampScale(undefined) → 1", clampScale(undefined) === 1);
check("clampScale(NaN) → 1", clampScale(NaN) === 1);
check("clampScale(Infinity) → 1", clampScale(Infinity) === 1);
check("clampScale(0) → SCALE_MIN", clampScale(0) === SCALE_MIN);
check("clampScale(-5) → SCALE_MIN", clampScale(-5) === SCALE_MIN);
check("clampScale(1e9) → SCALE_MAX", clampScale(1e9) === SCALE_MAX);
check("clampScale passes a valid value through", clampScale(2.5) === 2.5);

check("clampRot(undefined) → 0", clampRot(undefined) === 0);
check("clampRot(NaN) → 0", clampRot(NaN) === 0);
check("clampRot(0) → 0", clampRot(0) === 0);
check("clampRot(90) → 90", clampRot(90) === 90);
check("clampRot(360) → 0", clampRot(360) === 0);
check("clampRot(370) → 10", clampRot(370) === 10);
check("clampRot(-90) → 270", clampRot(-90) === 270);
check("clampRot(-450) → 270", clampRot(-450) === 270);

// ─── Rotation geometry ───

/** Minimal recording stand-in for a 2D context — drawPlacedImage only needs
 *  these five calls, so the geometry is checkable with no canvas/DOM. */
function recorder() {
  const calls: string[] = [];
  const ctx = {
    save: () => void calls.push("save"),
    restore: () => void calls.push("restore"),
    translate: (x: number, y: number) => void calls.push(`translate ${x} ${y}`),
    rotate: (a: number) => void calls.push(`rotate ${a.toFixed(6)}`),
    drawImage: (_s: unknown, x: number, y: number, w: number, h: number) =>
      void calls.push(`drawImage ${x} ${y} ${w} ${h}`),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}
const IMG = {} as CanvasImageSource;

// rot 0 must stay on the cheap path: a single plain drawImage, no transform.
{
  const { ctx, calls } = recorder();
  drawPlacedImage(ctx, IMG, 3, 5, 10, 20, 0);
  check("rot 0 → one plain drawImage", calls.length === 1 && calls[0] === "drawImage 3 5 10 20");
}
{
  const { ctx, calls } = recorder();
  drawPlacedImage(ctx, IMG, 3, 5, 10, 20); // rot omitted entirely
  check("rot omitted → one plain drawImage", calls.length === 1 && calls[0] === "drawImage 3 5 10 20");
}

// Rotation pivots on the rect's own centre and draws centred on that pivot.
// This is the invariant "Center" relies on: position and rotation stay
// independent, so a centred image is still centred at any angle.
{
  const { ctx, calls } = recorder();
  drawPlacedImage(ctx, IMG, 3, 5, 10, 20, 90);
  check(
    "rot 90 → save/translate-to-centre/rotate/centred-draw/restore",
    calls.join(" | ") ===
      `save | translate 8 15 | rotate ${(Math.PI / 2).toFixed(6)} | drawImage -5 -10 10 20 | restore`,
  );
}

// Degrees → radians, clockwise, for the quarter turns users actually hit.
for (const [deg, rad] of [
  [90, Math.PI / 2],
  [180, Math.PI],
  [270, (3 * Math.PI) / 2],
] as const) {
  const { ctx, calls } = recorder();
  drawPlacedImage(ctx, IMG, 0, 0, 4, 4, deg);
  check(`rot ${deg} → ${rad.toFixed(4)} rad`, calls.includes(`rotate ${rad.toFixed(6)}`));
}

// Every rotated draw must balance save/restore, or the clip regions the bake
// sets up around it would leak into later draws.
for (const deg of [0, 45, 90, 200, 359]) {
  const { ctx, calls } = recorder();
  drawPlacedImage(ctx, IMG, 1, 2, 8, 8, deg);
  const saves = calls.filter((c) => c === "save").length;
  const restores = calls.filter((c) => c === "restore").length;
  check(`rot ${deg} balances save/restore`, saves === restores);
}

if (failed > 0) {
  throw new Error(`${failed} cape-transform case(s) failed`);
}
console.log("capeTransform: all cases passed");
