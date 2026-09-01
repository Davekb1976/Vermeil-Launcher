//! CurseForge API integration.
//!
//! Provides search, version listing, and file resolution for the CurseForge
//! mod platform. All requests go through `https://api.curseforge.com/v1` and
//! require an `x-api-key` header. The key is read from `LauncherSettings`.
//!
//! Results are mapped into the same `ModSearchResult` / `ModHit` shape that
//! the Modrinth service uses so the frontend can render both sources with
//! the same card components.

use crate::util::http::HTTP;
use serde::Deserialize;

const CF_BASE: &str = "https://api.curseforge.com/v1";
const MINECRAFT_GAME_ID: u32 = 432;

/// CurseForge class IDs for Minecraft content types.
fn class_id_for(project_type: &str) -> u32 {
    match project_type {
        "mod" => 6,
        "resourcepack" => 12,
        "shader" => 6552,
        "modpack" => 4471,
        "datapack" => 6945,
        _ => 6,
    }
}

/// Map our loader name to CurseForge's modLoaderType enum.
fn loader_type_id(loader: &str) -> Option<u32> {
    match loader {
        "forge" => Some(1),
        "fabric" => Some(4),
        "quilt" => Some(5),
        "neoforge" => Some(6),
        _ => None,
    }
}

/// Map our shared sort names to CurseForge's `sortField` enum.
///
/// Note that the launcher's sort dropdown is shared with Modrinth, but the
/// two APIs don't have a 1:1 sort vocabulary. Where they differ we pick the
/// closest CurseForge equivalent so the UI behavior stays coherent:
/// - `follows` → `popularity` (CF has no follower count; popularity is the
///   closest "social proof" sort).
/// - `featured` is a CF-only Modrinth doesn't surface; we treat it like
///   relevance.
fn sort_field_id(sort: &str) -> u32 {
    match sort {
        "relevance" | "featured" => 1,
        "popularity" | "follows" => 2,
        "updated" => 3,
        "name" => 4,
        "downloads" => 6,
        "newest" => 11,
        _ => 1,
    }
}

// ─── Response types (CurseForge JSON shape) ─────────────────────────────

#[derive(Debug, Deserialize)]
struct CfSearchResponse {
    data: Vec<CfMod>,
    pagination: CfPagination,
}

#[derive(Debug, Deserialize)]
struct CfPagination {
    index: u32,
    #[serde(rename = "pageSize")]
    page_size: u32,
    #[serde(rename = "totalCount")]
    total_count: u64,
}

#[derive(Debug, Deserialize)]
struct CfMod {
    id: u64,
    name: String,
    slug: String,
    summary: String,
    #[serde(rename = "downloadCount")]
    download_count: u64,
    #[serde(rename = "thumbsUpCount")]
    thumbs_up_count: u32,
    logo: Option<CfLogo>,
    categories: Vec<CfCategory>,
    /// Author list. CurseForge always returns at least one for published
    /// projects. We only display the first one to match Modrinth's
    /// single-author display.
    #[serde(default)]
    authors: Vec<CfAuthor>,
    #[serde(rename = "latestFilesIndexes")]
    latest_files_indexes: Vec<CfFileIndex>,
    /// Fuller per-file list. `gameVersions` mixes MC versions and loader names
    /// (e.g. `["1.8.9","Forge"]`), so it recovers the loader + versions that
    /// the compact `latestFilesIndexes` drops for older files.
    #[serde(rename = "latestFiles", default)]
    latest_files: Vec<CfLatestFile>,
}

#[derive(Debug, Deserialize)]
struct CfLatestFile {
    #[serde(rename = "gameVersions", default)]
    game_versions: Vec<String>,
    #[serde(rename = "displayName", default)]
    display_name: String,
}

#[derive(Debug, Deserialize)]
struct CfAuthor {
    name: String,
}

#[derive(Debug, Deserialize)]
struct CfLogo {
    #[serde(rename = "thumbnailUrl")]
    thumbnail_url: String,
    /// Full-size icon URL. Used as fallback when `thumbnailUrl` is empty
    /// (some CurseForge projects only populate the full `url` field).
    #[serde(default)]
    url: String,
}

#[derive(Debug, Deserialize)]
struct CfCategory {
    slug: String,
}

