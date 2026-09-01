use crate::services::modrinth;
use serde::Serialize;

#[derive(Serialize)]
pub struct ModSearchResult {
    pub hits: Vec<ModHit>,
    pub total_hits: u32,
    pub offset: u32,
    pub limit: u32,
}

#[derive(Serialize)]
pub struct ModHit {
    pub project_id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub follows: u32,
    pub client_side: Option<String>,
    pub server_side: Option<String>,
    pub categories: Vec<String>,
    /// Game versions this project supports (Modrinth's `versions[]` field).
    /// Surfaced so the frontend can display "1.20.1 – 1.21.4" badges on cards.
    pub versions: Vec<String>,
    pub latest_version: Option<String>,
    /// Human-readable latest content version (Modrinth `version_number` /
    /// CurseForge file display name). Shown as a tag on Browse cards. `None`
    /// when the source doesn't expose it or the lookup failed.
    pub version_name: Option<String>,
    /// Primary author display name. Modrinth: search hit's `author`.
    /// CurseForge: first entry of `authors[]`. None when the source doesn't
    /// expose an author (rare).
    pub author: Option<String>,
}

#[tauri::command]
pub async fn search_mods(
    query: String,
    loader: String,
    game_version: String,
    offset: Option<u32>,
    limit: Option<u32>,
    sort: Option<String>,
    project_type: Option<String>,
) -> Result<ModSearchResult, String> {
    let lim = limit.unwrap_or(20);
    let off = offset.unwrap_or(0);
    let sort_by = sort.unwrap_or_else(|| "relevance".to_string());
    let ptype = project_type.unwrap_or_else(|| "mod".to_string());

    let result = modrinth::search_mods(
        &query,
        &loader,
        &game_version,
        off,
        lim,
        &sort_by,
        &ptype,
    )
    .await?;

    Ok(ModSearchResult {
        total_hits: result.total_hits,
        offset: result.offset,
        limit: result.limit,
        hits: result
            .hits
            .into_iter()
            .map(|h| ModHit {
                project_id: h.project_id,
                slug: h.slug,
                title: h.title,
                description: h.description,
                icon_url: h.icon_url,
                downloads: h.downloads,
                follows: h.follows,
                client_side: h.client_side,
                server_side: h.server_side,
                categories: h.categories,
                versions: h.versions,
                latest_version: h.latest_version,
                version_name: h.version_name,
                author: h.author,
            })
            .collect(),
    })
}

#[tauri::command]
pub async fn search_modpacks(
    query: String,
    offset: Option<u32>,
    limit: Option<u32>,
    sort: Option<String>,
    loader: Option<String>,
) -> Result<ModSearchResult, String> {
    let result = modrinth::search_modpacks(
        &query,
        offset.unwrap_or(0),
        limit.unwrap_or(10),
        &sort.unwrap_or_else(|| "relevance".to_string()),
        &loader.unwrap_or_default(),
    ).await?;

    Ok(ModSearchResult {
        total_hits: result.total_hits,
        offset: result.offset,
        limit: result.limit,
        hits: result
            .hits
            .into_iter()
            .map(|h| ModHit {
                project_id: h.project_id,
                slug: h.slug,
                title: h.title,
                description: h.description,
                icon_url: h.icon_url,
                downloads: h.downloads,
                follows: h.follows,
                client_side: h.client_side,
                server_side: h.server_side,
                categories: h.categories,
                versions: h.versions,
                latest_version: h.latest_version,
                version_name: h.version_name,
                author: h.author,
            })
            .collect(),
    })
}

/// Search CurseForge for mods, resource packs, shaders, or modpacks.
/// Returns the same `ModSearchResult` shape as `search_mods` so the
/// frontend can render both sources with the same card components.
#[tauri::command]
pub async fn search_curseforge(
    query: String,
    loader: String,
    game_version: String,
    offset: Option<u32>,
    limit: Option<u32>,
    sort: Option<String>,
    project_type: Option<String>,
) -> Result<ModSearchResult, String> {
    let api_key = resolve_cf_api_key().await?;
    let lim = limit.unwrap_or(20);
    let off = offset.unwrap_or(0);
    let sort_by = sort.unwrap_or_else(|| "relevance".to_string());
    let ptype = project_type.unwrap_or_else(|| "mod".to_string());

    let result = crate::services::curseforge::search(
        &api_key,
        &query,
        &loader,
        &game_version,
        off,
        lim,
        &sort_by,
        &ptype,
    )
    .await?;

    Ok(ModSearchResult {
        total_hits: result.total_hits,
        offset: result.offset,
        limit: result.limit,
        hits: result
            .hits
            .into_iter()
            .map(|h| ModHit {
                project_id: h.project_id,
                slug: h.slug,
                title: h.title,
                description: h.description,
                icon_url: h.icon_url,
                downloads: h.downloads,
                follows: h.follows,
                client_side: None,
                server_side: None,
                categories: h.categories,
                versions: h.versions,
                latest_version: h.latest_version,
                version_name: h.version_name,
                author: h.author,
            })
            .collect(),
    })
}

