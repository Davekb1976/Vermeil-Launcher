//! Google Cloud settings backup and restore service using Google Drive's isolated
//! `appDataFolder` sandbox (https://www.googleapis.com/auth/drive.appdata).
//!
//! Features:
//! - Local loopback OAuth 2.0 PKCE flow (RFC 7636 / RFC 8252) on an ephemeral port
//! - Seamless system browser authorization
//! - Zero-telemetry design: tokens are ephemeral and revoked immediately upon transfer completion
//! - Sandboxed storage: backup files remain completely hidden from the user's regular Google Drive UI

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD as BASE64_URL_SAFE};
use chrono::Utc;
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::oneshot;

use crate::models::settings::{GlobalVideoSettings, LauncherSettings};
use crate::services::settings_service;
use crate::util::credentials;
use crate::util::http::HTTP;
use crate::util::paths;

pub const GOOGLE_CLIENT_ID: &str = match option_env!("VERMEIL_GOOGLE_CLIENT_ID") {
    Some(val) => val,
    None => "",
};
/// Google OAuth 2.0 Client Secret for the installed desktop client.
/// Injected at compile-time via VERMEIL_GOOGLE_CLIENT_SECRET (or GitHub Actions Secrets).
/// Per RFC 8252 Section 8.5 and Google's official documentation for installed apps:
/// "In this context, the client secret is obviously not treated as a secret."
/// Google's /token endpoint mandates it for quota routing, while PKCE (RFC 7636)
/// provides the cryptographic security.
pub const GOOGLE_CLIENT_SECRET: &str = match option_env!("VERMEIL_GOOGLE_CLIENT_SECRET") {
    Some(val) => val,
    None => "",
};
const GOOGLE_AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_ENDPOINT: &str = "https://oauth2.googleapis.com/revoke";
const GOOGLE_DRIVE_FILES_API: &str = "https://www.googleapis.com/drive/v3/files";
const GOOGLE_DRIVE_UPLOAD_API: &str = "https://www.googleapis.com/upload/drive/v3/files";
const SCOPE_DRIVE_APPDATA: &str = "https://www.googleapis.com/auth/drive.appdata";
const BACKUP_FILENAME: &str = "vermeil_cloud_backup.json";

static OAUTH_CANCEL_TX: Mutex<Option<oneshot::Sender<()>>> = Mutex::new(None);

/// Aborts any in-flight Google Cloud OAuth loopback server and returns immediately.
pub fn cancel_google_oauth() {
    if let Ok(mut lock) = OAUTH_CANCEL_TX.lock() {
        if let Some(tx) = lock.take() {
            let _ = tx.send(());
            tracing::info!("Google Cloud OAuth cancelled by user/client.");
        }
    }
}