#[derive(Debug, Deserialize)]
struct CfFileIndex {
    #[serde(rename = "gameVersion")]
    game_version: String,
    #[serde(rename = "fileId")]
    file_id: u64,
    #[serde(rename = "modLoader")]
    mod_loader: Option<u32>,
}

// ─── Public result types (shared with commands layer) ───────────────────

/// A single search hit, mapped to the same shape as Modrinth's `ModHit`.
pub struct CfHit {
    pub project_id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub follows: u32,
    pub categories: Vec<String>,
    pub versions: Vec<String>,
    pub latest_version: Option<String>,
    /// Human-readable latest-file label (CurseForge `displayName`), shown as
    /// the content version on Browse cards. Free from the search response.
    pub version_name: Option<String>,
    /// Primary author display name (first entry in CurseForge's authors array).
    pub author: Option<String>,
}

pub struct CfSearchResult {
    pub hits: Vec<CfHit>,
    pub total_hits: u32,
    pub offset: u32,
    pub limit: u32,
}

// ─── Public API ─────────────────────────────────────────────────────────

/// Search CurseForge for mods/resource packs/shaders/modpacks.
///
/// Maps CurseForge's response into our unified `CfSearchResult` shape.
/// The `api_key` is read from settings by the command layer and passed in
/// so this service stays free of Tauri types.
pub async fn search(
    api_key: &str,
    query: &str,
    loader: &str,
    game_version: &str,
    offset: u32,
    limit: u32,
    sort: &str,
    project_type: &str,
) -> Result<CfSearchResult, String> {
    if api_key.is_empty() {
        return Err("CurseForge API key not configured. Add it in Settings.".to_string());
    }

    let class_id = class_id_for(project_type);
    let sort_field = sort_field_id(sort);

    let mut url = format!(
        "{}/mods/search?gameId={}&classId={}&index={}&pageSize={}&sortField={}&sortOrder=desc",
        CF_BASE, MINECRAFT_GAME_ID, class_id, offset, limit.min(50), sort_field
    );

    if !query.is_empty() {
        url.push_str(&format!("&searchFilter={}", urlencoding::encode(query)));
    }
    if !game_version.is_empty() {
        url.push_str(&format!("&gameVersion={}", urlencoding::encode(game_version)));
    }
    // CurseForge's `modLoaderType` filter applies to mods AND modpacks
    // (both have a primary loader). Resource packs, shaders, and datapacks
    // are loader-agnostic — applying the filter to them returns 0 results.
    if project_type == "mod" || project_type == "modpack" {
        if let Some(loader_id) = loader_type_id(loader) {
            url.push_str(&format!("&modLoaderType={}", loader_id));
        }
    }

    let resp = crate::util::http::send_with_retry(|| HTTP.get(&url).header("x-api-key", api_key))
        .await
        .map_err(|e| format!("CurseForge search failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("CurseForge HTTP {}: {}", status, body.chars().take(200).collect::<String>()));
    }

    let cf: CfSearchResponse = resp
        .json()
        .await
        .map_err(|e| format!("CurseForge parse error: {}", e))?;

    let hits: Vec<CfHit> = cf.data.into_iter().map(|m| {
        // Collect unique game versions from the latest files index
        let mut versions: Vec<String> = m.latest_files_indexes
            .iter()
            .map(|f| f.game_version.clone())
            .collect();

        let latest_version = m.latest_files_indexes
            .first()
            .map(|f| f.file_id.to_string());

        // Latest file's human label (e.g. "sodium-fabric-0.5.8") for the
        // Browse card's content-version tag. Free from the search response.
        let version_name = m.latest_files
            .first()
            .map(|f| f.display_name.clone())
            .filter(|s| !s.is_empty());

        // Build categories list. Start with CF's category slugs, then inject
        // loader names derived from the modLoader field in latestFilesIndexes.
        // The frontend uses these to render loader badges on cards.
        let mut categories: Vec<String> = m.categories.into_iter().map(|c| c.slug).collect();
        for fi in &m.latest_files_indexes {
            if let Some(loader_id) = fi.mod_loader {
                let name = match loader_id {
                    1 => "forge",
                    4 => "fabric",
                    5 => "quilt",
                    6 => "neoforge",
                    _ => continue,
                };
                if !categories.contains(&name.to_string()) {
                    categories.push(name.to_string());
                }
            }
        }

        // The compact latestFilesIndexes omits the loader on older files and
        // doesn't always list every supported MC version. The fuller
        // latestFiles[].gameVersions mixes MC versions and loader names
        // (e.g. ["1.8.9","Forge"]); harvest both so old mods like BetterFps
        // get a loader badge and a complete version range.
        for f in &m.latest_files {
            for gv in &f.game_versions {
                let loader = match gv.to_lowercase().as_str() {
                    "forge" => Some("forge"),
                    "fabric" => Some("fabric"),
                    "quilt" => Some("quilt"),
                    "neoforge" => Some("neoforge"),
                    _ => None,
                };
                match loader {
                    Some(name) => {
                        if !categories.contains(&name.to_string()) {
                            categories.push(name.to_string());
                        }
                    }
                    // MC version strings start with a digit (e.g. "1.8.9").
                    None if gv.chars().next().is_some_and(|c| c.is_ascii_digit()) => {
                        versions.push(gv.clone());
                    }
                    None => {}
                }
            }
        }

        versions.sort();
        versions.dedup();

        CfHit {
            project_id: m.id.to_string(),
            slug: m.slug,
            title: m.name,
            description: m.summary,
            icon_url: m.logo.map(|l| {
                if l.thumbnail_url.is_empty() { l.url } else { l.thumbnail_url }
            }).filter(|u| !u.is_empty()),
            downloads: m.download_count,
            follows: m.thumbs_up_count,
            categories,
            versions,
            latest_version,
            version_name,
            author: m.authors.into_iter().next().map(|a| a.name),
        }
    }).collect();

    Ok(CfSearchResult {
        total_hits: cf.pagination.total_count as u32,
        offset: cf.pagination.index,
        limit: cf.pagination.page_size,
        hits,
    })
}

/// Get file versions for a specific CurseForge project.
pub async fn get_project_files(
    api_key: &str,
    mod_id: &str,
    game_version: &str,
    loader: &str,
) -> Result<Vec<CfFileInfo>, String> {
    if api_key.is_empty() {
        return Err("CurseForge API key not configured.".to_string());
    }

    let mut url = format!("{}/mods/{}/files?pageSize=50", CF_BASE, mod_id);
    if !game_version.is_empty() {
        url.push_str(&format!("&gameVersion={}", urlencoding::encode(game_version)));
    }
    match loader_type_id(loader) {
        Some(loader_id) => url.push_str(&format!("&modLoaderType={}", loader_id)),
        // An empty loader is intentional (loader-agnostic content). A non-empty
        // one we can't map means the server-side filter silently doesn't apply,
        // so every loader's files come back — the caller MUST validate the
        // chosen file's own loader list rather than trusting this response.
        None if !loader.is_empty() => tracing::warn!(
            "No CurseForge modLoaderType for loader '{}'; file list is unfiltered by loader",
            loader
        ),
        None => {}
    }

    let resp = HTTP
        .get(&url)
        .header("x-api-key", api_key)
        .send()
        .await
        .map_err(|e| format!("CurseForge files fetch failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("CurseForge HTTP {}: {}", status, body.chars().take(200).collect::<String>()));
    }

    let wrapper: CfFilesResponse = resp
        .json()
        .await
        .map_err(|e| format!("CurseForge files parse: {}", e))?;

    Ok(wrapper.data.into_iter().map(|f| {
        // Reconstruct the CDN URL when CurseForge withholds it (author opted
        // out of third-party API distribution). The file still lives on the
        // CDN at a path derived from its numeric ID. Same workaround used by
        // every third-party launcher; prevents mods silently failing to install.
        let download_url = f.download_url.clone().or_else(|| {
            Some(format!(
                "https://edge.forgecdn.net/files/{}/{}/{}",
                f.id / 1000,
                f.id % 1000,
                f.file_name.replace(' ', "%20")
            ))
        });
        let (mc_versions, loaders) = classify_game_versions(f.game_versions);
        let mut required = Vec::new();
        let mut incompatible = Vec::new();
        for d in f.dependencies {
            match d.relation_type {
                3 => required.push(d.mod_id.to_string()),
                5 => incompatible.push(d.mod_id.to_string()),
                // Embedded / Optional / Tool / Include impose no obligation.
                _ => {}
            }
        }
        CfFileInfo {
            file_id: f.id,
            file_name: f.file_name,
            display_name: f.display_name,
            download_url,
            file_length: f.file_length,
            hashes: f.hashes.into_iter()
                .filter(|h| h.algo == 1) // SHA-1
                .map(|h| h.value)
                .collect(),
            dependencies: required,
            incompatible,
            release_type: f.release_type,
            file_date: f.file_date,
            game_versions: mc_versions,
            loaders,
            is_available: f.is_available,
        }
    }).collect())
}

// ─── File response types ────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct CfFilesResponse {
    data: Vec<CfFile>,
}

#[derive(Debug, Deserialize)]
struct CfFile {
    id: u64,
    #[serde(rename = "fileName")]
    file_name: String,
    #[serde(rename = "displayName", default)]
    display_name: String,
    #[serde(rename = "downloadUrl")]
    download_url: Option<String>,
    #[serde(rename = "fileLength")]
    file_length: u64,
    hashes: Vec<CfHash>,
    dependencies: Vec<CfDependency>,
    /// 1 = Release, 2 = Beta, 3 = Alpha. Drives the stable-first preference
    /// when choosing a file; without it an alpha upload wins purely by being
    /// newest.
    #[serde(rename = "releaseType", default)]
    release_type: u32,
    /// ISO-8601 upload timestamp. CurseForge does publish this per file — the
    /// launcher previously didn't read it, which is why update detection fell
    /// back to comparing numeric file ids.
    #[serde(rename = "fileDate", default)]
    file_date: Option<String>,
    /// Mixed bag: Minecraft version strings AND loader names (and sometimes
    /// "Client"/"Server") share this one array. `classify_game_versions` splits
    /// them so a file can actually be validated client-side.
    #[serde(rename = "gameVersions", default)]
    game_versions: Vec<String>,
    /// False when CurseForge is not currently serving the file. Picking one of
    /// these yields a download that can't succeed.
    #[serde(rename = "isAvailable", default = "default_true")]
    is_available: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize)]
