use crate::services::auth::{self, MinecraftProfile, AccountSummary};
use crate::util::{paths, credentials};
use std::fs;
use tauri::Manager;

/// Start Microsoft login — opens a webview window for sign-in.
#[tauri::command]
pub async fn start_ms_login(app: tauri::AppHandle) -> Result<String, String> {
    let flow = auth::begin_login().await?;

    // Close any existing sign-in window
    if let Some(existing) = app.get_webview_window("signin") {
        let _ = existing.close();
    }

    // Isolate the sign-in webview's session in its own data directory and wipe it
    // before each login. Microsoft's webview persists session cookies, so without
    // this the account chooser keeps listing accounts the user already removed
    // from the launcher (and a fresh launcher has no way to drop a stale MS
    // session). A dedicated dir keeps the wipe from touching the main window's
    // webview storage (e.g. the Library sort saved in localStorage). Best-effort:
    // if the folder is briefly locked by a just-closed window, the next login
    // still gets a clean slate.
    let auth_webview_dir = paths::data_dir().join("auth-webview");
    let _ = fs::remove_dir_all(&auth_webview_dir);

    // Open a new webview window pointed at the Microsoft sign-in page
    let window = tauri::WebviewWindowBuilder::new(
        &app,
        "signin",
        tauri::WebviewUrl::External(flow.auth_url.parse().map_err(|e| format!("Bad auth URL: {}", e))?),
    )
    .title("Sign in to Minecraft")
    .inner_size(500.0, 650.0)
    .center()
    .always_on_top(true)
    // Paint the window in the app's dark background up front so it doesn't flash
    // white before Microsoft's page renders.
    .background_color(tauri::utils::config::Color(19, 17, 25, 255))
    .data_directory(auth_webview_dir)
    .build()
    .map_err(|e| format!("Failed to open sign-in window: {}", e))?;

    // Poll the window's URL every 50ms, looking for the redirect with the auth code
    let start = chrono::Utc::now();
    let timeout = chrono::Duration::minutes(10);

    loop {
        if chrono::Utc::now() - start > timeout {
            let _ = window.close();
            return Err("Login timed out (10 minutes)".to_string());
        }

        if window.title().is_err() {
            return Err("Login cancelled".to_string());
        }

        if let Ok(current_url) = window.url() {
            let url_str = current_url.as_str();
            if url_str.starts_with("https://login.live.com/oauth20_desktop.srf") {
                if let Some(code) = current_url.query_pairs()
                    .find(|(k, _)| k == "code")
                    .map(|(_, v)| v.to_string())
                {
                    let _ = window.close();
                    let profile = auth::finish_login(&code, &flow).await?;
                    add_or_update_account(profile.clone())?;
                    return Ok(serde_json::to_string(&profile.to_summary(false)).unwrap());
                }

                if let Some(error) = current_url.query_pairs()
                    .find(|(k, _)| k == "error")
                    .map(|(_, v)| v.to_string())
                {
                    let _ = window.close();
                    let desc = current_url.query_pairs()
                        .find(|(k, _)| k == "error_description")
                        .map(|(_, v)| v.to_string())
                        .unwrap_or_default();
                    return Err(format!("Login error: {} — {}", error, desc));
                }
            }
        }

        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
}

/// Get the currently active account (with auto-refresh if expired).
#[tauri::command]
pub async fn get_active_account() -> Result<Option<AccountSummary>, String> {
    let mut accounts = load_accounts();
    let mut reauth_required = false;

    let needs_refresh = accounts.iter().find(|a| a.active).map(|a| {
        !a.is_offline && a.expires_at < chrono::Utc::now().timestamp() && a.refresh_token.is_some()
    }).unwrap_or(false);

    if needs_refresh {
        let refresh_token = accounts.iter().find(|a| a.active)
            .and_then(|a| a.refresh_token.clone())
            .unwrap_or_default();

        match auth::refresh_token(&refresh_token).await {
            Ok(refreshed) => {
                if let Some(active) = accounts.iter_mut().find(|a| a.active) {
                    let creds = credentials::AccountCredentials {
                        access_token: refreshed.access_token.clone(),
                        refresh_token: refreshed.refresh_token.clone(),
                    };
                    let _ = credentials::save_account_credentials(&active.id, &creds);

                    active.access_token = refreshed.access_token;
                    active.refresh_token = refreshed.refresh_token;
                    active.expires_at = refreshed.expires_at;
                    active.name = refreshed.name;
                }
                let _ = save_accounts(&accounts);
            }
            Err(e) => {
                tracing::error!("Token refresh failed: {}", e);
                reauth_required = true;
            }
        }
    }

    let now = chrono::Utc::now().timestamp();
    Ok(accounts.into_iter().find(|a| a.active).map(|a| {
        let expired_without_refresh = !a.is_offline && a.expires_at < now && a.refresh_token.is_none();
        a.to_summary(reauth_required || expired_without_refresh)
    }))
}

/// Get all accounts.
#[tauri::command]
pub async fn get_all_accounts() -> Result<Vec<AccountSummary>, String> {
    let now = chrono::Utc::now().timestamp();
    let accounts = load_accounts();
    Ok(accounts.into_iter().map(|a| {
        let expired_without_refresh = !a.is_offline && a.expires_at < now && a.refresh_token.is_none();
        a.to_summary(expired_without_refresh)
    }).collect())
}

/// Set a specific account as active.
#[tauri::command]
pub async fn set_active_account(id: String) -> Result<(), String> {
    let mut accounts = load_accounts();

    for account in accounts.iter_mut() {
        account.active = account.id == id;
    }

    save_accounts(&accounts)
}

/// Add an offline account.
#[tauri::command]
pub async fn add_offline_account(username: String) -> Result<AccountSummary, String> {
    if username.trim().is_empty() || username.len() > 16 {
        return Err("Username must be 1-16 characters".to_string());
    }

    let offline_uuid = generate_offline_uuid(&username);

    let profile = MinecraftProfile {
        id: offline_uuid,
        name: username.trim().to_string(),
        access_token: "offline".to_string(),
        refresh_token: None,
        expires_at: 0,
        is_offline: true,
        skin_path: None,
        active: true,
    };

    add_or_update_account(profile.clone())?;
    Ok(profile.to_summary(false))
}

/// Upload a skin for the active account.
#[tauri::command]
pub async fn set_account_skin(skin_file_path: String) -> Result<String, String> {
    let mut accounts = load_accounts();

    let active = accounts.iter_mut().find(|a| a.active)
        .ok_or("No active account")?;

    let skins_dir = paths::data_dir().join("skins");
    fs::create_dir_all(&skins_dir).map_err(|e| e.to_string())?;

    let skin_filename = format!("{}.png", active.id);
    let dest_path = skins_dir.join(&skin_filename);

    fs::copy(&skin_file_path, &dest_path).map_err(|e| format!("Failed to copy skin: {}", e))?;

    active.skin_path = Some(dest_path.to_string_lossy().to_string());
    save_accounts(&accounts)?;

    Ok(dest_path.to_string_lossy().to_string())
}

/// Remove a specific account. If it was active, activate the next one.
#[tauri::command]
pub async fn remove_account(id: String) -> Result<(), String> {
    let _ = credentials::delete_account_credentials(&id);

    let mut accounts = load_accounts();
    let was_active = accounts.iter().find(|a| a.id == id).map(|a| a.active).unwrap_or(false);

    accounts.retain(|a| a.id != id);

    // If we removed the active account, activate the first remaining one
    if was_active && !accounts.is_empty() {
        accounts[0].active = true;
    }

    save_accounts(&accounts)
}

/// Legacy logout — removes all accounts and wipes the credential vault.
#[tauri::command]
pub async fn logout() -> Result<(), String> {
    let _ = credentials::clear_all_credentials();
    let accounts_path = paths::data_dir().join("accounts.json");
    if accounts_path.exists() {
        fs::remove_file(&accounts_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// === HELPERS ===

fn load_accounts() -> Vec<MinecraftProfile> {
    let accounts_path = paths::data_dir().join("accounts.json");
    if !accounts_path.exists() {
        return Vec::new();
    }
    credentials::restrict_file_permissions(&accounts_path);
    let content = fs::read_to_string(&accounts_path).unwrap_or_default();
    let mut accounts: Vec<MinecraftProfile> = serde_json::from_str(&content).unwrap_or_default();

    let mut needs_migration = false;
    for account in accounts.iter_mut() {
        // One-time migration: If legacy tokens are still present inside accounts.json, move them to credentials.enc
        if !account.is_offline && (!account.access_token.is_empty() && account.access_token != "offline" && account.access_token != "0" || account.refresh_token.is_some()) {
            let access = credentials::decrypt_credential(&account.access_token).unwrap_or_else(|_| account.access_token.clone());
            let refresh = account.refresh_token.as_ref().map(|rt| {
                credentials::decrypt_credential(rt).unwrap_or_else(|_| rt.clone())
            });

            let creds = credentials::AccountCredentials {
                access_token: access,
                refresh_token: refresh,
            };
            let _ = credentials::save_account_credentials(&account.id, &creds);
            needs_migration = true;
        }

        // Hydrate in-memory profile from the secure credentials vault
        if !account.is_offline {
            if let Ok(Some(creds)) = credentials::get_account_credentials(&account.id) {
                account.access_token = creds.access_token;
                account.refresh_token = creds.refresh_token;
            }
        }
    }

    // Rewrite accounts.json with clean metadata only (stripping legacy tokens)
    if needs_migration {
        let _ = save_accounts(&accounts);
        tracing::info!("Migrated accounts.json: moved authentication tokens to secure vault credentials.enc");
    }

    accounts
}

fn save_accounts(accounts: &[MinecraftProfile]) -> Result<(), String> {
    let data_dir = paths::data_dir();
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    // Serializing MinecraftProfile directly skips access_token and refresh_token
    // entirely via #[serde(skip_serializing)], keeping accounts.json clean of all token keys.
    let json = serde_json::to_string_pretty(accounts).map_err(|e| e.to_string())?;
    let accounts_path = data_dir.join("accounts.json");
    credentials::atomic_write(&accounts_path, json.as_bytes())?;
    Ok(())
}

/// Add a new account or update an existing one (by ID). Sets it as active.
fn add_or_update_account(mut profile: MinecraftProfile) -> Result<(), String> {
    // If online account, persist credentials to the dedicated vault
    if !profile.is_offline && (!profile.access_token.is_empty() || profile.refresh_token.is_some()) {
        let creds = credentials::AccountCredentials {
            access_token: profile.access_token.clone(),
            refresh_token: profile.refresh_token.clone(),
        };
        credentials::save_account_credentials(&profile.id, &creds)?;
    }

    let mut accounts = load_accounts();

    // Deactivate all others
    for a in accounts.iter_mut() {
        a.active = false;
    }

    // Update existing or add new
    profile.active = true;
    if let Some(existing) = accounts.iter_mut().find(|a| a.id == profile.id) {
        *existing = profile;
    } else {
        accounts.push(profile);
    }

    save_accounts(&accounts)
}

/// Generate offline UUID the same way Minecraft does
fn generate_offline_uuid(username: &str) -> String {
    use sha1::Digest;
    let input = format!("OfflinePlayer:{}", username);
    let mut hasher = sha1::Sha1::new();
    hasher.update(input.as_bytes());
    let hash = hasher.finalize();

    let mut bytes = [0u8; 16];
    bytes.copy_from_slice(&hash[..16]);
    bytes[6] = (bytes[6] & 0x0f) | 0x30;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    format!(
        "{:08x}-{:04x}-{:04x}-{:04x}-{:012x}",
        u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]),
        u16::from_be_bytes([bytes[4], bytes[5]]),
        u16::from_be_bytes([bytes[6], bytes[7]]),
        u16::from_be_bytes([bytes[8], bytes[9]]),
        u64::from_be_bytes([0, 0, bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]])
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_offline_uuid() {
        let u1 = generate_offline_uuid("TestPlayer");
        let u2 = generate_offline_uuid("TestPlayer");
        let u3 = generate_offline_uuid("OtherPlayer");
        assert_eq!(u1, u2);
        assert_ne!(u1, u3);
        assert_eq!(u1.len(), 36);
        assert_eq!(&u1[14..15], "3"); // UUID version 3
    }

    #[test]
    fn test_metadata_serialization_scrubs_tokens() {
        let profile = MinecraftProfile {
            id: "test-uuid-1".to_string(),
            name: "TestUser".to_string(),
            access_token: "super_secret_mc_token".to_string(),
            refresh_token: Some("super_secret_ms_refresh".to_string()),
            expires_at: 123456789,
            is_offline: false,
            skin_path: None,
            active: true,
        };

        let accounts = vec![profile];
        let json = serde_json::to_string(&accounts).unwrap();
        assert!(!json.contains("super_secret_mc_token"));
        assert!(!json.contains("super_secret_ms_refresh"));
        assert!(!json.contains("access_token"));
        assert!(!json.contains("refresh_token"));
        assert!(json.contains("TestUser"));
    }
}