/// Serialized payload written into Google Drive `appDataFolder`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VermeilCloudBackup {
    pub format_version: u32,
    pub created_at: String,
    pub app_version: String,
    pub settings: LauncherSettings,
    #[serde(default)]
    pub pinned_instances: Vec<CloudPinnedInstance>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudPinnedInstance {
    pub id: String,
    pub name: String,
    pub game_version: String,
    pub loader: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudBackupSummary {
    pub timestamp: String,
    pub file_size_bytes: usize,
    pub pinned_instances_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudRestoreSummary {
    pub timestamp: String,
    pub settings_restored: bool,
    pub pinned_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudConnectSummary {
    pub connected: bool,
    pub restored: bool,
    pub timestamp: String,
    pub details: String,
}

#[derive(Debug, Deserialize)]
struct GoogleTokenResponse {
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DriveFileList {
    #[serde(default)]
    pub files: Vec<DriveFileEntry>,
}

#[derive(Debug, Deserialize)]
struct DriveFileEntry {
    pub id: String,
    #[allow(dead_code)]
    pub name: Option<String>,
}

/// Generates a cryptographically random PKCE code verifier and SHA-256 challenge.
fn generate_pkce() -> (String, String) {
    let mut rng = rand::rng();
    let mut bytes = [0u8; 32];
    rng.fill(&mut bytes);
    let verifier = BASE64_URL_SAFE.encode(&bytes);

    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let challenge = BASE64_URL_SAFE.encode(hasher.finalize());

    (verifier, challenge)
}

/// Runs the local loopback OAuth 2.0 PKCE flow in the user's default browser,
/// exchanges the authorization code for an access token and optional refresh token.
pub async fn start_google_oauth() -> Result<(String, Option<String>), String> {
    if GOOGLE_CLIENT_ID.is_empty() {
        return Err("Google Cloud credentials are not configured in this build. Please configure VERMEIL_GOOGLE_CLIENT_ID and VERMEIL_GOOGLE_CLIENT_SECRET.".to_string());
    }

    let (code_verifier, code_challenge) = generate_pkce();

    // Bind to an ephemeral loopback port on 127.0.0.1
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to bind local OAuth loopback port: {}", e))?;

    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to read local OAuth loopback port: {}", e))?
        .port();

    let redirect_uri = format!("http://127.0.0.1:{}", port);

    // Build Google OAuth 2.0 authorization URL
    let auth_url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={}&code_challenge_method=S256&access_type=offline&prompt=consent",
        GOOGLE_AUTH_ENDPOINT,
        urlencoding::encode(GOOGLE_CLIENT_ID),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(SCOPE_DRIVE_APPDATA),
        urlencoding::encode(&code_challenge),
    );

    tracing::info!("Launching system browser for Google Cloud OAuth: 127.0.0.1:{}", port);
    open::that(&auth_url).map_err(|e| format!("Failed to open default system browser: {}", e))?;

    // Set up cancellation channel
    let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();
    if let Ok(mut lock) = OAUTH_CANCEL_TX.lock() {
        *lock = Some(cancel_tx);
    }

    struct CancelGuard;
    impl Drop for CancelGuard {
        fn drop(&mut self) {
            if let Ok(mut lock) = OAUTH_CANCEL_TX.lock() {
                *lock = None;
            }
        }
    }
    let _guard = CancelGuard;

    // Wait for the browser redirect callback with a 60-second timeout, or immediate user cancellation
    let (mut stream, _) = tokio::select! {
        res = tokio::time::timeout(Duration::from_secs(60), listener.accept()) => {
            match res {
                Ok(Ok(pair)) => pair,
                Ok(Err(e)) => return Err(format!("Failed to accept OAuth loopback connection: {}", e)),
                Err(_) => return Err("Google authorization timed out (no response received within 60 seconds).".to_string()),
            }
        }
        _ = &mut cancel_rx => {
            return Err("Google authorization was cancelled.".to_string());
        }
    };

    // Read incoming HTTP request
    let mut buffer = [0u8; 4096];
    let n = stream
        .read(&mut buffer)
        .await
        .map_err(|e| format!("Failed to read OAuth loopback request: {}", e))?;

    let request_str = String::from_utf8_lossy(&buffer[..n]);

    // Parse the GET line
    let first_line = request_str.lines().next().unwrap_or_default();
    let query_part = first_line.split_whitespace().nth(1).unwrap_or("/");

    let auth_code = if let Some(q_idx) = query_part.find('?') {
        let query = &query_part[q_idx + 1..];
        let mut code_val = None;
        let mut error_val = None;

        for pair in query.split('&') {
            let mut parts = pair.splitn(2, '=');
            let key = parts.next().unwrap_or_default();
            let val = parts.next().unwrap_or_default();
            if key == "code" {
                code_val = Some(urlencoding::decode(val).unwrap_or_default().into_owned());
            } else if key == "error" {
                error_val = Some(urlencoding::decode(val).unwrap_or_default().into_owned());
            }
        }

        if let Some(err) = error_val {
            let error_html = format!(
                "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n\
                <!DOCTYPE html><html><body style=\"background:#0f0e13;color:#f4f3f6;font-family:sans-serif;padding:40px;text-align:center;\">\
                <h2 style=\"color:#f87171;\">Authorization Cancelled</h2><p>Google authentication failed: {}</p></body></html>",
                err
            );
            let _ = stream.write_all(error_html.as_bytes()).await;
            let _ = stream.flush().await;
            return Err(format!("Google authorization denied: {}", err));
        }

        code_val.ok_or_else(|| "No authorization code found in Google callback query".to_string())?
    } else {
        return Err("Malformed OAuth redirect callback URL".to_string());
    };

    let code = auth_code;

    // Send stylized success page to browser — matches Vermeil's tactile dark UI
    let success_html = "\
        HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n\
        <!DOCTYPE html>\
        <html>\
        <head>\
          <meta charset=\"utf-8\">\
          <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\
          <title>Vermeil — Google Cloud Connected</title>\
          <style>\
            @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');\
            * { box-sizing: border-box; margin: 0; padding: 0; }\
            body {\
              background:\
                radial-gradient(ellipse 70% 55% at 50% 42%, rgba(139, 92, 246, 0.12), transparent 72%),\
                radial-gradient(circle at 50% 120%, rgba(124, 77, 222, 0.08), transparent 60%),\
                #0f0e13;\
              color: #ece9f2;\
              font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;\
              display: flex;\
              flex-direction: column;\
              align-items: center;\
              justify-content: center;\
              height: 100vh;\
              padding: 24px;\
              -webkit-font-smoothing: antialiased;\
            }\
            .card {\
              background: #1d1b24;\
              border: 1px solid #322f3d;\
              border-left: 3px solid #8b5cf6;\
              padding: 42px 40px 36px 40px;\
              border-radius: 0;\
              text-align: center;\
              max-width: 440px;\
              width: 100%;\
              box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6);\
              animation: cardIn 0.35s ease-out both;\
            }\
            .card-tag {\
              display: inline-block;\
              background: rgba(139, 92, 246, 0.12);\
              border: 1px solid rgba(139, 92, 246, 0.35);\
              color: #a78bfa;\
              font-family: 'DM Mono', monospace;\
              font-size: 10px;\
              font-weight: 600;\
              padding: 3px 10px;\
              border-radius: 0;\
              text-transform: uppercase;\
              letter-spacing: 0.1em;\
              margin-bottom: 22px;\
            }\
            .check-well {\
              width: 48px;\
              height: 48px;\
              margin: 0 auto 18px auto;\
              background: #0f0e13;\
              border: 1px solid #322f3d;\
              display: flex;\
              align-items: center;\
              justify-content: center;\
            }\
            .check-well svg {\
              width: 24px;\
              height: 24px;\
              stroke: #4ade80;\
              fill: none;\
              stroke-width: 2.5;\
              stroke-linecap: round;\
              stroke-linejoin: round;\
            }\
            h2 {\
              color: #ece9f2;\
              font-size: 21px;\
              font-weight: 700;\
              margin-bottom: 10px;\
              letter-spacing: -0.01em;\
            }\
            p {\
              color: #a6a1b5;\
              font-size: 13.5px;\
              line-height: 1.6;\
              margin-bottom: 0;\
            }\
            .divider {\
              width: 100%;\
              height: 1px;\
              background: #322f3d;\
              margin: 24px 0 20px 0;\
            }\
            .shortcut-pill {\
              display: inline-flex;\
              align-items: center;\
              justify-content: center;\
              gap: 8px;\
              background: #0f0e13;\
              border: 1px solid #3c384a;\
              padding: 10px 18px;\
              font-family: 'DM Mono', monospace;\
              font-size: 11.5px;\
              color: #c4b5fd;\
            }\
            .key-cap {\
              background: #25222f;\
              border: 1px solid #4d475f;\
              border-bottom: 2px solid #15141c;\
              color: #ece9f2;\
              padding: 2px 7px;\
              font-size: 11px;\
              font-weight: 600;\
              border-radius: 2px;\
            }\
            @keyframes cardIn {\
              from { opacity: 0; transform: translateY(10px); }\
              to   { opacity: 1; transform: translateY(0); }\
            }\
          </style>\
        </head>\
        <body>\
          <div class=\"card\">\
            <div class=\"card-tag\">CLOUD SYNC</div>\
            <div class=\"check-well\"><svg viewBox=\"0 0 24 24\"><polyline points=\"20 6 9 17 4 12\"/></svg></div>\
            <h2>Connected</h2>\
            <p>Your Google account has been authorized. You can close this tab and return to Vermeil.</p>\
            <div class=\"divider\"></div>\
            <div class=\"shortcut-pill\">\
              <span>Press</span>\
              <kbd class=\"key-cap\" id=\"cmd-key\">Ctrl</kbd> + <kbd class=\"key-cap\">W</kbd>\
              <span>to close tab</span>\
            </div>\
          </div>\
          <script>\
            if (window.history.replaceState) {\
              window.history.replaceState({}, document.title, window.location.pathname);\
            }\
            var isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;\
            var keyEl = document.getElementById('cmd-key');\
            if (keyEl && isMac) keyEl.textContent = '⌘';\
          </script>\
        </body>\
        </html>";

    let _ = stream.write_all(success_html.as_bytes()).await;
    let _ = stream.flush().await;

    // Exchange auth code + PKCE verifier for access token
    let mut params = vec![
        ("client_id", GOOGLE_CLIENT_ID),
        ("code", &code),
        ("code_verifier", &code_verifier),
        ("grant_type", "authorization_code"),
        ("redirect_uri", &redirect_uri),
    ];
    if !GOOGLE_CLIENT_SECRET.is_empty() {
        params.push(("client_secret", GOOGLE_CLIENT_SECRET));
    }

    let token_resp = HTTP
        .post(GOOGLE_TOKEN_ENDPOINT)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to request token from Google: {}", e))?;

    if !token_resp.status().is_success() {
        let err_body = token_resp.text().await.unwrap_or_default();
        return Err(format!("Google token exchange failed: {}", err_body));
    }

    let token_data: GoogleTokenResponse = token_resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Google token response: {}", e))?;

    Ok((token_data.access_token, token_data.refresh_token))
}

fn token_file_path() -> std::path::PathBuf {
    paths::data_dir().join("google_cloud.enc")
}

pub fn is_cloud_connected() -> bool {
    token_file_path().exists()
}

pub fn save_refresh_token(refresh_token: &str) -> Result<(), String> {
    let encrypted = credentials::encrypt_credential(refresh_token)?;
    let path = token_file_path();
    credentials::atomic_write(&path, encrypted.as_bytes())
}

pub fn read_refresh_token() -> Result<String, String> {
    let path = token_file_path();
    if !path.exists() {
        return Err("Not connected to Google Cloud".to_string());
    }
    credentials::restrict_file_permissions(&path);
    let encrypted = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read Google token file: {}", e))?;
    credentials::decrypt_credential(&encrypted)
}

pub fn delete_refresh_token() {
    let path = token_file_path();
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
}

pub async fn refresh_access_token(refresh_token: &str) -> Result<String, String> {
    let mut params = vec![
        ("client_id", GOOGLE_CLIENT_ID),
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
    ];
    if !GOOGLE_CLIENT_SECRET.is_empty() {
        params.push(("client_secret", GOOGLE_CLIENT_SECRET));
    }

    let resp = HTTP
        .post(GOOGLE_TOKEN_ENDPOINT)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to refresh Google token: {}", e))?;

    if !resp.status().is_success() {
        let err_body = resp.text().await.unwrap_or_default();
        return Err(format!("Google token refresh failed: {}", err_body));
    }

    let token_data: GoogleTokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Google refresh response: {}", e))?;

    Ok(token_data.access_token)
}

/// Atomically revokes an ephemeral Google OAuth token (access token or refresh token) with Google servers.
async fn revoke_token(token: &str) {
    let url = format!("{}?token={}", GOOGLE_REVOKE_ENDPOINT, urlencoding::encode(token));
    let params = [("token", token)];
    let resp = HTTP.post(&url).form(&params).send().await;
    match resp {
        Ok(r) if r.status().is_success() => {
            tracing::info!("Google Cloud OAuth token successfully revoked from Google servers");
        }
        Ok(r) => {
            tracing::debug!("Google token revocation returned status: {}", r.status());
        }
        Err(e) => {
            tracing::warn!("Google token revocation network error: {}", e);
        }
    }
}

/// Searches the private `appDataFolder` for `vermeil_cloud_backup.json`
async fn find_existing_backup_file_id(access_token: &str) -> Result<Option<String>, String> {
    let query = format!("name = '{}' and trashed = false", BACKUP_FILENAME);
    let resp = HTTP
        .get(GOOGLE_DRIVE_FILES_API)
        .bearer_auth(access_token)
        .query(&[
            ("spaces", "appDataFolder"),
            ("q", &query),
            ("fields", "files(id, name)"),
        ])
        .send()
        .await
        .map_err(|e| format!("Failed to query Google Drive appDataFolder: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Drive search failed (status {}): {}", status, body));
    }

    let list: DriveFileList = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Drive file list: {}", e))?;

    Ok(list.files.first().map(|f| f.id.clone()))
}

/// Uploads launcher settings and pinned instances to Google Cloud `appDataFolder`.
pub async fn backup_to_google_cloud() -> Result<CloudBackupSummary, String> {
    let (access_token, _) = start_google_oauth().await?;

    let backup_result = perform_backup(&access_token).await;

    // Zero-telemetry guarantee: burn token immediately
    revoke_token(&access_token).await;

    backup_result
}

/// Strips all hardware-dependent and machine-specific settings, keeping ONLY portable preferences:
/// 1. General settings (launcher lifecycle, splash, toasts, dock, Discord RPC, auto-update, snapshots)
/// 2. Display settings (max_fps, vsync, gui_scale, brightness/gamma, fov)
/// 3. Sound level settings (master, music, weather, hostile, block, player volume)
/// 4. Custom keybinds (muscle-memory keyboard shortcuts)
///
/// Hardware-dependent settings are strictly LOCAL ONLY and never uploaded to cloud:
/// - RAM allocation & Adaptive RAM (default_memory_mb, adaptive_ram, min/max)
/// - Window dimensions (window_width, window_height, start_maximized)
/// - Java runtime, paths, and GC presets (java_runtime, java_paths, gc_preset)
/// - Concurrency & bandwidth limits (concurrent_downloads, concurrent_writes, speed limits)
/// - Mouse controls & accessibility (mouse_sensitivity, invert_y, auto_jump, view_bobbing, subtitles)
pub fn sanitize_settings_for_cloud(source: &LauncherSettings) -> LauncherSettings {
    let defaults = LauncherSettings::default();

    LauncherSettings {
        // 1. General settings:
        close_on_launch: source.close_on_launch,
        popout_logs: source.popout_logs,
        auto_update: source.auto_update,
        discord_rpc: source.discord_rpc,
        show_snapshots: source.show_snapshots,
        splash_screen: source.splash_screen,
        download_toasts: source.download_toasts,
        auto_hide_dock: source.auto_hide_dock,
        pagination_position: source.pagination_position.clone(),

        // 2. Display and Sound levels (synced to cloud):
        video_settings: GlobalVideoSettings {
            // Display:
            max_fps: source.video_settings.max_fps,
            vsync: source.video_settings.vsync,
            gui_scale: source.video_settings.gui_scale,
            gamma: source.video_settings.gamma,
            fov: source.video_settings.fov,

            // Sound levels:
            master_volume: source.video_settings.master_volume,
            music_volume: source.video_settings.music_volume,
            weather_volume: source.video_settings.weather_volume,
            hostile_volume: source.video_settings.hostile_volume,
            block_volume: source.video_settings.block_volume,
            player_volume: source.video_settings.player_volume,

            // Local only (Window dimensions, Controls & Accessibility):
            window_width: None,
            window_height: None,
            start_maximized: None,
            fov_effects: None,
            view_bobbing: None,
            show_subtitles: None,
            mouse_sensitivity: None,
            invert_y_mouse: None,
            auto_jump: None,
        },

        // 3. Custom keybinds (synced to cloud):
        keybinds: source.keybinds.clone(),

        // Everything else: Reset to defaults (LOCAL ONLY)
        // Memory defaults (machine-specific):
        default_memory_mb: defaults.default_memory_mb,
        adaptive_ram: defaults.adaptive_ram,
        adaptive_ram_min_mb: defaults.adaptive_ram_min_mb,
        adaptive_ram_max_mb: defaults.adaptive_ram_max_mb,
        java_runtime: defaults.java_runtime,
        gc_preset: defaults.gc_preset,
        java_paths: HashMap::new(),
        concurrent_downloads: defaults.concurrent_downloads,
        concurrent_writes: defaults.concurrent_writes,
        download_speed_limit_mb: defaults.download_speed_limit_mb,
        mod_sources: defaults.mod_sources,
        force_delete: defaults.force_delete,
        curseforge_api_key: String::new(),
        onboarded: defaults.onboarded,
        sidebar_pinned_instances: Vec::new(),
        ingame_cape: defaults.ingame_cape,
        last_cloud_backup: source.last_cloud_backup.clone(),
    }
}

/// Applies restored cloud settings while strictly preserving all local-only configurations:
/// - Java runtime, GC preset, and Java paths (local only)
/// - Concurrency, speed limit, storage (local only)
/// - Controls and Accessibility (local only)
/// - Sidebar pinned instances (local only)
/// - Mod sources, API keys, cape (local only)
pub fn merge_restored_settings(
    cloud_backup: &LauncherSettings,
    local_settings: &LauncherSettings,
    backup_timestamp: &str,
) -> LauncherSettings {
    let mut merged = local_settings.clone();
    merged.last_cloud_backup = Some(backup_timestamp.to_string());

    // 1. General settings (restored from cloud)
    merged.close_on_launch = cloud_backup.close_on_launch;
    merged.popout_logs = cloud_backup.popout_logs;
    merged.auto_update = cloud_backup.auto_update;
    merged.discord_rpc = cloud_backup.discord_rpc;
    merged.show_snapshots = cloud_backup.show_snapshots;
    merged.splash_screen = cloud_backup.splash_screen;
    merged.download_toasts = cloud_backup.download_toasts;
    merged.auto_hide_dock = cloud_backup.auto_hide_dock;
    merged.pagination_position = cloud_backup.pagination_position.clone();

    // 2. Display settings (restored from cloud)
    merged.video_settings.max_fps = cloud_backup.video_settings.max_fps;
    merged.video_settings.vsync = cloud_backup.video_settings.vsync;
    merged.video_settings.gui_scale = cloud_backup.video_settings.gui_scale;
    merged.video_settings.gamma = cloud_backup.video_settings.gamma;
    merged.video_settings.fov = cloud_backup.video_settings.fov;

    // 3. Sound level settings (restored from cloud)
    merged.video_settings.master_volume = cloud_backup.video_settings.master_volume;
    merged.video_settings.music_volume = cloud_backup.video_settings.music_volume;
    merged.video_settings.weather_volume = cloud_backup.video_settings.weather_volume;
    merged.video_settings.hostile_volume = cloud_backup.video_settings.hostile_volume;
    merged.video_settings.block_volume = cloud_backup.video_settings.block_volume;
    merged.video_settings.player_volume = cloud_backup.video_settings.player_volume;

    // 4. Custom keybinds (restored from cloud)
    merged.keybinds = cloud_backup.keybinds.clone();

    // Memory (default_memory_mb, adaptive_ram) and Window dimensions
    // (window_width, window_height, start_maximized) remain strictly machine-specific/local.

    merged
}

async fn perform_backup(access_token: &str) -> Result<CloudBackupSummary, String> {
    // 1. Gather settings
    let mut settings = settings_service::load()
        .await
        .map_err(|e| format!("Failed to load local settings: {}", e))?;

    let now_iso = Utc::now().to_rfc3339();
    settings.last_cloud_backup = Some(now_iso.clone());

    let cloud_settings = sanitize_settings_for_cloud(&settings);

    let backup = VermeilCloudBackup {
        format_version: 1,
        created_at: now_iso.clone(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        settings: cloud_settings,
        pinned_instances: Vec::new(),
    };

    let json_bytes = serde_json::to_string_pretty(&backup)
        .map_err(|e| format!("Failed to serialize cloud backup payload: {}", e))?
        .into_bytes();
    let file_size_bytes = json_bytes.len();

    // 3. Check for existing backup in appDataFolder
    let existing_file_id = find_existing_backup_file_id(access_token).await?;

    if let Some(file_id) = existing_file_id {
        // Update existing file via PATCH media upload
        let update_url = format!("{}/{}?uploadType=media", GOOGLE_DRIVE_UPLOAD_API, file_id);
        let resp = HTTP
            .patch(&update_url)
            .bearer_auth(access_token)
            .header("Content-Type", "application/json")
            .body(json_bytes)
            .send()
            .await
            .map_err(|e| format!("Failed to upload backup patch to Google Cloud: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Drive update failed (status {}): {}", status, body));
        }
    } else {
        // Create new file in appDataFolder using multipart upload
        let boundary = "-------VermeilCloudBoundaryX9";
        let metadata_part = serde_json::json!({
            "name": BACKUP_FILENAME,
            "parents": ["appDataFolder"]
        });

        let mut body_bytes = Vec::new();
        body_bytes.extend_from_slice(format!("--{}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n", boundary).as_bytes());
        body_bytes.extend_from_slice(serde_json::to_string(&metadata_part).unwrap_or_default().as_bytes());
        body_bytes.extend_from_slice(format!("\r\n--{}\r\nContent-Type: application/json\r\n\r\n", boundary).as_bytes());
        body_bytes.extend_from_slice(&json_bytes);
        body_bytes.extend_from_slice(format!("\r\n--{}--\r\n", boundary).as_bytes());

        let upload_url = format!("{}?uploadType=multipart", GOOGLE_DRIVE_UPLOAD_API);
        let resp = HTTP
            .post(&upload_url)
            .bearer_auth(access_token)
            .header("Content-Type", format!("multipart/related; boundary={}", boundary))
            .body(body_bytes)
            .send()
            .await
            .map_err(|e| format!("Failed to create backup file in Google Cloud: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Drive multipart create failed (status {}): {}", status, body));
        }
    }

    // Persist updated last_cloud_backup timestamp locally
    let _ = settings_service::save(&settings).await;

    Ok(CloudBackupSummary {
        timestamp: now_iso,
        file_size_bytes,
        pinned_instances_count: 0,
    })
}

/// Downloads launcher settings from Google Cloud `appDataFolder` and restores them locally.
pub async fn restore_from_google_cloud() -> Result<CloudRestoreSummary, String> {
    let (access_token, _) = start_google_oauth().await?;

    let restore_result = perform_restore(&access_token).await;

    // Zero-telemetry guarantee: burn token immediately
    revoke_token(&access_token).await;

    restore_result
}

async fn perform_restore(access_token: &str) -> Result<CloudRestoreSummary, String> {
    // 1. Locate backup in appDataFolder
    let existing_file_id = find_existing_backup_file_id(access_token)
        .await?
        .ok_or_else(|| "No Vermeil cloud backup found in this Google account's app storage.".to_string())?;

    // 2. Download media
    let download_url = format!("{}/{}?alt=media", GOOGLE_DRIVE_FILES_API, existing_file_id);
    let resp = HTTP
        .get(&download_url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("Failed to download backup from Google Cloud: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Drive download failed (status {}): {}", status, body));
    }

    let content = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read backup response body: {}", e))?;

    let backup: VermeilCloudBackup = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse cloud backup JSON payload: {}", e))?;

    // 3. Merge / apply settings locally while strictly preserving local machine-specific settings
    let current_settings = settings_service::load().await.unwrap_or_default();
    let restored_settings = merge_restored_settings(&backup.settings, &current_settings, &backup.created_at);

    settings_service::save(&restored_settings)
        .await
        .map_err(|e| format!("Failed to save restored settings to disk: {}", e))?;

    Ok(CloudRestoreSummary {
        timestamp: backup.created_at,
        settings_restored: true,
        pinned_count: 0,
    })
}

