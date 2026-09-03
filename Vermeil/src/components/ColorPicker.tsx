import { Component, createSignal, createEffect, onCleanup, Show } from "solid-js";
import { parseHex, toHex, normalizeHex, Rgb } from "../lib/color";
import { showToast } from "../App";
import { IconCrosshair } from "./Icons";

/**
 * In-app colour picker: a swatch button that opens a popover with a screen
 * eyedropper, one range input per RGB channel, and a hex field.
 *
 * Replaces `<input type="color">`. That element's own popup worked, but the
 * eyedropper button inside it is host browser UI that WebView2 doesn't drive, so
 * screen-picking was dead and a native input offers no way to add it back — see
 * the note in `lib/color.ts`. Owning the control is what makes the eyedropper
 * below possible.
 *
 * Each channel track is painted with a gradient showing what moving that slider
 * does to the current colour, which is what makes plain RGB sliders workable for
 * picking rather than just for entering known values.
 */

/** Minimal structural type for the EyeDropper API, so we don't need the DOM lib
 *  to declare it. Chromium-only (WebView2 on Windows); absent on WebKitGTK. */
type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

/** Feature-detected once. The button is hidden entirely when unsupported rather
 *  than shown and failing — on WebKitGTK (Linux) there is no such API, so Linux
 *  users get the sliders and hex field with no dead affordance. */
const EyeDropperImpl = (globalThis as { EyeDropper?: EyeDropperCtor }).EyeDropper;

interface Props {
  /** Current colour, `#rrggbb`. Anything invalid falls back to black. */
  value: string;
  /** Fired on every change with a canonical `#rrggbb` — drives live preview. */
  onInput: (hex: string) => void;
  /** Accessible name for the trigger button. */
  label: string;
}

const CHANNELS: Array<{ key: keyof Rgb; name: string }> = [
  { key: "r", name: "Red" },
  { key: "g", name: "Green" },
  { key: "b", name: "Blue" },
];

const ColorPicker: Component<Props> = (props) => {
  const [open, setOpen] = createSignal(false);
  // What the hex field currently shows. Kept separate from `props.value` so a
  // half-typed value ("#2b2") isn't rewritten under the caret on each keystroke.
  const [draft, setDraft] = createSignal<string | null>(null);

  let triggerEl: HTMLButtonElement | undefined;
  let panelEl: HTMLDivElement | undefined;

  const hex = () => normalizeHex(props.value, "#000000");
  const rgb = (): Rgb => parseHex(hex()) ?? { r: 0, g: 0, b: 0 };

  const setChannel = (key: keyof Rgb, v: number) => {
    props.onInput(toHex({ ...rgb(), [key]: v }));
  };

  /** Gradient across a channel's full range, holding the other two steady, so
   *  the track previews the outcome instead of being an abstract 0–255 bar. */
  const trackGradient = (key: keyof Rgb) => {
    const from = toHex({ ...rgb(), [key]: 0 });
    const to = toHex({ ...rgb(), [key]: 255 });
    return `linear-gradient(to right, ${from}, ${to})`;
  };

  const commitHex = (raw: string) => {
    setDraft(raw);
    const parsed = parseHex(raw);
    if (parsed) props.onInput(toHex(parsed));
  };

  /**
   * Sample a colour from anywhere on screen via the EyeDropper API — the
   * magnifier-grid picker Chromium provides.
   *
   * `open()` must be called inside the click handler with no `await` before it:
   * the API requires transient user activation, and awaiting anything first
   * spends it and makes the call fail. It rejects with AbortError when the user
   * presses Escape, which is a normal outcome and stays silent; anything else is
   * a real failure worth surfacing.
   */
  const pickFromScreen = () => {
    if (!EyeDropperImpl) return;
    new EyeDropperImpl()
      .open()
      .then(({ sRGBHex }) => {
        const parsed = parseHex(sRGBHex);
        if (parsed) {
          props.onInput(toHex(parsed));
          setDraft(null); // resync the hex field to the sampled colour
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return; // dismissed
        showToast({ title: "Couldn't pick a colour", message: String(err), type: "error" });
      });
  };

  // Close on outside mousedown / Escape — same convention as the app's other
  // popovers. Escape also returns focus to the trigger so keyboard users aren't
  // dropped at the top of the document.
  createEffect(() => {
    if (!open()) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelEl?.contains(t) || triggerEl?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerEl?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    onCleanup(() => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    });
  });

  return (
    <div class="color-picker">
      <button
        ref={triggerEl}
        type="button"
        class="color-swatch"
        style={`background:${hex()}`}
        aria-label={`${props.label} — ${hex()}`}
        aria-haspopup="dialog"
        aria-expanded={open()}
        onClick={() => {
          setDraft(null); // re-sync the field to the live colour on each open
          setOpen(!open());
        }}
      />

      <Show when={open()}>
        <div ref={panelEl} class="color-pop" role="dialog" aria-label={props.label}>
          <Show when={EyeDropperImpl}>
            <button type="button" class="btn btn--sm color-eyedrop" onClick={pickFromScreen}>
              <IconCrosshair />
              <span>Pick from screen</span>
            </button>
          </Show>

          {CHANNELS.map((ch) => (
            <label class="color-chan">
              <span class="color-chan-name">{ch.name}</span>
              <input
                type="range"
                min="0"
                max="255"
                step="1"
                value={rgb()[ch.key]}
                style={`background:${trackGradient(ch.key)}`}
                aria-label={ch.name}
                onInput={(e) => setChannel(ch.key, parseInt(e.currentTarget.value, 10))}
              />
              <span class="color-chan-value">{rgb()[ch.key]}</span>
            </label>
          ))}

          <label class="color-hex">
            <span class="color-chan-name">Hex</span>
            <input
              class="field-control field-control--text"
              value={draft() ?? hex()}
              spellcheck={false}
              maxLength={7}
              aria-label="Hex colour"
              onInput={(e) => commitHex(e.currentTarget.value)}
              onBlur={() => setDraft(null)}
            />
          </label>
        </div>
      </Show>
    </div>
  );
};

export default ColorPicker;
