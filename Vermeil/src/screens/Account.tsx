import { Component, createSignal, createResource, createEffect, onCleanup, Show, For } from "solid-js";
import { account, activeSkinUrl, refetchAccount, showToast } from "../App";
import {
  startMsLogin,
  addOfflineAccount,
  getAllAccounts,
  setActiveAccount,
  removeAccount,
  getAccountSkin,
  connectGoogleCloud,
  cancelGoogleCloud,
  disconnectGoogleCloud,
  signOutGoogleCloud,
  isGoogleCloudConnected,
  getLastCloudBackupTime,
} from "../ipc/commands";
import PlayerHead from "../components/PlayerHead";
import { IconX, IconTrash, IconPlus, IconUser, IconShieldCheck, IconAlertTriangle, IconMicrosoft, IconGoogleCloud } from "../components/Icons";
import type { MinecraftProfile } from "../ipc/commands";

/**
 * Cache of skin data URLs per account ID, keyed by Microsoft account UUID.
 * Lives at module scope so re-renders don't blow it away. Each entry is
 * fetched lazily on first render and reused thereafter — without this,
 * switching the active account would clear all the inactive accounts' skin
 * heads back to the colored-initial fallback.
 */
const [skinCache, setSkinCache] = createSignal<Record<string, string>>({});

/** Force-refresh a specific account's cached skin, e.g. after a skin upload. */
export function invalidateAccountSkin(accountId: string) {
  setSkinCache(prev => {
    const next = { ...prev };
    delete next[accountId];
    return next;
  });
}

