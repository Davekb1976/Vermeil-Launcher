use discord_presence::Client;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const DISCORD_APP_ID: u64 = 1507103792737419395;

#[derive(Clone, Debug, PartialEq)]
pub enum ActivityState {
    Idle,
    Playing {
        instance_name: String,
        game_version: String,
        loader: String,
        mod_count: usize,
        start_timestamp: u64,
    },
}

lazy_static::lazy_static! {
    static ref DISCORD: Mutex<Option<Client>> = Mutex::new(None);
    static ref ENABLED: AtomicBool = AtomicBool::new(false);
    static ref CONNECTED: AtomicBool = AtomicBool::new(false);
    static ref CURRENT_ACTIVITY: Mutex<ActivityState> = Mutex::new(ActivityState::Idle);
}

/// Initialize Discord Rich Presence on app startup based on persisted settings.
pub fn init() {
    let enabled = read_setting();
    if enabled {
        set_enabled(true);
    }
}

/// Backward-compatible alias for init (called in lib.rs).
pub fn spawn_watcher() {
    init();
}

/// Enable or disable Discord Rich Presence immediately.
pub fn set_enabled(enabled: bool) {
    let prev = ENABLED.swap(enabled, Ordering::SeqCst);
    if enabled {
        let mut guard = DISCORD.lock().unwrap();
        if guard.is_none() {
            let mut client = Client::new(DISCORD_APP_ID);

            client
                .on_ready(|_ctx| {
                    tracing::info!("Discord RPC ready");
                    CONNECTED.store(true, Ordering::SeqCst);
                    std::thread::spawn(sync_presence);
                })
                .persist();

            client
                .on_connected(|_ctx| {
                    tracing::debug!("Discord RPC connected");
                    CONNECTED.store(true, Ordering::SeqCst);
                    std::thread::spawn(sync_presence);
                })
                .persist();

            client
                .on_disconnected(|_ctx| {
                    tracing::debug!("Discord RPC disconnected");
                    CONNECTED.store(false, Ordering::SeqCst);
                })
                .persist();

            client
                .on_error(|ctx| {
                    tracing::debug!("Discord RPC error event: {:?}", ctx.event);
                    CONNECTED.store(false, Ordering::SeqCst);
                })
                .persist();

            client.start();
            *guard = Some(client);
            drop(guard);
        } else if !prev {
            drop(guard);
            if CONNECTED.load(Ordering::SeqCst) {
                sync_presence();
            }
        }
    } else {
        // Disabled: clear activity from Discord profile immediately
        let mut guard = DISCORD.lock().unwrap();
        if let Some(ref mut client) = *guard {
            let _ = client.clear_activity();
        }
    }
}

fn read_setting() -> bool {
    let config_path = crate::util::paths::data_dir().join("config.json");
    if !config_path.exists() {
        return false;
    }

    std::fs::read_to_string(&config_path)
        .ok()
        .and_then(|c| serde_json::from_str::<serde_json::Value>(&c).ok())
        .and_then(|v| v.get("discord_rpc")?.as_bool())
        .unwrap_or(false)
}

/// Set presence to "Playing" with instance details and elapsed timer.
/// Persists current playing activity so if RPC is enabled mid-game or reconnects,
/// the running game displays immediately.
pub fn set_playing(instance_name: &str, game_version: &str, loader: &str, mod_count: usize) {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    {
        let mut act = CURRENT_ACTIVITY.lock().unwrap();
        *act = ActivityState::Playing {
            instance_name: instance_name.to_string(),
            game_version: game_version.to_string(),
            loader: loader.to_string(),
            mod_count,
            start_timestamp: timestamp,
        };
    }

    sync_presence();
}

/// Reset presence back to idle (call when game exits).
pub fn set_stopped() {
    {
        let mut act = CURRENT_ACTIVITY.lock().unwrap();
        *act = ActivityState::Idle;
    }

    sync_presence();
}

/// Push the current state (`CURRENT_ACTIVITY`) to Discord if enabled and connected.
pub fn sync_presence() {
    if !ENABLED.load(Ordering::SeqCst) {
        return;
    }
    if !CONNECTED.load(Ordering::SeqCst) {
        return;
    }

    let activity = CURRENT_ACTIVITY.lock().unwrap().clone();
    let mut guard = DISCORD.lock().unwrap();
    if let Some(ref mut client) = *guard {
        match activity {
            ActivityState::Playing {
                instance_name,
                game_version,
                loader,
                mod_count,
                start_timestamp,
            } => {
                let details = instance_name;
                let state = if loader.eq_ignore_ascii_case("vanilla") {
                    format!("Minecraft {}", game_version)
                } else if mod_count > 0 {
                    format!("{} {} · {} mods", loader, game_version, mod_count)
                } else {
                    format!("{} {}", loader, game_version)
                };

                let res = client.set_activity(|act| {
                    act.state(&state)
                        .details(&details)
                        .assets(|a| {
                            a.large_image("icon")
                                .large_text("Vermeil Launcher")
                        })
                        .timestamps(|ts| ts.start(start_timestamp))
                });

                if let Err(e) = res {
                    tracing::debug!("Discord set_activity error: {:?}", e);
                }
            }
            ActivityState::Idle => {
                let res = client.set_activity(|act| {
                    act.state("Managing instances")
                        .details("In Launcher")
                        .assets(|a| a.large_image("icon").large_text("Vermeil Launcher"))
                });

                if let Err(e) = res {
                    tracing::debug!("Discord set_activity idle error: {:?}", e);
                }
            }
        }
    }
}
