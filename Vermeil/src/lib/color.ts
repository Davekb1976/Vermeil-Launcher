/**
 * Hex ↔ RGB helpers for the app's own colour picker.
 *
 * ## Why we don't use `<input type="color">`
 *
 * That element's picker is *browser UI*, not renderer content — Chromium and
 * WebKit each hand the click to a host-provided colour chooser. The two
 * webviews this app ships on don't both supply one: on WebView2 (Windows)
 * clicking the swatch does nothing at all, and WebKitGTK's support depends on
 * the GTK build it was compiled against. That makes the native control a
 * user-facing behaviour that works on neither-to-one platform, which the
 * cross-platform parity rule doesn't allow. So {@link ../components/ColorPicker}
 * renders a picker out of ordinary DOM (buttons, range inputs, a text field),
 * which behaves identically on both, and these helpers are its parse/format
 * layer.
 *
 * Both directions treat their input as untrusted: a hex string arrives either
 * from the user typing into the field or from a stored cape transform, which
 * the backend keeps as an opaque JSON blob it never validates.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Clamp to a valid 0–255 channel. Non-finite input collapses to 0 rather than
 *  producing "NaN" in a hex string. */
function clampByte(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(255, Math.max(0, Math.round(n)));
}

/**
 * Parse `#rgb` or `#rrggbb` (leading `#` optional, any case) into channels.
 *
 * Returns null for anything else — including the partial strings a user types
 * mid-entry — so callers can hold the last good colour instead of painting
 * something unintended.
 */
export function parseHex(input: string): Rgb | null {
  const s = input.trim().replace(/^#/, "");
  if (!/^[0-9a-f]+$/i.test(s)) return null;
  if (s.length === 3) {
    return {
      r: parseInt(s[0] + s[0], 16),
      g: parseInt(s[1] + s[1], 16),
      b: parseInt(s[2] + s[2], 16),
    };
  }
  if (s.length === 6) {
    return {
      r: parseInt(s.slice(0, 2), 16),
      g: parseInt(s.slice(2, 4), 16),
      b: parseInt(s.slice(4, 6), 16),
    };
  }
  return null;
}

/** Channels → `#rrggbb`, lower-case. Out-of-range channels are clamped. */
export function toHex(rgb: Rgb): string {
  return (
    "#" +
    [rgb.r, rgb.g, rgb.b]
      .map((c) => clampByte(c).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Normalize an untrusted colour string to a canonical `#rrggbb`, falling back
 *  to `fallback` when it isn't a usable hex colour. Use this on anything that
 *  came from disk before it reaches a canvas `fillStyle` (which silently keeps
 *  the previous colour when handed something invalid). */
export function normalizeHex(input: string | undefined | null, fallback: string): string {
  const rgb = input === undefined || input === null ? null : parseHex(input);
  return rgb ? toHex(rgb) : fallback;
}