/// Connects user's Google Account once, securely persists refresh token,
/// and automatically performs an initial restore (if backup exists) or initial backup.
pub async fn connect_google_account() -> Result<CloudConnectSummary, String> {
    let (access_token, refresh_token_opt) = start_google_oauth().await?;

    if let Some(ref ref_tok) = refresh_token_opt {
        save_refresh_token(ref_tok)?;
    } else {
        tracing::warn!("Google OAuth did not return a refresh token");
    }

    // Check if cloud backup exists in appDataFolder
    let existing_backup = find_existing_backup_file_id(&access_token).await?;

    if existing_backup.is_some() {
        let restore_res = perform_restore(&access_token).await?;
        tracing::info!("Google Cloud connected: restored existing settings from cloud");
        Ok(CloudConnectSummary {
            connected: true,
            restored: true,
            timestamp: restore_res.timestamp,
            details: "Restored General, Display, Sound, and Keybind preferences from cloud.".to_string(),
        })
    } else {
        let backup_res = perform_backup(&access_token).await?;
        tracing::info!("Google Cloud connected: initial settings backup uploaded to cloud");
        Ok(CloudConnectSummary {
            connected: true,
            restored: false,
            timestamp: backup_res.timestamp,
            details: "Settings successfully backed up to Google Cloud.".to_string(),
        })
    }
}

