import { Component, createSignal, createEffect, createResource, createMemo, For, Show, onCleanup } from "solid-js";
import { setActiveScreen, setActiveInstanceId, setInitialInstanceTab, setGameLaunched, instances, ensureAccountOrPrompt, account, activeSkinUrl, setDockPagination, clearGameLogs, showToast, cloudConnected } from "../App";
import { launchInstance, listInstanceWorlds, getJavaNews, getArticleBody, NewsArticle, getSettings } from "../ipc/commands";
import { loaderBadgeClass, loaderLabel } from "../lib/loader";
import { createGridPageSize } from "../lib/gridPageSize";
import { IconPlay, IconGlobe, IconShieldCheck, IconPlus, IconMicrosoft, IconAlertTriangle, IconClock, IconUser, IconCloud, IconGoogleCloud, IconExternalLink } from "../components/Icons";
import CharacterStage from "../components/CharacterStage";
import { openUrl } from "@tauri-apps/plugin-opener";
import { resolveAssetUrl } from "../lib/assets";

/** Pick a time-of-day greeting. Cheap personalization that makes the home
 *  screen feel less generic without leaning on user data we don't have. */
function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Good evening";   // late night still reads as evening
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Format the most recent play timestamp as a compact relative phrase
 *  ("just now", "15m ago", "2h ago", "yesterday", "3d ago"). Returns null
 *  when absent or unparseable so the telemetry plate renders "None". */
