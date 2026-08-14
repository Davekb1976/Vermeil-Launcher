// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Set the Application User Model ID before Tauri initializes WebView2.
    // This makes Windows group the WebView2 child processes under the Vermeil
    // app tree in Task Manager instead of a separate "WebView2 Manager" entry.
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
        // AUMID must be a wide string. Matches the Tauri identifier.
        let id: Vec<u16> = "com.vermeil.launcher\0".encode_utf16().collect();
        let _ = SetCurrentProcessExplicitAppUserModelID(id.as_ptr());
    }

    vermeil_lib::run()
}
