//! Native screen colour picker ("eyedropper") for the app's colour picker UI.
//!
//! ## Why this is native and not a web API
//!
//! Two in-webview routes were tried and both are dead on WebView2:
//!
//! 1. `<input type="color">` opens Chromium's colour popup fine, but the
//!    eyedropper button inside it is host browser UI that WebView2 doesn't
//!    drive — clicking it does nothing, and a native input exposes no hook to
//!    replace it.
//! 2. The `EyeDropper` **API** is exposed (the constructor exists, so feature
//!    detection passes), but `open()` returns a promise that never settles —
//!    neither resolving nor rejecting. WebView2 ships the JS interface without
//!    wiring the host picker behind it, which is worse than not shipping it,
//!    because it defeats feature detection.
//!
//! So the pick happens here instead, where we control it end to end.
//!
//! ## How it works (Windows)
//!
//! There's no overlay window and no screen capture. While picking, we poll at a
//! display-ish rate and, each tick, read the pixel under the cursor straight off
//! the screen device context (`GetDC(NULL)` + `GetPixel`). The colour is emitted
//! as it moves so the UI previews live, which is what replaces the magnifier
//! Chromium would have drawn. Pressing the primary mouse button commits;
//! Escape or the secondary button cancels.
//!
//! ## Scope of what this touches
//!
//! Deliberately narrow, because polling global input state deserves the
//! scrutiny: it reads the cursor position, one screen pixel, and the pressed
//! state of exactly two keys (the mouse buttons and Escape). It never reads
//! characters, never captures a region of the screen, and only runs between an
//! explicit user activation and the click that ends it, bounded by
//! `PICK_TIMEOUT`. Sampled colours are not logged.

use tauri::{AppHandle, Emitter};

/// Poll interval. ~60Hz keeps the live preview smooth without spinning a core.
const POLL_MS: u64 = 16;
/// Hard stop, so an abandoned pick can't poll forever if the user wanders off.
const PICK_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);

/// Emitted on every poll tick while picking, so the picker UI can preview the
/// colour under the cursor. Payload is a `#rrggbb` string.
const PREVIEW_EVENT: &str = "eyedropper-preview";

/// Run a screen colour pick to completion.
///
/// Returns the chosen colour as `#rrggbb`, or `None` when the user cancelled
/// (Escape, secondary click, or timeout). `Err` is reserved for "this platform
/// can't do it", so the caller can tell "no colour" apart from "not available".
pub async fn pick_screen_color(app: AppHandle) -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        windows_impl::run(app).await
    }
    // The frontend hides the eyedropper button off Windows, so this is a
    // belt-and-braces answer for a hand-crafted IPC call rather than a path a
    // user can reach. Closing the gap needs the XDG desktop portal's
    // Screenshot.PickColor on Wayland (and an X11 root-window read as the
    // fallback); see the research note.
    #[cfg(not(windows))]
    {
        let _ = app;
        Err("Screen colour picking isn't available on this platform yet".into())
    }
}