/// One selectable version of a piece of content, normalized across both
/// sources so the version picker has a single shape to render.
///
/// `compatible` and `recommended` are computed here rather than in the
/// frontend: compatibility is decided by the same functions the installer uses
/// (`mod_install::is_version_compatible` / `cf_mod_install::is_file_compatible`),
/// so the list can never disagree with what an install would accept.
#[derive(Serialize)]
pub struct ContentVersion {
    /// What to pass back to install this exact version: a Modrinth version id,
    /// or a CurseForge file id rendered as a string.
    pub id: String,
    /// Human-readable label — Modrinth `version_number`, CurseForge
    /// `displayName` (falling back to the file name).
    pub name: String,
    /// `"release"` / `"beta"` / `"alpha"`, or `"unknown"` when the source
    /// didn't say.
    pub channel: String,
    pub game_versions: Vec<String>,
    /// Loaders this version declares. Empty for loader-agnostic content and for
    /// older CurseForge uploads that were never tagged.
    pub loaders: Vec<String>,
    pub filename: String,
    /// File size in bytes. 0 when the source didn't report one.
    pub size: u64,
    /// ISO-8601 publish timestamp. Both sources supply this.
    pub date_published: Option<String>,
    /// Whether this version can run on the requesting instance.
    pub compatible: bool,
    /// Marks the version the Install button would pick on its own, so the
    /// picker can label it and the automatic choice isn't a mystery.
    pub recommended: bool,
}

/// Hard cap on returned entries. A long-lived project can have hundreds of
/// versions, and every one becomes a DOM row in the picker.
///
/// ponytail: a flat truncation of the newest N, not paging. Ceiling: a version
/// older than the 100 most recent can't be selected from the UI. Upgrade path
/// is an offset parameter, which only matters if someone actually needs to pin
/// something ancient.
const MAX_VERSIONS: usize = 100;

/// Every version of a Modrinth project, newest first, each labelled with
/// whether it fits the given loader + game version.
///
/// Deliberately fetched unfiltered so the picker can offer a "show all
/// versions" toggle; filtering server-side would make incompatible entries
/// impossible to display at all.
#[tauri::command]
pub async fn get_mod_versions(
    project_id: String,
    loader: String,
    game_version: String,
    category: Option<String>,
) -> Result<Vec<ContentVersion>, String> {
    use crate::services::mod_install::{ProjectType, find_preferred_version, is_version_compatible};

    let versions = modrinth::get_project_versions(&project_id, "", "").await?;
    let project_type = ProjectType::from_category(category.as_deref().unwrap_or("mod"));
    let recommended_id = find_preferred_version(&versions, project_type, &loader, &game_version)
        .map(|v| v.id.clone());

    Ok(versions
        .into_iter()
        .take(MAX_VERSIONS)
        .map(|v| {
            let compatible = is_version_compatible(&v, project_type, &loader, &game_version);
            let primary = v
                .files
                .iter()
                .find(|f| f.primary)
                .or_else(|| v.files.first());
            ContentVersion {
                recommended: recommended_id.as_deref() == Some(v.id.as_str()),
                compatible,
                channel: v.version_type.clone().unwrap_or_else(|| "unknown".to_string()),
                filename: primary.map(|f| f.filename.clone()).unwrap_or_default(),
                size: primary.map(|f| f.size).unwrap_or(0),
                date_published: v.date_published,
                name: v.version_number,
                game_versions: v.game_versions,
                loaders: v.loaders,
                id: v.id,
            }
        })
        .collect())
}

/// CurseForge equivalent of `get_mod_versions`. Same return shape.
///
/// Two differences are inherent to the source: files are identified by a
/// monotonic numeric id rather than a semantic version string, and the files
/// endpoint returns a single page of 50, so the list is shorter than Modrinth's
/// for prolific projects.
#[tauri::command]
pub async fn get_cf_mod_files(
    mod_id: String,
    loader: String,
    game_version: String,
) -> Result<Vec<ContentVersion>, String> {
    use crate::services::cf_mod_install::{find_preferred_file, is_file_compatible};

    let api_key = resolve_cf_api_key().await?;
    // Unfiltered for the same reason as the Modrinth path — the picker needs to
    // be able to show incompatible entries when the user asks for all versions.
    let files = crate::services::curseforge::get_project_files(&api_key, &mod_id, "", "").await?;
    let recommended_id = find_preferred_file(&files, &game_version, &loader).map(|f| f.file_id);

    let mut out: Vec<ContentVersion> = files
        .into_iter()
        .map(|f| ContentVersion {
            recommended: recommended_id == Some(f.file_id),
            compatible: is_file_compatible(&f, &game_version, &loader),
            channel: match f.release_type {
                1 => "release",
                2 => "beta",
                3 => "alpha",
                _ => "unknown",
            }
            .to_string(),
            name: if f.display_name.is_empty() {
                f.file_name.clone()
            } else {
                f.display_name.clone()
            },
            id: f.file_id.to_string(),
            filename: f.file_name,
            size: f.file_length,
            date_published: f.file_date,
            game_versions: f.game_versions,
            loaders: f.loaders,
        })
        .collect();

    // CurseForge returns files in its own order; ids are monotonic, so sorting
    // by id descending gives newest-first to match the Modrinth list.
    out.sort_by(|a, b| {
        b.id.parse::<u64>()
            .unwrap_or(0)
            .cmp(&a.id.parse::<u64>().unwrap_or(0))
    });
    out.truncate(MAX_VERSIONS);
    Ok(out)
}

/// The user's CurseForge key if set, else the built-in fallback for configs that
/// predate the CurseForge integration.
pub(crate) async fn resolve_cf_api_key() -> Result<String, String> {
    let settings = crate::services::settings_service::load()
        .await
        .map_err(|e| format!("Load settings: {}", e))?;
    Ok(if settings.curseforge_api_key.is_empty() {
        "$2a$10$Vqhx8J1qatEwez9lhg6cjeh1W6RC6H8AtXeLdu7o8H45smb66wCgu".to_string()
    } else {
        settings.curseforge_api_key.clone()
    })
}
