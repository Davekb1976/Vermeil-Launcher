use crate::services;
use tauri::AppHandle;

/// Start a screen colour pick and resolve with the chosen colour.
///
/// Resolves to `None` when the user cancels (Escape, secondary click, or the
/// service's timeout), so the frontend can leave the current colour alone
/// without treating a deliberate cancel as an error.
#[tauri::command]
pub async fn pick_screen_color(app: AppHandle) -> Result<Option<String>, String> {
    services::eyedropper::pick_screen_color(app).await
}