struct CfHash {
    value: String,
    algo: u32, // 1 = SHA-1, 2 = MD5
}

#[derive(Debug, Deserialize)]
struct CfDependency {
    #[serde(rename = "modId")]
    mod_id: u64,
    /// 1 = EmbeddedLibrary, 2 = Optional, 3 = Required, 4 = Tool,
    /// 5 = Incompatible, 6 = Include. Only 3 and 5 carry obligations for us.
    #[serde(rename = "relationType")]
    relation_type: u32,
}

/// Loader names CurseForge mixes into a file's `gameVersions` array. Compared
/// case-insensitively because the casing there ("Fabric", "NeoForge") differs
/// from the launcher's internal lowercase loader ids.
const CF_LOADER_NAMES: [&str; 5] = ["forge", "fabric", "quilt", "neoforge", "liteloader"];

/// Split a file's `gameVersions` into `(minecraft_versions, loaders)`.
///
/// CurseForge has no separate loader field on a file — MC versions, loader
/// names, and occasionally environment tags all share one string array. An
/// entry starting with a digit is a Minecraft version; one matching a known
/// loader name is a loader; anything else is ignored. This deliberately avoids
/// `sortableGameVersions[].gameVersionTypeId`, whose numeric values aren't
/// documented per game and would be a guess.
fn classify_game_versions(raw: Vec<String>) -> (Vec<String>, Vec<String>) {
    let mut mc = Vec::new();
    let mut loaders = Vec::new();
    for entry in raw {
        let trimmed = entry.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.starts_with(|c: char| c.is_ascii_digit()) {
            mc.push(trimmed.to_string());
        } else {
            let lower = trimmed.to_ascii_lowercase();
            if CF_LOADER_NAMES.contains(&lower.as_str()) {
                loaders.push(lower);
            }
        }
    }
    (mc, loaders)
}