function relativePlayed(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = Date.now() - then;
  if (diffMs < 60_000) return "just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(diffMs / 86_400_000);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks}w ago`;
  }
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/** Format total playtime seconds into compact hours/minutes (e.g. "14h 25m", "< 1m", "0m"). */
function formatPlaytime(seconds: number): string {
  if (!seconds || seconds <= 0) return "0m";
  if (seconds < 60) return "< 1m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/** Loader-tinted icon-tile background class (mirrors the Library card). */
function bannerColor(loader: string): string {
  switch (loader) {
    case "fabric": return "fabric";
    case "quilt": return "quilt";
    case "forge": return "orange";
    case "neoforge": return "purple";
    default: return "green";
  }
}

interface NewsBadgeInfo {
  label: string;
  tagClass: string;
}

/** Categorize a news article into a distinct tag type for the tactile badge. */
function getNewsCategory(article: NewsArticle): NewsBadgeInfo {
  const v = (article.version || "").toLowerCase();
  const t = (article.title || "").toLowerCase();

  if (v.includes("rc") || t.includes("release candidate")) {
    return { label: article.version || "Release Candidate", tagClass: "tag-rc" };
  }
  if (v.includes("pre") || t.includes("pre-release")) {
    return { label: article.version || "Pre-Release", tagClass: "tag-pre" };
  }
  if (/\d+w\d+[a-z]/.test(v) || t.includes("snapshot")) {
    return { label: article.version || "Snapshot", tagClass: "tag-snapshot" };
  }
  if (v && /^\d+\.\d+(\.\d+)?$/.test(v.trim())) {
    return { label: `Java ${article.version}`, tagClass: "tag-release" };
  }
  if (v) {
    return { label: article.version, tagClass: "tag-release" };
  }
  return { label: "Article", tagClass: "tag-article" };
}

const Home: Component = () => {
  const [news] = createResource(getJavaNews);
  const [newsPage, setNewsPage] = createSignal(1);
  // Fixed 4x3 (12 cards) on maximized/large windows (> 800px) and 4x2 (8 cards)
  // on standard small windows (720px). Adapts column count downwards if window narrows.
  const newsPageSize = createGridPageSize({
    track: 230,
    gap: 14,
    rowHeight: 220,
    maxRows: () => (window.innerHeight > 800 ? 3 : 2),
    maxCols: 4,
    fixedRows: true,
    debounceMs: 0,
  });
  const [selectedArticle, setSelectedArticle] = createSignal<NewsArticle | null>(null);
  const [articleBody, setArticleBody] = createSignal<string>("");
  const [loadingArticle, setLoadingArticle] = createSignal(false);

  // Close the article modal on Escape without triggering parent navigation
  createEffect(() => {
    if (!selectedArticle()) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        setSelectedArticle(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    onCleanup(() => window.removeEventListener("keydown", onKey, true));
  });

  // Intercept links inside sanitized article HTML to open via Tauri opener
  const handleModalClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const anchor = target?.closest("a") as HTMLAnchorElement | null;
    if (anchor && anchor.href) {
      e.preventDefault();
      openUrl(anchor.href);
    }
  };

  const openArticle = async (article: NewsArticle) => {
    // Every article opens the modal reader for a consistent experience.
    // Patch notes (with a contentPath `body`) fetch their full HTML; general
    // news has no in-app body, so the modal shows the excerpt plus a
    // "Read on minecraft.net" button (its `url` is the canonical article link).
    setSelectedArticle(article);
    setArticleBody("");
    if (!article.body) return;
    setLoadingArticle(true);
    try {
      const body = await getArticleBody(article.body);
      setArticleBody(body);
    } catch { setArticleBody(""); }
    finally { setLoadingArticle(false); }
  };

  /** Format an ISO-8601 date to a short, locale-aware label (e.g. "May 19, 2026").
   *  Returns "" for missing/unparseable dates so the caller can omit it. */
  const formatArticleDate = (iso: string): string => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };

  const totalNewsPages = () => Math.ceil((news()?.length || 0) / newsPageSize.size());
  const visibleNews = () => {
    const all = news() || [];
    const start = (newsPage() - 1) * newsPageSize.size();
    return all.slice(start, start + newsPageSize.size());
  };

  // Clamp the page if the column-aware size grows (e.g. on maximize) so a
  // formerly-valid page number doesn't land past the new last page.
  createEffect(() => {
    const total = totalNewsPages();
    if (newsPage() > total) setNewsPage(Math.max(1, total));
  });

  // Push news pagination into the dock when there are multiple pages.
  createEffect(() => {
    if (totalNewsPages() > 1) {
      setDockPagination({ current: newsPage(), total: totalNewsPages(), onPageChange: setNewsPage });
    } else {
      setDockPagination(null);
    }
  });
  onCleanup(() => setDockPagination(null));

  const [settings, { refetch: refetchSettings }] = createResource(getSettings);
  createEffect(() => {
    instances();
    refetchSettings();
  });
  createEffect(() => {
    const onSettingsChanged = () => refetchSettings();
    window.addEventListener("vermeil-settings-changed", onSettingsChanged);
    onCleanup(() => window.removeEventListener("vermeil-settings-changed", onSettingsChanged));
  });

  const [recentWorlds] = createResource(
    instances,
    async (insts) => {
      if (!insts || insts.length === 0) return [];

      const allWorlds: {
        instanceId: string; instanceName: string; instanceIcon: string;
        loader: string; gameVersion: string;
        worldName: string; worldFolder: string; worldIcon: string | null; lastPlayed: string;
        playTimeSeconds: number;
      }[] = [];
      for (const inst of insts.slice(0, 10)) {
        try {
          const worlds = await listInstanceWorlds(inst.id);
          for (const w of worlds) {
            allWorlds.push({
              instanceId: inst.id,
              instanceName: inst.name,
              instanceIcon: inst.icon,
              loader: inst.loader.type,
              gameVersion: inst.game_version,
              worldName: w.name,
              worldFolder: w.folder_name,
              worldIcon: w.icon,
              lastPlayed: w.last_played,
              playTimeSeconds: w.play_time_seconds,
            });
          }
        } catch { /* ignore */ }
      }
      allWorlds.sort((a, b) => b.lastPlayed.localeCompare(a.lastPlayed));
      return allWorlds.slice(0, 5);
    },
    { initialValue: [] }
  );

  // Number of empty slots to display so the secondary 2x2 sub-grid always has 4 slots (5 worlds total with hero)
  const emptySlotCount = createMemo(() => {
    const total = recentWorlds()?.length ?? 0;
    const subWorlds = Math.max(0, total - 1);
    return Math.max(0, 4 - subWorlds);
  });

  const handlePlayWorld = async (
    instanceId: string,
    worldFolder?: string,
    worldName?: string,
    gameVersion?: string
  ) => {
    if (!ensureAccountOrPrompt()) return;
    setActiveInstanceId(instanceId);
    setInitialInstanceTab("logs");
    setGameLaunched(true);
    setActiveScreen("mods");
    clearGameLogs(instanceId);

    if (worldName) {
      // Check version support for native Quick Play (Minecraft 1.20+)
      const isModern = (() => {
        if (!gameVersion) return true;
        const match = gameVersion.match(/^(\d+)\.(\d+)/);
        if (!match) return true;
        const major = parseInt(match[1], 10);
        const minor = parseInt(match[2], 10);
        return major > 1 || (major === 1 && minor >= 20);
      })();

      if (!isModern) {
        showToast({
          title: "Direct Join: MC 1.20+ Required",
          message: `MC ${gameVersion} doesn't support quick play. Opening to title screen.`,
          type: "info",
        });
      } else {
        showToast({
          title: "Resuming World",
          message: `Launching into ${worldName}...`,
          type: "info",
        });
      }
    }

    try {
      await launchInstance(instanceId, worldFolder);
    } catch (e) {
      console.error("Failed to launch instance for world:", e);
      showToast({
        title: "Launch Failed",
        message: String(e),
        type: "error",
      });
    }
  };

  // Header summary — total instance count, lifetime playtime, and most-recent play date across
  // all instances and global launcher history, formatted relatively.
  const headerSummary = createMemo(() => {
    const list = instances() ?? [];
    const sett = settings();
    const instRecent = list
      .map((i) => i.last_played)
      .filter((d): d is string => Boolean(d))
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
      .pop();

    const globalLast = sett?.last_active_at ?? null;
    let mostRecent: string | null = null;
    if (instRecent && globalLast) {
      mostRecent = new Date(instRecent).getTime() > new Date(globalLast).getTime() ? instRecent : globalLast;
    } else {
      mostRecent = instRecent ?? globalLast;
    }

    const currentInstPlaySeconds = list.reduce((acc, i) => acc + (i.total_play_seconds || 0), 0);
    const globalPlaySeconds = sett?.lifetime_play_seconds ?? 0;
    const totalPlaySeconds = Math.max(currentInstPlaySeconds, globalPlaySeconds);

    return {
      count: list.length,
      relative: relativePlayed(mostRecent),
      totalPlaytime: formatPlaytime(totalPlaySeconds),
      hasPlaytime: totalPlaySeconds > 0,
    };
  });

  const displayName = () => account()?.name ?? "Player";

  return (
    <div class="screen-enter">
      {/* ═══ HERO HUB: 3D Character Stage & Continue Station ═══ */}
      <div class="home-hero-grid">
        {/* Left Column: 3D Character Stage (Black Box) & Telemetry (Blue Box) */}
        <div class="home-commander-col">
          {/* Black Box: 3D Character Stage with wave animation */}
          <div class="home-skin-stage">
            <CharacterStage
              skinUrl={activeSkinUrl()}
              name={displayName()}
            />
            <div class="home-skin-stage-badge">
              <span class="home-stage-tag">OPERATOR</span>
            </div>
          </div>

          {/* Blue Box: Tactical Telemetry Base Plate */}
          <div
            class="home-telemetry-plate"
            onClick={() => setActiveScreen("account")}
            role="button"
            tabIndex={0}
            aria-label="Click to manage accounts and profiles"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setActiveScreen("account");
              }
            }}
          >
            <div class="home-telemetry-header">
              <div class="home-telemetry-user">
                <span class="home-telemetry-salutation">{timeOfDayGreeting()},</span>
                <span class="home-telemetry-name">{displayName()}</span>
              </div>
              <div class="home-telemetry-badges">
                {/* Account / Identity status icon badge (Icon only, no text) */}
                <Show
                  when={account()}
                  fallback={
                    <div
                      class="home-status-badge home-status-badge--none tip-below tip-right"
                      data-tip="No active account — click to sign in"
                    >
                      <IconUser class="home-status-icon" />
                    </div>
                  }
                >
                  {(acc) => (
                    <Show
                      when={acc().needs_reauth}
                      fallback={
                        <Show
                          when={!acc().is_offline}
                          fallback={
                            <div
                              class="home-status-badge home-status-badge--offline tip-below tip-right"
                              data-tip="Offline profile"
                            >
                              <IconUser class="home-status-icon" />
                            </div>
                          }
                        >
                          <div
                            class="home-status-badge home-status-badge--ms tip-below tip-right"
                            data-tip="Signed in with Microsoft"
                          >
                            <IconMicrosoft class="home-status-ms-icon" />
                          </div>
                        </Show>
                      }
                    >
                      <div
                        class="home-status-badge home-status-badge--reauth tip-below tip-right"
                        data-tip="Session expired — open Accounts to sign in again"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveScreen("account");
                        }}
                      >
                        <IconAlertTriangle class="home-status-icon" />
                      </div>
                    </Show>
                  )}
                </Show>

                {/* Cloud sync status icon badge (grayed out when disconnected) */}
                <div
                  class={`home-status-badge home-status-badge--cloud ${cloudConnected() ? "connected" : "disconnected"} tip-below tip-right`}
                  data-tip={cloudConnected() ? "Cloud sync: Connected" : "Cloud sync: Disconnected"}
                >
                  <Show
                    when={cloudConnected()}
                    fallback={<IconCloud class="home-status-cloud-icon-dimmed" />}
                  >
                    <IconGoogleCloud class="home-status-cloud-icon" />
                  </Show>
                </div>
              </div>
            </div>

            <div class="home-telemetry-stats">
              <div class="home-telemetry-item">
                <span class="telemetry-item-val">{headerSummary()?.count ?? 0}</span>
                <span class="telemetry-item-lbl">Instances</span>
              </div>
              <div class="home-telemetry-item">
                <span class="telemetry-item-val">{headerSummary()?.totalPlaytime ?? "0m"}</span>
                <span class="telemetry-item-lbl">Playtime</span>
              </div>
              <div class="home-telemetry-item">
                <span class="telemetry-item-val">{headerSummary()?.relative ?? "None"}</span>
                <span class="telemetry-item-lbl">Last Active</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Gold Box - Continue Where You Left Off Station */}
        <div class="home-continue-col">
          <div class="section-label section-label--row">
            <span>Continue</span>
            <span class="continue-section-sub">Resume your recent Minecraft sessions</span>
          </div>

          <div class="continue-stack">
            {/* Show Featured Recent World Hero Card if any exist */}
            <Show
              when={recentWorlds() && recentWorlds()!.length > 0}
              fallback={
                <div class="continue-empty-hero" onClick={() => setActiveScreen("library")}>
                  <div class="continue-empty-icon"><IconPlus /></div>
                  <div class="continue-empty-text">
                    <span class="continue-empty-title">No recent worlds</span>
                    <span class="continue-empty-desc">Launch an instance in your Library to play a world</span>
                  </div>
                </div>
              }
            >
              {/* Primary Featured Hero Card */}
              {(() => {
                const heroWorld = () => recentWorlds()![0];
                return (
                  <div
                    class="continue-hero-card"
                    onClick={() => {
                      setActiveInstanceId(heroWorld().instanceId);
                      setInitialInstanceTab("content");
                      setActiveScreen("mods");
                    }}
                  >
                    <div class={`continue-hero-thumb ${bannerColor(heroWorld().loader)}`}>
                      <Show when={heroWorld().worldIcon} fallback={<span class="world-card-globe"><IconGlobe /></span>}>
                        <img src={heroWorld().worldIcon!} alt="" draggable={false} />
                      </Show>
                    </div>

                    <div class="continue-hero-body">
                      <div class="continue-hero-info">
                        <div class="continue-hero-badge-row">
                          <span class={`badge badge--loader ${loaderBadgeClass(heroWorld().loader)}`}>
                            {loaderLabel(heroWorld().loader)}
                          </span>
                          <span class="badge badge--version">{heroWorld().gameVersion}</span>
                          <Show when={heroWorld().playTimeSeconds && heroWorld().playTimeSeconds > 0}>
                            <span class="badge badge--playtime tip-below" data-tip="Time played in this world">
                              <IconClock class="badge-icon" />
                              {formatPlaytime(heroWorld().playTimeSeconds)}
                            </span>
                          </Show>
                        </div>
                        <div class="continue-hero-title">{heroWorld().worldName}</div>
                        <div class="continue-hero-sub">
                          <Show when={resolveAssetUrl(heroWorld().instanceIcon)}>
                            <img
                              class="world-card-inst-icon"
                              src={resolveAssetUrl(heroWorld().instanceIcon)!}
                              alt=""
                              draggable={false}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          </Show>
                          <span>{heroWorld().instanceName}</span>
                        </div>
                      </div>

                      <button
                        class="btn btn--primary continue-hero-play"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayWorld(
                            heroWorld().instanceId,
                            heroWorld().worldFolder,
                            heroWorld().worldName,
                            heroWorld().gameVersion
                          );
                        }}
                      >
                        <IconPlay /> Play
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Secondary World / Placeholder 2x2 Grid (Slots 2 to 5 / Placeholders 1 to 4) */}
              <div class="continue-sub-grid">
                <For each={recentWorlds()!.slice(1)}>
                  {(world) => (
                    <div
                      class="world-card world-card--sub"
                      onClick={() => {
                        setActiveInstanceId(world.instanceId);
                        setInitialInstanceTab("content");
                        setActiveScreen("mods");
                      }}
                    >
                      <div class={`world-card-thumb ${bannerColor(world.loader)}`}>
                        <Show when={world.worldIcon} fallback={<span class="world-card-globe"><IconGlobe /></span>}>
                          <img src={world.worldIcon!} alt="" draggable={false} />
                        </Show>
                      </div>
                      <div class="world-card-body">
                        <div class="world-card-info">
                          <div class="world-card-title">{world.worldName}</div>
                          <div class="world-card-sub">
                            <span class="world-card-inst-name">{world.instanceName}</span>
                            <Show when={world.playTimeSeconds && world.playTimeSeconds > 0}>
                              <span class="world-card-sep">·</span>
                              <span class="world-card-playtime tip-below" data-tip="Time played in this world">
                                <IconClock class="world-card-clock-icon" />
                                {formatPlaytime(world.playTimeSeconds)}
                              </span>
                            </Show>
                          </div>
                        </div>
                        <button
                          class="btn btn--primary btn--sm world-card-play"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePlayWorld(
                              world.instanceId,
                              world.worldFolder,
                              world.worldName,
                              world.gameVersion
                            );
                          }}
                        >
                          <IconPlay />
                        </button>
                      </div>
                    </div>
                  )}
                </For>

                {/* Empty placeholders for remaining slots */}
                <For each={Array.from({ length: emptySlotCount() })}>
                  {() => (
                    <div
                      class="continue-placeholder continue-placeholder--sub"
                      onClick={() => setActiveScreen("library")}
                      data-tip="Launch an instance in your Library to play a world"
                    >
                      <div class="continue-placeholder-thumb">
                        <IconPlus />
                      </div>
                      <div class="continue-placeholder-body">
                        <span class="continue-placeholder-title">Empty Slot</span>
                        <span class="continue-placeholder-sub">Create or play a world</span>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </div>

        {/* News section */}
        <div class="section-label section-label--row">
          <span>Minecraft: Java Edition News</span>
          <div class="section-label-aside">
            <Show when={totalNewsPages() > 1}>
              <span class="news-page-count">Page {newsPage()} / {totalNewsPages()}</span>
            </Show>
            <span
              class="official-badge tip-below tip-right"
              data-tip="News pulled straight from Mojang's official launcher feed."
            >
              <IconShieldCheck />
              Official · Mojang
            </span>
          </div>
        </div>
        <Show when={news() && news()!.length > 0} fallback={
          <div style="color:var(--muted);font-size:12px;padding:14px;background:var(--surface-panel);border:1px solid var(--border)">
            Loading news...
          </div>
        }>
          <div class="news-grid" ref={newsPageSize.setEl}>
            <For each={visibleNews()}>
              {(article) => {
                const category = getNewsCategory(article);
                return (
                  <div class="news-card" onClick={() => openArticle(article)}>
                    <div class="news-card-thumb-wrap">
                      <img src={article.image_url} alt="" draggable={false} />
                      <span class={`news-card-tag ${category.tagClass}`}>
                        {category.label}
                      </span>
                    </div>
                    <div class="news-card-body">
                      <div class="news-card-title">{article.title}</div>
                      <div class="news-card-meta">
                        <div class="news-card-meta-left">
                          <Show when={formatArticleDate(article.date)}>
                            <span class="news-card-date">{formatArticleDate(article.date)}</span>
                          </Show>
                        </div>
                        <span class="news-card-read">
                          Read
                          <IconExternalLink />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>

      {/* News Detail Modal */}
      <Show when={selectedArticle()}>
        <div class="news-modal-overlay" onClick={() => setSelectedArticle(null)}>
          <div class="news-modal" onClick={(e) => e.stopPropagation()}>
            {/* Hero banner with blurred backdrop */}
            <Show
              when={selectedArticle()!.image_url}
              fallback={
                <div style="display:flex;align-items:center;padding:12px 14px 0">
                  <span class={`news-card-tag ${getNewsCategory(selectedArticle()!).tagClass}`} style="position:static">
                    {getNewsCategory(selectedArticle()!).label}
                  </span>
                </div>
              }
            >
              <div class="news-modal-hero">
                <div
                  class="news-modal-hero-bg"
                  style={`background-image:url(${selectedArticle()!.image_url})`}
                />
                <img
                  class="news-modal-hero-img"
                  src={selectedArticle()!.image_url}
                  alt=""
                  draggable={false}
                />
                <span class={`news-card-tag ${getNewsCategory(selectedArticle()!).tagClass}`}>
                  {getNewsCategory(selectedArticle()!).label}
                </span>
              </div>
            </Show>

            {/* Modal Header */}
            <div class="news-modal-header">
              <h2 class="news-modal-title">{selectedArticle()!.title}</h2>
              <Show when={formatArticleDate(selectedArticle()!.date)}>
                <div class="news-modal-badges">
                  <span class="news-card-date">
                    {formatArticleDate(selectedArticle()!.date)}
                  </span>
                </div>
              </Show>
            </div>

            {/* Modal Body */}
            <div class="news-modal-body" onClick={handleModalClick}>
              <Show
                when={selectedArticle()!.body}
                fallback={
                  <p>{selectedArticle()!.excerpt || "Read the full article on minecraft.net."}</p>
                }
              >
                <div
                  innerHTML={
                    articleBody() ||
                    (loadingArticle()
                      ? "<p style='color:var(--muted)'>Loading article...</p>"
                      : "<p style='color:var(--muted)'>No content available.</p>")
                  }
                />
              </Show>
            </div>

            {/* Modal Footer */}
            <div class="news-modal-footer">
              <Show
                when={selectedArticle()!.url}
                fallback={<div />}
              >
                <button
                  class="btn btn--subtle btn--sm"
                  onClick={() => openUrl(selectedArticle()!.url)}
                >
                  <IconExternalLink />
                  <span>Read on minecraft.net</span>
                </button>
              </Show>
              <button
                class="btn btn--primary btn--sm"
                onClick={() => setSelectedArticle(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default Home;