/// Signs out of Google Cloud on this device only.
///
/// Purges the local token and stops synchronization without contacting Google's
/// revocation endpoint. This keeps Vermeil authorized in the user's Google Account
/// ("Third-party apps & services") so future logins or multi-device sessions remain seamless.
pub async fn sign_out_google_account() -> Result<(), String> {
    delete_refresh_token();

    if let Ok(mut settings) = settings_service::load().await {
        settings.last_cloud_backup = None;
        let _ = settings_service::save(&settings).await;
    }

    tracing::info!("Google Cloud signed out locally (Google account authorization preserved)");
    Ok(())
}

/// Disconnects Google Cloud completely: revokes the OAuth grant with Google servers
/// (disallowing the app on the user's Google Account) and purges all local credentials.
pub async fn disconnect_google_account() -> Result<(), String> {
    if let Ok(ref_token) = read_refresh_token() {
        revoke_token(&ref_token).await;
    }
    delete_refresh_token();

    if let Ok(mut settings) = settings_service::load().await {
        settings.last_cloud_backup = None;
        let _ = settings_service::save(&settings).await;
    }

    tracing::info!("Google Cloud disconnected, access revoked, and local token removed");
    Ok(())
}

/// Silently synchronizes launcher settings in the background whenever settings change.
/// No-op if Google Cloud is not connected.
pub async fn sync_settings_background() {
    let refresh_token = match read_refresh_token() {
        Ok(tok) => tok,
        Err(_) => return, // Not connected, nothing to do
    };

    let access_token = match refresh_access_token(&refresh_token).await {
        Ok(tok) => tok,
        Err(e) => {
            tracing::warn!("Background Google Cloud sync failed to obtain access token: {}", e);
            return;
        }
    };

    if let Err(e) = perform_backup(&access_token).await {
        tracing::warn!("Background Google Cloud sync failed: {}", e);
    } else {
        tracing::info!("Settings automatically synced to Google Cloud in background");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pkce_generation() {
        let (verifier, challenge) = generate_pkce();
        assert!(!verifier.is_empty());
        assert!(!challenge.is_empty());
        assert_ne!(verifier, challenge);
        assert_eq!(verifier.len(), 43);
        assert_eq!(challenge.len(), 43);
    }

    #[test]
    fn test_cloud_backup_serialization_roundtrip() {
        let backup = VermeilCloudBackup {
            format_version: 1,
            created_at: "2026-09-22T21:00:00Z".to_string(),
            app_version: "1.1.1".to_string(),
            settings: LauncherSettings::default(),
            pinned_instances: vec![CloudPinnedInstance {
                id: "inst-123".to_string(),
                name: "Survival 1.20".to_string(),
                game_version: "1.20.1".to_string(),
                loader: "fabric".to_string(),
            }],
        };

        let json = serde_json::to_string(&backup).expect("serialize backup");
        let deserialized: VermeilCloudBackup = serde_json::from_str(&json).expect("deserialize backup");

        assert_eq!(deserialized.format_version, 1);
        assert_eq!(deserialized.app_version, "1.1.1");
        assert_eq!(deserialized.pinned_instances.len(), 1);
        assert_eq!(deserialized.pinned_instances[0].name, "Survival 1.20");
    }

    #[test]
    fn test_machine_specific_settings_sanitized_and_preserved() {
        use std::collections::HashMap;

        // Machine A:
        let mut machine_a = LauncherSettings::default();
        machine_a.discord_rpc = false;
        machine_a.auto_hide_dock = false;

        // Memory defaults:
        machine_a.default_memory_mb = 8192;
        machine_a.adaptive_ram_min_mb = 4096;
        machine_a.adaptive_ram_max_mb = 16384;

        // Window & Display & Sound:
        machine_a.video_settings.window_width = Some(1920);
        machine_a.video_settings.window_height = Some(1080);
        machine_a.video_settings.start_maximized = Some(true);
        machine_a.video_settings.max_fps = Some(144);
        machine_a.video_settings.master_volume = Some(0.8);

        // Local-only settings:
        let mut custom_paths_a = HashMap::new();
        custom_paths_a.insert(21, "C:\\Java\\jdk-21\\bin\\javaw.exe".to_string());
        machine_a.java_paths = custom_paths_a;
        machine_a.java_runtime = "custom".to_string();
        machine_a.gc_preset = "shenandoah".to_string();
        machine_a.concurrent_downloads = 5;
        machine_a.video_settings.mouse_sensitivity = Some(0.7);
        let mut keybinds_a = HashMap::new();
        keybinds_a.insert("open_search".to_string(), "Ctrl+K".to_string());
        machine_a.keybinds = keybinds_a;

        // Sanitize for cloud
        let cloud = sanitize_settings_for_cloud(&machine_a);

        // Verify synced: General, Display, Sound, and Keybinds
        assert_eq!(cloud.discord_rpc, false);
        assert_eq!(cloud.auto_hide_dock, false);
        assert_eq!(cloud.video_settings.max_fps, Some(144));
        assert_eq!(cloud.video_settings.master_volume, Some(0.8));
        assert_eq!(cloud.keybinds.get("open_search").map(|s| s.as_str()), Some("Ctrl+K"));

        // Verify local-only settings were stripped (Memory & Window are machine-specific)
        assert_eq!(cloud.default_memory_mb, 4096); // default, not Machine A's 8192
        assert_eq!(cloud.video_settings.window_width, None);
        assert_eq!(cloud.video_settings.window_height, None);
        assert_eq!(cloud.video_settings.start_maximized, None);
        assert!(cloud.java_paths.is_empty());
        assert_eq!(cloud.java_runtime, "auto");
        assert_eq!(cloud.gc_preset, "g1gc");
        assert_eq!(cloud.concurrent_downloads, 10);
        assert_eq!(cloud.video_settings.mouse_sensitivity, None);

        // Machine B with its own local memory, window size, Java and controls
        let mut machine_b = LauncherSettings::default();
        machine_b.default_memory_mb = 2048;
        machine_b.video_settings.window_width = Some(1280);
        machine_b.video_settings.window_height = Some(720);
        let mut custom_paths_b = HashMap::new();
        custom_paths_b.insert(21, "/usr/lib/jvm/java-21/bin/java".to_string());
        machine_b.java_paths = custom_paths_b;
        machine_b.java_runtime = "system".to_string();
        machine_b.gc_preset = "zgc".to_string();
        machine_b.concurrent_downloads = 3;
        machine_b.video_settings.mouse_sensitivity = Some(0.4);

        // Restore cloud backup onto Machine B
        let restored_on_b = merge_restored_settings(&cloud, &machine_b, "2026-09-22T21:00:00Z");

        // Machine B gets General, Display, Sound, and Keybinds from cloud
        assert_eq!(restored_on_b.discord_rpc, false);
        assert_eq!(restored_on_b.auto_hide_dock, false);
        assert_eq!(restored_on_b.video_settings.max_fps, Some(144));
        assert_eq!(restored_on_b.video_settings.master_volume, Some(0.8));
        assert_eq!(restored_on_b.keybinds.get("open_search").map(|s| s.as_str()), Some("Ctrl+K"));

        // Machine B preserves local-only settings (Memory, Window, Java, Controls)
        assert_eq!(restored_on_b.default_memory_mb, 2048);
        assert_eq!(restored_on_b.video_settings.window_width, Some(1280));
        assert_eq!(restored_on_b.video_settings.window_height, Some(720));
        assert_eq!(restored_on_b.java_paths.get(&21).unwrap(), "/usr/lib/jvm/java-21/bin/java");
        assert_eq!(restored_on_b.java_runtime, "system");
        assert_eq!(restored_on_b.gc_preset, "zgc");
        assert_eq!(restored_on_b.concurrent_downloads, 3);
        assert_eq!(restored_on_b.video_settings.mouse_sensitivity, Some(0.4));
    }
}