/// Processed file info ready for the install flow.
pub struct CfFileInfo {
    pub file_id: u64,
    pub file_name: String,
    /// CurseForge's human-readable file label (e.g. "sodium-fabric-0.5.8").
    /// Used as the content version on Installed cards. Empty when absent.
    pub display_name: String,
    pub download_url: Option<String>,
    pub file_length: u64,
    pub hashes: Vec<String>, // SHA-1 only
    pub dependencies: Vec<String>, // mod IDs of required deps
    /// mod IDs this file declares it cannot run alongside (relationType 5).
    pub incompatible: Vec<String>,
    /// 1 = Release, 2 = Beta, 3 = Alpha.
    pub release_type: u32,
    /// ISO-8601 upload timestamp, when CurseForge supplied one.
    pub file_date: Option<String>,
    /// Minecraft versions this file declares, split out of `gameVersions`.
    pub game_versions: Vec<String>,
    /// Loaders this file declares, lowercased. Empty for loader-agnostic
    /// content and for older uploads that never tagged one.
    pub loaders: Vec<String>,
    /// Whether CurseForge is currently serving this file.
    pub is_available: bool,
}

// ─── Modpack install from project ID ────────────────────────────────────

/// Fetch the download URL for the latest (or specified) file of a CurseForge
/// modpack project. Returns `(download_url, file_name)`.
pub async fn get_modpack_file_url(
    api_key: &str,
    project_id: &str,
    file_id: Option<&str>,
) -> Result<(String, String), String> {
    if api_key.is_empty() {
        return Err("CurseForge API key not configured. Add it in Settings.".to_string());
    }

    let url = if let Some(fid) = file_id {
        format!("{}/mods/{}/files/{}", CF_BASE, project_id, fid)
    } else {
        // Get the main file for the modpack (latest)
        format!("{}/mods/{}/files?pageSize=1", CF_BASE, project_id)
    };

    let resp = HTTP
        .get(&url)
        .header("x-api-key", api_key)
        .send()
        .await
        .map_err(|e| format!("CurseForge file fetch failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!(
            "CurseForge HTTP {} when fetching modpack file: {}",
            status,
            body.chars().take(200).collect::<String>()
        ));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse CurseForge file response: {}", e))?;

    // Single file endpoint returns { data: { ... } }
    // List endpoint returns { data: [ ... ] }
    let file_data = if file_id.is_some() {
        body.get("data").cloned()
    } else {
        body.get("data")
            .and_then(|d| d.as_array())
            .and_then(|arr| arr.first())
            .cloned()
    };

    let file_data = file_data.ok_or("No file data returned from CurseForge")?;

    let download_url = file_data
        .get("downloadUrl")
        .and_then(|u| u.as_str())
        .ok_or("CurseForge file has no download URL (mod author may have disabled third-party downloads)")?
        .to_string();

    let file_name = file_data
        .get("fileName")
        .and_then(|n| n.as_str())
        .unwrap_or("modpack.zip")
        .to_string();

    Ok((download_url, file_name))
}

