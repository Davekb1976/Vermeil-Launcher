import { Component, createSignal, createEffect, onCleanup, Show } from "solid-js";
import { parseHex, toHex, normalizeHex, Rgb } from "../lib/color";

/**
 * In-app colour picker: a swatch button that opens a small popover with one
 * range input per RGB channel plus a hex field.
 *
 * Replaces `<input type="color">`, whose picker is host browser UI that neither
 * of our webviews reliably provides — see the note in `lib/color.ts`. Built from
 * ordinary DOM so it renders and behaves the same on WebView2 and WebKitGTK,
 * and so it inherits the app's own slider/field styling instead of an OS dialog.
 *
 * Each channel track is painted with a gradient showing what moving that slider
 * does to the current colour, which is what makes plain RGB sliders workable for
 * picking rather than just for entering known values.
 */

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
