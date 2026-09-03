import { Component, createSignal, createEffect, onCleanup, Show } from "solid-js";
import { parseHex, toHex, normalizeHex, Rgb } from "../lib/color";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { pickScreenColor } from "../ipc/commands";
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
 * below possible; the pick itself runs in `services::eyedropper`, because the
 * `EyeDropper` JS API is present-but-inert in WebView2 too.
 *
 * Each channel track is painted with a gradient showing what moving that slider
 * does to the current colour, which is what makes plain RGB sliders workable for
 * picking rather than just for entering known values.
 */

/**
 * Whether to offer the screen eyedropper. Backed by `services::eyedropper`,
 * which is Windows-only for now, so gate on the platform rather than probing.
 *
 * Deliberately *not* feature-detected against `window.EyeDropper`: WebView2
 * defines that constructor but never settles the promise `open()` returns, so
 * detection passes and the button silently does nothing — which is the bug this
 * replaced. Same `navigator.userAgent` convention the app already uses in
 * Settings and the onboarding wizard.
 */
const SUPPORTS_SCREEN_PICK = navigator.userAgent.includes("Windows");

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
  // True while a screen pick is in flight, so the popover stays put and the
  // button reads as busy instead of inviting a second pick.
  const [picking, setPicking] = createSignal(false);
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
   * Sample a colour from anywhere on screen, via the native picker in
   * `services::eyedropper`.
   *
   * The backend streams `eyedropper-preview` as the cursor moves and we apply
   * each one straight away, so the swatch and the cape preview update live —
   * that live feedback is what stands in for the magnifier Chromium would have
   * drawn. Because previewing mutates the real colour, the value from before the
   * pick is captured and restored if the user cancels, so backing out leaves
   * nothing changed. The listener is registered before the command is invoked,
   * otherwise the first few preview events would arrive with nothing attached.
   */
  const pickFromScreen = async () => {
    if (!SUPPORTS_SCREEN_PICK || picking()) return;
    const before = hex();
    setPicking(true);
    let unlisten: UnlistenFn | undefined;
    try {
      unlisten = await listen<string>("eyedropper-preview", (e) => {
        const parsed = parseHex(e.payload);
        if (parsed) props.onInput(toHex(parsed));
      });
      const picked = await pickScreenColor();
      const parsed = picked ? parseHex(picked) : null;
      // No colour means a deliberate cancel (Escape / secondary click / timeout).
      props.onInput(parsed ? toHex(parsed) : before);
      setDraft(null);
    } catch (err) {
      props.onInput(before);
      showToast({ title: "Couldn't pick a colour", message: String(err), type: "error" });
    } finally {
      unlisten?.();
      setPicking(false);
    }
  };

  // Close on outside mousedown / Escape — same convention as the app's other
  // popovers. Escape also returns focus to the trigger so keyboard users aren't
  // dropped at the top of the document.
  createEffect(() => {
    if (!open()) return;
    // Both guards skip while a screen pick is running: the commit click lands
    // outside the popover and Escape is the pick's own cancel key, so reacting
    // to either would tear the popover down mid-pick.
    const onDown = (e: MouseEvent) => {
      if (picking()) return;
      const t = e.target as Node;
      if (panelEl?.contains(t) || triggerEl?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !picking()) {
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
          <Show when={SUPPORTS_SCREEN_PICK}>
            <button
              type="button"
              class="btn btn--sm color-eyedrop"
              onClick={pickFromScreen}
              disabled={picking()}
            >
              <IconCrosshair />
              <span>{picking() ? "Click a pixel · Esc to cancel" : "Pick from screen"}</span>
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
