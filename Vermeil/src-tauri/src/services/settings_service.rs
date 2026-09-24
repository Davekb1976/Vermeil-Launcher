use crate::models::settings::LauncherSettings;
use crate::util::paths;
use std::fs;

pub async fn load() -> Result<LauncherSettings, Box<dyn std::error::Error + Send + Sync>> {
    let config_path = paths::data_dir().join("config.json");

    if !config_path.exists() {
        let defaults = LauncherSettings::default();
        save(&defaults).await?;
        return Ok(defaults);
    }

    let content = fs::read_to_string(&config_path)?;
    let mut settings: LauncherSettings = serde_json::from_str(&content)?;

    // Self-heal `sidebar_pinned_instances` — drop any IDs whose instance
    // folder no longer exists on disk. Without this, deleting an instance
    // through some path that bypasses the delete command (manual rm,
    // partial migration, app-crash mid-create) would leave a ghost pin
    // that bumps the count toward the 3-pin cap and prevents adding new
    // ones. The check is cheap (one `exists()` call per pinned ID) so we
    // run it on every load.
    let before = settings.sidebar_pinned_instances.len();
    settings.sidebar_pinned_instances.retain(|id| {
        paths::instances_dir().join(id).exists()
    });
    if settings.sidebar_pinned_instances.len() != before {
        // Persist the cleanup so subsequent reads aren't doing the same
        // work. Best-effort — a save failure just means we'll re-prune
        // next launch.
        let _ = save(&settings).await;
    }

    // One-time grandfathering for lifetime_play_seconds and last_active_at:
    // If lifetime_play_seconds is 0, seed it from existing instances on disk so
    // existing players don't lose their accumulated history.
    if settings.lifetime_play_seconds == 0 {
        let instances_dir = paths::instances_dir();
        if instances_dir.exists() {
            let mut sum_play = 0u64;
            let mut latest_played: Option<String> = None;
            if let Ok(entries) = fs::read_dir(&instances_dir) {
                for entry in entries.flatten() {
                    let meta_path = entry.path().join("instance.json");
                    if let Ok(content) = fs::read_to_string(&meta_path) {
                        if let Ok(inst) = serde_json::from_str::<crate::models::instance::Instance>(&content) {
                            sum_play += inst.total_play_seconds;
                            if let Some(lp) = inst.last_played {
                                if latest_played.as_ref().map_or(true, |cur| lp > *cur) {
                                    latest_played = Some(lp);
                                }
                            }
                        }
                    }
                }
            }
            if sum_play > 0 || latest_played.is_some() {
                settings.lifetime_play_seconds = sum_play;
                if settings.last_active_at.is_none() {
                    settings.last_active_at = latest_played;
                }
                let _ = save(&settings).await;
            }
        }
    }

    Ok(settings)
}

pub async fn save(settings: &LauncherSettings) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let data_dir = paths::data_dir();
    fs::create_dir_all(&data_dir)?;

    let config_path = data_dir.join("config.json");
    let json = serde_json::to_string_pretty(settings)?;
    paths::atomic_write(&config_path, json.as_bytes())?;
    Ok(())
}

/// Maximum instances auto-pinned to the sidebar. Mirrors `MAX_PINS` in
/// `src/modals/PinInstancesModal.tsx` — keep the two in sync.
const MAX_SIDEBAR_PINS: usize = 6;

/// Auto-pin a freshly-created instance to the sidebar if there's still room
/// under the cap and it isn't already pinned. This is what makes the first
/// few instances a user creates show up in the dock without them having to
/// open the pin manager. Best-effort: a failure here must never block
/// instance creation, so callers ignore the result.
pub async fn auto_pin_instance(instance_id: &str) {
    if let Ok(mut settings) = load().await {
        let already = settings
            .sidebar_pinned_instances
            .iter()
            .any(|id| id == instance_id);
        if !already && settings.sidebar_pinned_instances.len() < MAX_SIDEBAR_PINS {
            settings.sidebar_pinned_instances.push(instance_id.to_string());
            let _ = save(&settings).await;
        }
    }
}