#[cfg(test)]
mod tests {
    use super::classify_game_versions;

    /// CurseForge puts Minecraft versions, loader names, and environment tags in
    /// one array. Everything downstream that validates a file depends on this
    /// split being right — mistaking "Fabric" for a game version, or "1.21.1"
    /// for a loader, breaks compatibility checking in opposite directions.
    #[test]
    fn splits_minecraft_versions_from_loader_names() {
        let (mc, loaders) = classify_game_versions(vec![
            "1.21.1".to_string(),
            "Fabric".to_string(),
            "1.21".to_string(),
            "NeoForge".to_string(),
            // Environment tags belong to neither and must be dropped.
            "Client".to_string(),
            "Server".to_string(),
        ]);
        assert_eq!(mc, vec!["1.21.1", "1.21"]);
        assert_eq!(loaders, vec!["fabric", "neoforge"]);
    }

    /// Loader names are lowercased so they compare against the launcher's
    /// internal loader ids without per-call case handling.
    #[test]
    fn loader_names_are_normalized_to_lowercase() {
        let (_, loaders) = classify_game_versions(vec!["FORGE".to_string(), "Quilt".to_string()]);
        assert_eq!(loaders, vec!["forge", "quilt"]);
    }

    #[test]
    fn blank_entries_are_ignored() {
        let (mc, loaders) = classify_game_versions(vec!["".to_string(), "   ".to_string()]);
        assert!(mc.is_empty());
        assert!(loaders.is_empty());
    }
}