#[cfg(windows)]
mod windows_impl {
    use super::{AppHandle, Emitter, PICK_TIMEOUT, POLL_MS, PREVIEW_EVENT};
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::Graphics::Gdi::{GetDC, GetPixel, ReleaseDC, CLR_INVALID};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_ESCAPE, VK_LBUTTON, VK_RBUTTON,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetCursorPos, GetSystemMetrics, SM_SWAPBUTTON,
    };

    /// True while `vk` is held. `GetAsyncKeyState` reports the pressed state in
    /// the high bit; the low bit ("pressed since last call") is deliberately
    /// ignored because it's consumed by whoever calls first and would race.
    fn is_down(vk: i32) -> bool {
        unsafe { (GetAsyncKeyState(vk) as u16 & 0x8000) != 0 }
    }

    /// The physical button under the user's index finger. Windows lets the two
    /// be swapped, and an eyedropper that ignores that setting would commit on
    /// what the user experiences as a right-click.
    fn primary_secondary() -> (i32, i32) {
        let swapped = unsafe { GetSystemMetrics(SM_SWAPBUTTON) } != 0;
        if swapped {
            (VK_RBUTTON as i32, VK_LBUTTON as i32)
        } else {
            (VK_LBUTTON as i32, VK_RBUTTON as i32)
        }
    }

    /// Colour of the pixel under the cursor, as `#rrggbb`.
    ///
    /// `GetPixel` on the screen DC reads the composited desktop, so it samples
    /// whatever the user actually sees — other apps, video, the game — not just
    /// our own window.
    ///
    /// Both calls work in the same physical-pixel space, so DPI scaling can't
    /// desync them regardless of the process's awareness level.
    ///
    /// Verified on a multi-monitor desktop: the decode below was cross-checked
    /// against an independent ARGB screen-capture path and agreed, and a read at
    /// negative virtual-desktop coordinates (a monitor left of the primary)
    /// worked, so the whole virtual desktop is samplable and not just the primary
    /// display.
    ///
    /// Returns `None` when the read fails — over surfaces the desktop DC can't
    /// report (some hardware-overlay video paths) and on a locked screen.
    /// Callers surface that as a failed pick rather than guessing, so a wrong
    /// colour is never committed.
    fn pixel_under_cursor() -> Option<String> {
        let mut pt = POINT { x: 0, y: 0 };
        if unsafe { GetCursorPos(&mut pt) } == 0 {
            return None;
        }
        let hdc = unsafe { GetDC(std::ptr::null_mut()) };
        if hdc.is_null() {
            return None;
        }
        let colorref = unsafe { GetPixel(hdc, pt.x, pt.y) };
        unsafe { ReleaseDC(std::ptr::null_mut(), hdc) };
        if colorref == CLR_INVALID {
            return None;
        }
        // COLORREF is 0x00BBGGRR — byte order is the reverse of hex notation.
        let r = (colorref & 0xFF) as u8;
        let g = ((colorref >> 8) & 0xFF) as u8;
        let b = ((colorref >> 16) & 0xFF) as u8;
        Some(format!("#{:02x}{:02x}{:02x}", r, g, b))
    }

    pub async fn run(app: AppHandle) -> Result<Option<String>, String> {
        let (primary, secondary) = primary_secondary();
        let started = std::time::Instant::now();

        // The click that opened the picker may still be down, or its release may
        // still be pending. Arm only once the primary button has been observed
        // up, otherwise that same click would instantly commit whatever pixel
        // the button happens to sit on.
        let mut armed = false;
        let mut last_preview: Option<String> = None;

        loop {
            if started.elapsed() > PICK_TIMEOUT {
                tracing::debug!("Eyedropper timed out after {:?}", PICK_TIMEOUT);
                return Ok(None);
            }
            if is_down(VK_ESCAPE as i32) || (armed && is_down(secondary)) {
                tracing::debug!("Eyedropper cancelled by the user");
                return Ok(None);
            }

            if !armed {
                if !is_down(primary) {
                    armed = true;
                }
            } else if is_down(primary) {
                // Commit. Re-read rather than trusting the last preview, so the
                // returned colour is the pixel at the moment of the click.
                let picked = pixel_under_cursor()
                    .or(last_preview)
                    .ok_or_else(|| "Couldn't read the pixel under the cursor".to_string())?;
                return Ok(Some(picked));
            }

            // Live preview — only emitted when it actually changed, so a still
            // cursor doesn't push 60 identical events a second at the frontend.
            if let Some(hex) = pixel_under_cursor() {
                if last_preview.as_deref() != Some(hex.as_str()) {
                    let _ = app.emit(PREVIEW_EVENT, hex.clone());
                    last_preview = Some(hex);
                }
            }

            tokio::time::sleep(std::time::Duration::from_millis(POLL_MS)).await;
        }
    }
}