const Account: Component = () => {
  const [loggingIn, setLoggingIn] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [offlineUsername, setOfflineUsername] = createSignal("");
  const [accounts, { refetch: refetchAccounts }] = createResource(getAllAccounts);
  const [cloudConnected, { refetch: refetchCloudStatus }] = createResource(isGoogleCloudConnected);
  const [lastBackup, { refetch: refetchBackupTime }] = createResource(getLastCloudBackupTime);
  const [cloudBusy, setCloudBusy] = createSignal(false);

  const formatBackupDate = (iso: string | null | undefined): string => {
    if (!iso) return "No cloud backup found yet";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const handleConnectGoogle = async () => {
    if (cloudBusy()) return;
    setCloudBusy(true);
    showToast({
      title: "Authorizing with Google",
      message: "Check your browser to approve Google Cloud access...",
      type: "info",
    });
    try {
      const summary = await connectGoogleCloud();
      await refetchCloudStatus();
      await refetchBackupTime();
      if (summary.restored) {
        await refetchAccount();
        await refetchAccounts();
      }
      showToast({
        title: summary.restored ? "Settings Restored from Cloud" : "Google Cloud Connected",
        message: summary.details,
        type: "success",
      });
    } catch (e: any) {
      const msg = typeof e === "string" ? e : e?.message || "Google Cloud sign-in failed";
      if (!msg.toLowerCase().includes("cancel")) {
        showToast({
          title: "Connection Failed",
          message: msg,
          type: "error",
        });
      } else {
        showToast({
          title: "Sign-In Cancelled",
          message: "Google authorization was cancelled.",
          type: "info",
        });
      }
    } finally {
      setCloudBusy(false);
    }
  };

  const handleCancelGoogle = async () => {
    try {
      await cancelGoogleCloud();
    } catch {}
    setCloudBusy(false);
  };

  onCleanup(() => {
    if (cloudBusy()) {
      cancelGoogleCloud().catch(() => {});
    }
  });

  const handleSignOutGoogle = async () => {
    if (cloudBusy()) return;
    setCloudBusy(true);
    try {
      await signOutGoogleCloud();
      await refetchCloudStatus();
      await refetchBackupTime();
      showToast({
        title: "Signed Out",
        message: "Signed out of Google Cloud on this device.",
        type: "info",
      });
    } catch (e: any) {
      showToast({
        title: "Sign-Out Error",
        message: String(e),
        type: "error",
      });
    } finally {
      setCloudBusy(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (cloudBusy()) return;
    setCloudBusy(true);
    try {
      await disconnectGoogleCloud();
      await refetchCloudStatus();
      await refetchBackupTime();
      showToast({
        title: "Disconnected & Revoked",
        message: "Google Cloud authorization revoked and disconnected.",
        type: "info",
      });
    } catch (e: any) {
      showToast({
        title: "Disconnect Error",
        message: String(e),
        type: "error",
      });
    } finally {
      setCloudBusy(false);
    }
  };

  // Whenever the account list changes, fetch skin heads for every Microsoft
  // account we don't already have cached. The active account's skin also
  // gets routed through the global `activeSkinUrl` signal — but that one
  // doesn't include the *other* signed-in Microsoft accounts, which is what
  // this loop fills in.
  createEffect(() => {
    const list = accounts();
    if (!list) return;
    for (const acc of list) {
      if (acc.is_offline) continue;
      if (skinCache()[acc.id]) continue; // already cached
      // Fire-and-forget — failures (network, 401, etc.) just leave the row
      // showing the colored-initial fallback, which is fine.
      getAccountSkin(acc.id)
        .then((url) => {
          if (url) {
            setSkinCache(prev => ({ ...prev, [acc.id]: url }));
          }
        })
        .catch(() => {
          /* leave fallback in place */
        });
    }
  });

  // The active account's skin is already kept fresh via `activeSkinUrl` in
  // App.tsx. Mirror it into the per-account cache so the row picks it up
  // without an extra IPC round-trip.
  createEffect(() => {
    const activeUrl = activeSkinUrl();
    const a = account();
    if (activeUrl && a && !a.is_offline) {
      setSkinCache(prev => ({ ...prev, [a.id]: activeUrl }));
    }
  });

  const handleLogin = async () => {
    setLoggingIn(true);
    setError(null);
    try {
      await startMsLogin();
      await refetchAccount();
      await refetchAccounts();
    } catch (e: any) {
      const msg = typeof e === "string" ? e : e.message || "Login failed";
      if (msg !== "Login cancelled") {
        setError(msg);
      }
    } finally {
      setLoggingIn(false);
    }
  };

  const handleOfflineLogin = async () => {
    const name = offlineUsername().trim();
    if (!name) return;
    setError(null);
    try {
      await addOfflineAccount(name);
      await refetchAccount();
      await refetchAccounts();
      setOfflineUsername("");
    } catch (e: any) {
      setError(typeof e === "string" ? e : e.message || "Failed to add account");
    }
  };

  const handleSwitch = async (id: string) => {
    await setActiveAccount(id);
    await refetchAccount();
    await refetchAccounts();
  };

  const handleRemove = async (id: string) => {
    await removeAccount(id);
    await refetchAccount();
    await refetchAccounts();
    // Drop any cached skin for the removed account.
    setSkinCache(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const skinFor = (acc: MinecraftProfile): string | null => {
    if (acc.is_offline) return null;
    return skinCache()[acc.id] ?? null;
  };

  const isAccountExpired = (acc: MinecraftProfile): boolean => {
    const a = account();
    if (a && a.id === acc.id && a.needs_reauth) return true;
    return !!acc.needs_reauth;
  };

  return (
    <div class="screen-enter account-screen">
      {/* Page Header */}
      <div class="page-header">
        <div class="page-title-group">
          <div class="page-title">Accounts</div>
          <div class="page-subtitle">Manage saved profiles, active identities, and authentication methods</div>
        </div>
      </div>

      {/* Error alert banner */}
      <Show when={error()}>
        <div class="account-error-banner">
          <IconAlertTriangle />
          <div class="account-error-msg">{error()}</div>
          <button type="button" class="account-error-dismiss" onClick={() => setError(null)} data-tip="Dismiss">
            <IconX />
          </button>
        </div>
      </Show>

      {/* ═══ SAVED PROFILES SECTION ═══ */}
      <div class="card-gamemode-section">
        <div class="card-section-header">
          <span class="card-section-tag tag-settings-account">PROFILES</span>
          <span class="card-section-label">Active & Saved Profiles</span>
          <span class="card-section-desc">Click any inactive profile to switch your active identity</span>
        </div>

        <div class="card-section-body">
          <Show
            when={accounts() && accounts()!.length > 0}
            fallback={
              <div class="account-empty-well">
                <IconUser />
                <div class="account-empty-title">No accounts added yet</div>
                <div class="account-empty-desc">
                  Sign in with an official Microsoft account or create an offline profile below to start playing.
                </div>
              </div>
            }
          >
            <div class="account-grid">
              <For each={accounts()}>
                {(acc: MinecraftProfile) => (
                  <div
                    class={`account-card ${acc.active ? "active" : ""}`}
                    onClick={() => !acc.active && handleSwitch(acc.id)}
                  >
                    <div class="account-card-avatar">
                      <PlayerHead
                        skinUrl={skinFor(acc)}
                        name={acc.name}
                        size={44}
                      />
                    </div>
                    <div class="account-card-info">
                      <div class="account-card-name">{acc.name}</div>
                      <div class="account-card-type">
                        {acc.is_offline ? "Offline Profile" : "Microsoft"}
                      </div>
                    </div>
                    <Show
                      when={isAccountExpired(acc)}
                      fallback={
                        <Show when={acc.active}>
                          <div class={`account-badge-active ${acc.is_offline ? "account-badge--offline" : ""}`}>
                            <Show
                              when={!acc.is_offline}
                              fallback={<span class="account-badge-dot account-badge-dot--offline" />}
                            >
                              <IconMicrosoft class="account-badge-ms-icon" />
                            </Show>
                            <span>Active</span>
                          </div>
                        </Show>
                      }
                    >
                      <div class="account-badge-reauth tip-below tip-left" data-tip="Session expired. Sign in with Microsoft again.">
                        <IconAlertTriangle />
                        <span>Expired</span>
                      </div>
                    </Show>
                    <button
                      type="button"
                      class="account-card-remove"
                      data-tip={`Remove ${acc.name}`}
                      onClick={(e) => { e.stopPropagation(); handleRemove(acc.id); }}
                    >
                      <IconTrash />
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>

      {/* ═══ ADD ACCOUNT SECTION ═══ */}
      <div class="card-gamemode-section">
        <div class="card-section-header">
          <span class="card-section-tag tag-settings-general">AUTHENTICATION</span>
          <span class="card-section-label">Add Account</span>
          <span class="card-section-desc">Connect an official Microsoft account or create an offline local profile</span>
        </div>

        <div class="card-section-body">
          <div class="account-add-grid">
            {/* Microsoft Account Card */}
            <div class="account-add-card">
              <div class="account-add-card-header">
                <div class="account-add-card-badge tag-settings-account">ONLINE</div>
                <div class="account-add-card-title">Microsoft Account</div>
                <div class="account-add-card-desc">
                  Official Mojang / Microsoft authentication. Required for online multiplayer, Realms, and official skin sync.
                </div>
              </div>
              <div class="account-add-card-footer">
                <button
                  type="button"
                  class="btn btn--primary"
                  onClick={handleLogin}
                  disabled={loggingIn()}
                >
                  <Show when={loggingIn()} fallback={
                    <>
                      <IconPlus />
                      <span>Add Microsoft Account</span>
                    </>
                  }>
                    <span>Signing in via browser...</span>
                  </Show>
                </button>
              </div>
            </div>

            {/* Offline Account Card */}
            <div class="account-add-card">
              <div class="account-add-card-header">
                <div class="account-add-card-badge tag-settings-about">OFFLINE</div>
                <div class="account-add-card-title">Offline / Local Profile</div>
                <div class="account-add-card-desc">
                  Local username for singleplayer and LAN worlds. Does not require Microsoft sign-in or an internet connection.
                </div>
              </div>
              <div class="account-add-card-footer">
                <div class="account-offline-form">
                  <input
                    class="account-offline-input"
                    placeholder="Username (1-16 chars)"
                    value={offlineUsername()}
                    onInput={(e) => setOfflineUsername(e.currentTarget.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleOfflineLogin(); }}
                    maxLength={16}
                  />
                  <button
                    type="button"
                    class="btn btn--neutral"
                    onClick={handleOfflineLogin}
                    disabled={!offlineUsername().trim()}
                  >
                    <IconPlus />
                    <span>Add Offline</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Google Cloud Settings Sync Strip */}
          <div class="account-cloud-strip">
            <div class="account-cloud-strip-left">
              <div class="account-cloud-strip-icon">
                <IconGoogleCloud />
              </div>
              <div class="account-cloud-strip-info">
                <div class="account-cloud-strip-title-row">
                  <span class="account-cloud-strip-title">Google Cloud Settings Sync</span>
                  <span class={`card-section-tag ${cloudConnected() ? "tag-settings-performance" : "tag-settings-cloud"}`}>
                    {cloudConnected() ? "SYNCED" : "CLOUD"}
                  </span>
                </div>
                <div class="account-cloud-strip-desc">
                  <Show
                    when={cloudConnected()}
                    fallback="Sign in once to automatically sync General, Display, Sound, and Keybind preferences across devices."
                  >
                    <span>Preferences automatically synced to cloud. {lastBackup() ? `Last updated: ${formatBackupDate(lastBackup()!)}` : ""}</span>
                  </Show>
                </div>
              </div>
            </div>
            <div class="account-cloud-strip-action">
              <Show
                when={cloudConnected()}
                fallback={
                  <Show
                    when={cloudBusy()}
                    fallback={
                      <button
                        type="button"
                        class="btn btn--primary"
                        onClick={handleConnectGoogle}
                      >
                        <IconGoogleCloud />
                        <span>Sign in with Google</span>
                      </button>
                    }
                  >
                    <button
                      type="button"
                      class="btn btn--secondary"
                      onClick={handleCancelGoogle}
                      data-tip="Click to abort Google sign-in"
                    >
                      <IconX />
                      <span>Cancel Connecting</span>
                    </button>
                  </Show>
                }
              >
                <div class="account-cloud-buttons">
                  <button
                    type="button"
                    class="btn btn--neutral btn--sm tip-right"
                    onClick={handleSignOutGoogle}
                    disabled={cloudBusy()}
                    data-tip="Sign out on this device (keeps Google authorization)"
                  >
                    <span>{cloudBusy() ? "Working..." : "Sign Out"}</span>
                  </button>
                  <button
                    type="button"
                    class="btn btn--danger btn--sm tip-right"
                    onClick={handleDisconnectGoogle}
                    disabled={cloudBusy()}
                    data-tip="Revoke Google authorization and unlink app"
                  >
                    <span>{cloudBusy() ? "Working..." : "Disconnect"}</span>
                  </button>
                </div>
              </Show>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ SECURITY & ENCRYPTION NOTE ═══ */}
      <div class="account-security-card">
        <div class="account-security-icon">
          <IconShieldCheck />
        </div>
        <div class="account-security-content">
          <div class="account-security-title">Local & Encrypted Credentials</div>
          <div class="account-security-desc">
            Vermeil authenticates directly with Microsoft's official OAuth 2.0 PKCE flow. Refresh tokens and profile data are encrypted locally on your computer using OS-level secure storage (DPAPI on Windows, Secret Service on Linux). Vermeil operates zero external servers and collects zero telemetry.
          </div>
        </div>
      </div>
    </div>
  );
};

export default Account;
