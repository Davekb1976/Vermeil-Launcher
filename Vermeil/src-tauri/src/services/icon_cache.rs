//! Icon cache.
//!
//! Mods, resource packs, shaders, and modpacks each carry a remote `icon_url`
//! pointing at a CDN-hosted PNG. We don't want to re-fetch those every time a
//! card is rendered, and we don't want the UI to break offline. So whenever we
//! install something, we fetch the icon once and write it to a content-
//! addressed file under `%LOCALAPPDATA%\Vermeil\icons\`.
//!
//! The frontend then uses Tauri's `asset://` protocol to read the cached file
//! directly off disk — no network hit, no CORS, works offline.
//!
//! Cache key: SHA-1 of the lowercased URL. Same URL → same file → dedup
//! across instances. (Modrinth's icon CDN serves the same hashed URL for
//! the same icon across all consumers, so this dedups well in practice.)

use sha1::{Digest, Sha1};
use std::path::PathBuf;
use tokio::io::AsyncWriteExt;

use crate::util::http::HTTP;
use crate::util::paths;

/// Try to cache an icon from `url`. Returns the absolute path to the cached
/// file as a string on success, `None` on any failure.
///
/// Failures are deliberately non-fatal: a missing icon should never block an
/// install or update flow. The caller falls back to the remote URL (or to a
/// generic placeholder), and we just retry on the next install.
pub async fn cache_remote_icon(url: &str) -> Option<String> {
    if url.trim().is_empty() {
        return None;
    }

    let icons_dir = paths::icons_cache_dir();
    if let Err(e) = tokio::fs::create_dir_all(&icons_dir).await {
        tracing::debug!("icon cache: create_dir_all failed for {:?}: {}", icons_dir, e);
        return None;
    }

    // Hash the URL to get a stable file name. Lowercase first so trivial casing
    // differences don't blow up the cache.
    let mut hasher = Sha1::new();
    hasher.update(url.trim().to_lowercase().as_bytes());
    let hash = hex_lower(&hasher.finalize());

    // Pick the file extension from the URL path. We default to `.png` because
    // every icon source we currently talk to (Modrinth, CurseForge) serves PNGs
    // and Tauri's webview happily renders unknown extensions as raw PNG anyway.
    let ext = guess_extension(url).unwrap_or_else(|| "png".to_string());
    let path: PathBuf = icons_dir.join(format!("{}.{}", hash, ext));

    if path.exists() {
        return Some(clean_path_string(&path));
    }

    // Not cached yet — go fetch.
    let resp = match HTTP.get(url).send().await {
        Ok(r) if r.status().is_success() => r,
        Ok(r) => {
            tracing::debug!("icon cache: {} returned status {}", url, r.status());
            return None;
        }
        Err(e) => {
            tracing::debug!("icon cache: GET {} failed: {}", url, e);
            return None;
        }
    };

    let bytes = match resp.bytes().await {
        Ok(b) => b,
        Err(e) => {
            tracing::debug!("icon cache: read body for {} failed: {}", url, e);
            return None;
        }
    };

    // Write to a `.part` file first and rename so a partial download never
    // looks cached.
    let part = path.with_extension(format!("{}.part", ext));
    let mut file = match tokio::fs::File::create(&part).await {
        Ok(f) => f,
        Err(e) => {
            tracing::debug!("icon cache: create {:?}: {}", part, e);
            return None;
        }
    };
    if let Err(e) = file.write_all(&bytes).await {
        tracing::debug!("icon cache: write {:?}: {}", part, e);
        return None;
    }
    drop(file);

    if let Err(e) = tokio::fs::rename(&part, &path).await {
        if path.exists() {
            let _ = tokio::fs::remove_file(&part).await;
            return Some(clean_path_string(&path));
        }
        tracing::debug!("icon cache: rename {:?} -> {:?}: {}", part, path, e);
        return None;
    }

    Some(clean_path_string(&path))
}

pub fn clean_path_string(path: &std::path::Path) -> String {
    let s = path.to_string_lossy().to_string();
    #[cfg(windows)]
    {
        if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
            return format!(r"\\{}", rest);
        }
        if let Some(rest) = s.strip_prefix(r"\\?\") {
            return rest.to_string();
        }
    }
    s
}

fn guess_extension(url: &str) -> Option<String> {
    // Strip query string before sniffing.
    let url = url.split('?').next().unwrap_or(url);
    let last = url.rsplit('/').next()?;
    let dot = last.rfind('.')?;
    let ext = &last[dot + 1..];
    // Sanity: only accept short alphanumeric extensions. Anything weirder and
    // we fall back to PNG.
    if ext.is_empty() || ext.len() > 5 || !ext.chars().all(|c| c.is_ascii_alphanumeric()) {
        return None;
    }
    Some(ext.to_lowercase())
}

fn hex_lower(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push_str(&format!("{:02x}", b));
    }
    out
}

/// Cache raw icon bytes directly to disk and return as a clean file path.
/// Used for embedded icons extracted from modpack archives (.mrpack, .zip).
pub async fn cache_icon_bytes(bytes: &[u8], ext: &str) -> Option<String> {
    if bytes.is_empty() {
        return None;
    }

    let icons_dir = paths::icons_cache_dir();
    if let Err(e) = tokio::fs::create_dir_all(&icons_dir).await {
        tracing::debug!("icon cache: create_dir_all failed for {:?}: {}", icons_dir, e);
        return None;
    }

    let mut hasher = Sha1::new();
    hasher.update(bytes);
    let hash = hex_lower(&hasher.finalize());

    let clean_ext = if ext.is_empty() { "png" } else { ext.trim_start_matches('.') };
    let path: PathBuf = icons_dir.join(format!("{}.{}", hash, clean_ext));

    if !path.exists() {
        if let Err(e) = tokio::fs::write(&path, bytes).await {
            tracing::debug!("icon cache: write {:?} failed: {}", path, e);
            return None;
        }
    }

    Some(clean_path_string(&path))
}

