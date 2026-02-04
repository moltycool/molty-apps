import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  formatDuration,
  sliceLeaderboard,
  type LeaderboardEntry,
  type LeaderboardResponse,
  type PublicConfig,
  type WeeklyLeaderboardEntry,
  type WeeklyLeaderboardResponse,
} from "@molty/shared";
import {
  buildAchievements,
  buildQuests,
  type Achievement,
  type Quest,
} from "./achievements";

const logoUrl = new URL("./assets/logo.svg", import.meta.url).toString();
const logoMaskStyle = { "--logo-mask": `url(${logoUrl})` } as CSSProperties;
const appVersion = __APP_VERSION__;

const initialOnboardingState = { wakawarsUsername: "", apiKey: "" };
const initialLoginState = { username: "", password: "" };
const initialPasswordState = { password: "", confirm: "" };

type SessionState = {
  authenticated: boolean;
  passwordSet: boolean;
  wakawarsUsername?: string;
  hasUser: boolean;
};

type VersionPayload = {
  version?: string;
  buildTime?: string;
};

type AddFriendCardProps = {
  docked?: boolean;
  dismissible?: boolean;
  onDismiss?: () => void;
  friendInput: string;
  onFriendInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  loading: boolean;
  errorMessage?: string | null;
};

const AddFriendCard = ({
  docked,
  dismissible,
  onDismiss,
  friendInput,
  onFriendInputChange,
  onSubmit,
  loading,
  errorMessage,
}: AddFriendCardProps) => (
  <section
    className={`panel add-friend-card ${docked ? "add-friend-dock" : ""}`}
  >
    <div className="panel-head">
      <div>
        <p className="eyebrow">Recruit</p>
        <h2>Draft a rival into your arena</h2>
        <p className="muted">Use their WakaTime username to sync stats.</p>
      </div>
      {dismissible && (
        <button
          type="button"
          className="icon-button small dismiss-button"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          x
        </button>
      )}
    </div>
    <form className="input-row" onSubmit={onSubmit}>
      <input
        type="text"
        value={friendInput}
        onChange={(event) => onFriendInputChange(event.target.value)}
        placeholder="rival-username"
        disabled={loading}
      />
      <button className="primary" type="submit" disabled={loading}>
        Recruit
      </button>
    </form>
    {errorMessage && <p className="form-error">{errorMessage}</p>}
  </section>
);

const App = () => {
  const [apiBase, setApiBase] = useState<string | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [stats, setStats] = useState<LeaderboardResponse | null>(null);
  const [yesterdayStats, setYesterdayStats] =
    useState<LeaderboardResponse | null>(null);
  const [weeklyStats, setWeeklyStats] =
    useState<WeeklyLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(() =>
    localStorage.getItem("wakawarsSession")
  );
  const [session, setSession] = useState<SessionState | null>(null);
  const [onboarding, setOnboarding] = useState(initialOnboardingState);
  const [login, setLogin] = useState(initialLoginState);
  const [passwordForm, setPasswordForm] = useState(initialPasswordState);
  const [friendInput, setFriendInput] = useState("");
  const [addFriendError, setAddFriendError] = useState<string | null>(null);
  const [groupNameInput, setGroupNameInput] = useState("");
  const [groupMemberInputs, setGroupMemberInputs] = useState<
    Record<number, string>
  >({});
  const [activeTab, setActiveTab] = useState<"league" | "settings">("league");
  const [activeLeagueTab, setActiveLeagueTab] = useState<"today" | "weekly">(
    "today"
  );
  const [authView, setAuthView] = useState<"welcome" | "signin" | "signup">(
    "welcome"
  );
  const authViewInitialized = useRef(false);
  const [showDockedAddFriend, setShowDockedAddFriend] = useState(() => {
    const stored = localStorage.getItem("wakawarsHideDockedAdd");
    return stored !== "true";
  });
  const [launchAtLogin, setLaunchAtLogin] = useState<boolean | null>(null);
  const [launchAtLoginStatus, setLaunchAtLoginStatus] = useState<string | null>(
    null
  );
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const stored = localStorage.getItem("wakawarsTheme");
    if (stored === "light" || stored === "dark") return stored;
    if (window.matchMedia?.("(prefers-color-scheme: light)").matches) {
      return "light";
    }
    return "dark";
  });

  const isAuthenticated = Boolean(session?.authenticated);
  const isConfigured = Boolean(config?.wakawarsUsername && config?.hasApiKey);
  const shouldIncludeWeekly =
    activeLeagueTab === "weekly" || Boolean(weeklyStats);

  const request = useCallback(
    async <T,>(path: string, options?: RequestInit): Promise<T> => {
      if (!apiBase) {
        throw new Error("Network error. Please try again.");
      }

      try {
        const response = await fetch(`${apiBase}${path}`, {
          ...options,
          headers: {
            "content-type": "application/json",
            ...(sessionId ? { "x-wakawars-session": sessionId } : {}),
            ...(options?.headers || {}),
          },
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const message =
            payload?.error || `Request failed (${response.status})`;
          throw new Error(message);
        }

        return response.json() as Promise<T>;
      } catch (error) {
        if (error instanceof TypeError) {
          throw new Error("Network error. Please try again.");
        }
        throw error;
      }
    },
    [apiBase, sessionId]
  );

  const checkForUpdates = useCallback(async () => {
    if (typeof window === "undefined") return;
    try {
      const base = import.meta.env.BASE_URL ?? "/";
      const normalizedBase = base.endsWith("/") ? base : `${base}/`;
      const versionUrl = new URL(
        `${normalizedBase}version.json`,
        window.location.origin
      );
      versionUrl.searchParams.set("t", String(Date.now()));
      const response = await fetch(versionUrl.toString(), { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as VersionPayload;
      if (!payload?.version) return;
      if (payload.version !== appVersion) {
        setUpdateAvailable(true);
        setLatestVersion(payload.version);
      } else {
        setUpdateAvailable(false);
        setLatestVersion(null);
      }
    } catch {
      // Ignore version check failures.
    }
  }, []);

  const loadSession = useCallback(async () => {
    try {
      const payload = await request<SessionState>("/session");
      setSession(payload);
      if (!payload.authenticated) {
        setSessionId(null);
        localStorage.removeItem("wakawarsSession");
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session");
    }
  }, [request]);

  const loadConfig = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const payload = await request<PublicConfig>("/config");
      setConfig(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load config");
    }
  }, [isAuthenticated, request]);

  const loadStats = useCallback(
    async ({
      silent = false,
      includeWeekly = false,
    }: {
      silent?: boolean;
      includeWeekly?: boolean;
    } = {}) => {
      if (!isConfigured || !isAuthenticated) return;
      if (!silent) {
        setLoading(true);
      }
      try {
        const tasks: Array<
          Promise<LeaderboardResponse | WeeklyLeaderboardResponse>
        > = [
          request<LeaderboardResponse>("/stats/today"),
          request<LeaderboardResponse>("/stats/yesterday"),
        ];

        if (includeWeekly) {
          tasks.push(request<WeeklyLeaderboardResponse>("/stats/weekly"));
        }

        const results = await Promise.allSettled(tasks);
        let nextError: string | null = null;

        const dailyResult = results[0];
        if (dailyResult.status === "fulfilled") {
          setStats(dailyResult.value as LeaderboardResponse);
        } else {
          nextError =
            dailyResult.reason instanceof Error
              ? dailyResult.reason.message
              : "Failed to load stats";
        }

        const yesterdayResult = results[1];
        if (yesterdayResult?.status === "fulfilled") {
          setYesterdayStats(yesterdayResult.value as LeaderboardResponse);
        }

        if (includeWeekly) {
          const weeklyResult = results[2];
          if (weeklyResult?.status === "fulfilled") {
            setWeeklyStats(weeklyResult.value as WeeklyLeaderboardResponse);
          } else if (weeklyResult?.status === "rejected") {
            if (activeLeagueTab === "weekly") {
              nextError =
                weeklyResult.reason instanceof Error
                  ? weeklyResult.reason.message
                  : "Failed to load weekly stats";
            }
          }
        }

        setError(nextError);
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [isConfigured, isAuthenticated, request, activeLeagueTab]
  );

  useEffect(() => {
    const envBase = import.meta.env.VITE_API_BASE as string | undefined;
    if (envBase) {
      setApiBase(envBase);
      return;
    }

    if (window.molty?.getApiBase) {
      window.molty
        .getApiBase()
        .then((base) => setApiBase(base))
        .catch((err) =>
          setError(err instanceof Error ? err.message : "Network error")
        );
      return;
    }

    const defaultBase = import.meta.env.DEV
      ? "http://localhost:3000/wakawars/v0"
      : "https://core.molty.cool/wakawars/v0";
    setApiBase(defaultBase);
  }, []);

  useEffect(() => {
    if (!window.molty?.getLoginItemSettings) return;
    window.molty
      .getLoginItemSettings()
      .then((settings) => {
        setLaunchAtLogin(settings.openAtLogin);
        setLaunchAtLoginStatus(settings.status ?? null);
      })
      .catch(() => {
        setLaunchAtLogin(null);
        setLaunchAtLoginStatus(null);
      });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("wakawarsTheme", theme);
  }, [theme]);

  useEffect(() => {
    checkForUpdates();
    const intervalId = window.setInterval(() => {
      checkForUpdates();
    }, 5 * 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, [checkForUpdates]);

  useEffect(() => {
    if (!apiBase) return;
    loadSession();
  }, [apiBase, loadSession]);

  useEffect(() => {
    if (!session) return;
    if (session.authenticated) {
      loadConfig();
    }
  }, [session, loadConfig]);

  useEffect(() => {
    if (!isConfigured || !isAuthenticated) return;
    loadStats({ includeWeekly: shouldIncludeWeekly });
  }, [isConfigured, isAuthenticated, shouldIncludeWeekly, loadStats]);

  useEffect(() => {
    if (!isConfigured || !isAuthenticated) return;
    const intervalId = window.setInterval(() => {
      loadStats({ silent: true, includeWeekly: shouldIncludeWeekly });
    }, 15 * 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, [isConfigured, isAuthenticated, shouldIncludeWeekly, loadStats]);

  useEffect(() => {
    if (session?.wakawarsUsername && !login.username) {
      setLogin((prev) => ({
        ...prev,
        username: session.wakawarsUsername ?? prev.username,
      }));
    }
  }, [session?.wakawarsUsername, login.username]);

  useEffect(() => {
    if (!session || authViewInitialized.current) return;
    if (session.hasUser && !session.authenticated) {
      setAuthView("signin");
    } else {
      setAuthView("welcome");
    }
    authViewInitialized.current = true;
  }, [session]);

  const handleOnboardingSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const payload = await request<{
        sessionId?: string;
        config: PublicConfig;
      }>("/config", {
        method: "POST",
        body: JSON.stringify(onboarding),
      });
      setConfig(payload.config);
      if (payload.sessionId) {
        setSessionId(payload.sessionId);
        localStorage.setItem("wakawarsSession", payload.sessionId);
        setSession({
          authenticated: true,
          passwordSet: false,
          wakawarsUsername: payload.config.wakawarsUsername,
          hasUser: true,
        });
      }
      setOnboarding(initialOnboardingState);
      setError(null);
      await loadStats({ silent: true, includeWeekly: shouldIncludeWeekly });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save config");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const payload = await request<{
        sessionId: string;
        wakawarsUsername: string;
        passwordSet: boolean;
      }>("/session/login", {
        method: "POST",
        body: JSON.stringify({
          username: login.username,
          password: login.password,
        }),
      });
      setSessionId(payload.sessionId);
      localStorage.setItem("wakawarsSession", payload.sessionId);
      setSession({
        authenticated: true,
        passwordSet: payload.passwordSet,
        wakawarsUsername: payload.wakawarsUsername,
        hasUser: true,
      });
      setLogin(initialLoginState);
      setError(null);
      await loadConfig();
      await loadStats({ silent: true, includeWeekly: shouldIncludeWeekly });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to login");
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (passwordForm.password !== passwordForm.confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await request<{ passwordSet: boolean }>("/password", {
        method: "POST",
        body: JSON.stringify({ password: passwordForm.password }),
      });
      setSession((prev) =>
        prev
          ? {
              ...prev,
              authenticated: true,
              passwordSet: true,
              hasUser: true,
            }
          : prev
      );

      setPasswordForm(initialPasswordState);
      await loadConfig();
      await loadStats({ silent: true, includeWeekly: shouldIncludeWeekly });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set password");
    } finally {
      setLoading(false);
    }
  };

  const handleAddFriend = async (event: FormEvent) => {
    event.preventDefault();
    if (!friendInput.trim()) return;

    setLoading(true);
    setAddFriendError(null);
    try {
      const payload = await request<PublicConfig>("/friends", {
        method: "POST",
        body: JSON.stringify({
          username: friendInput.trim(),
        }),
      });
      setConfig(payload);
      setFriendInput("");
      setError(null);
      setAddFriendError(null);
      await loadStats({ silent: true, includeWeekly: shouldIncludeWeekly });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to add friend";
      if (message === "Friend not found") {
        setAddFriendError(message);
        setError(null);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLaunchToggle = async (nextValue: boolean) => {
    const previousValue = launchAtLogin;
    setLaunchAtLogin(nextValue);
    if (!window.molty?.setLoginItemSettings) {
      return;
    }

    try {
      const settings = await window.molty.setLoginItemSettings(nextValue);
      setLaunchAtLogin(settings.openAtLogin);
      setLaunchAtLoginStatus(settings.status ?? null);
    } catch {
      setLaunchAtLogin(previousValue);
      setLaunchAtLoginStatus(null);
      setError("Unable to update settings.");
    }
  };

  const handleRemoveFriend = async (username: string) => {
    if (!username) return;
    setLoading(true);
    try {
      const payload = await request<PublicConfig>(
        `/friends/${encodeURIComponent(username)}`,
        {
          method: "DELETE",
        }
      );
      setConfig(payload);
      setError(null);
      await loadStats({ silent: true, includeWeekly: shouldIncludeWeekly });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove friend");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = groupNameInput.trim();
    if (!name) return;

    setLoading(true);
    try {
      const payload = await request<PublicConfig>("/groups", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setConfig(payload);
      setGroupNameInput("");
      setError(null);
      await loadStats({ silent: true, includeWeekly: shouldIncludeWeekly });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (groupId: number) => {
    if (!groupId) return;

    setLoading(true);
    try {
      const payload = await request<PublicConfig>(
        `/groups/${encodeURIComponent(String(groupId))}`,
        { method: "DELETE" }
      );
      setConfig(payload);
      setError(null);
      await loadStats({ silent: true, includeWeekly: shouldIncludeWeekly });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete group");
    } finally {
      setLoading(false);
    }
  };

  const handleAddGroupMember = async (
    event: FormEvent<HTMLFormElement>,
    groupId: number
  ) => {
    event.preventDefault();
    const value = groupMemberInputs[groupId]?.trim();
    if (!value) return;

    setLoading(true);
    try {
      const payload = await request<PublicConfig>(
        `/groups/${encodeURIComponent(String(groupId))}/members`,
        {
          method: "POST",
          body: JSON.stringify({ username: value }),
        }
      );
      setConfig(payload);
      setGroupMemberInputs((prev) => ({ ...prev, [groupId]: "" }));
      setError(null);
      await loadStats({ silent: true, includeWeekly: shouldIncludeWeekly });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to add group member"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveGroupMember = async (groupId: number, username: string) => {
    if (!groupId || !username) return;

    setLoading(true);
    try {
      const payload = await request<PublicConfig>(
        `/groups/${encodeURIComponent(
          String(groupId)
        )}/members/${encodeURIComponent(username)}`,
        { method: "DELETE" }
      );
      setConfig(payload);
      setError(null);
      await loadStats({ silent: true, includeWeekly: shouldIncludeWeekly });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to remove group member"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVisibilityChange = async (
    value: PublicConfig["statsVisibility"]
  ) => {
    if (!config || config.statsVisibility === value) return;

    setLoading(true);
    try {
      const payload = await request<PublicConfig>("/visibility", {
        method: "POST",
        body: JSON.stringify({ visibility: value }),
      });
      setConfig(payload);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update visibility"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setError(null);
    loadSession();
    loadConfig();
    loadStats({ silent: true, includeWeekly: shouldIncludeWeekly });
  };

  const handleRefresh = async () => {
    if (!isConfigured || !isAuthenticated || refreshing) return;
    setRefreshing(true);
    try {
      await request<LeaderboardResponse>("/stats/refresh", { method: "POST" });
      await loadStats({ silent: true, includeWeekly: shouldIncludeWeekly });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh stats");
    } finally {
      setRefreshing(false);
    }
  };

  const handleUpdate = () => {
    window.location.reload();
  };

  const lastUpdated = useMemo(() => {
    const updatedAt =
      activeLeagueTab === "weekly" ? weeklyStats?.updatedAt : stats?.updatedAt;
    if (!updatedAt) return "";
    const date = new Date(updatedAt);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [activeLeagueTab, stats?.updatedAt, weeklyStats?.updatedAt]);

  const hasStoredSession = Boolean(sessionId);
  const showMainLoading =
    hasStoredSession && (!session || (session.authenticated && !config));

  const weeklyRangeLabel = useMemo(() => {
    if (!weeklyStats?.range) return "Last 7 days";
    if (weeklyStats.range === "last_7_days") return "Last 7 days";
    if (weeklyStats.range === "this_week") return "This week";
    return weeklyStats.range.replace(/_/g, " ");
  }, [weeklyStats?.range]);

  const activeStats = activeLeagueTab === "weekly" ? weeklyStats : stats;
  const activeEntries: RowEntry[] = activeStats?.entries ?? [];

  const yesterdayPodium = useMemo(() => {
    if (!config?.wakawarsUsername || !yesterdayStats?.entries?.length) {
      return [];
    }
    return sliceLeaderboard(yesterdayStats.entries, config.wakawarsUsername, {
      podiumCount: 3,
    }).podium;
  }, [config?.wakawarsUsername, yesterdayStats?.entries]);

  const selfDailyEntry = useMemo(() => {
    if (!config?.wakawarsUsername || !stats?.entries) return null;
    return (
      stats.entries.find(
        (entry) => entry.username === config.wakawarsUsername
      ) ?? null
    );
  }, [config?.wakawarsUsername, stats?.entries]);

  const selfWeeklyEntry = useMemo(() => {
    if (!config?.wakawarsUsername || !weeklyStats?.entries) return null;
    return (
      weeklyStats.entries.find(
        (entry) => entry.username === config.wakawarsUsername
      ) ?? null
    );
  }, [config?.wakawarsUsername, weeklyStats?.entries]);

  const achievements = useMemo(
    () =>
      buildAchievements({
        config,
        dailyEntry: selfDailyEntry,
        weeklyEntry: selfWeeklyEntry,
      }),
    [config, selfDailyEntry, selfWeeklyEntry]
  );

  const quests = useMemo(
    () =>
      buildQuests({
        dailyEntry: selfDailyEntry,
        weeklyEntry: selfWeeklyEntry,
      }),
    [selfDailyEntry, selfWeeklyEntry]
  );

  const showLogin = Boolean(session?.hasUser && !session?.authenticated);
  const showAuth = !isAuthenticated;
  const showWelcome = showAuth && authView === "welcome";
  const showSignIn = showAuth && authView === "signin";
  const showSignUp = showAuth && authView === "signup";
  const canShowSettings = Boolean(isConfigured && isAuthenticated);
  const showSettings = Boolean(canShowSettings && activeTab === "settings");
  const passwordActionLabel = "Set password";
  const headerSubtitle = useMemo(() => {
    if (showSettings) return "War room";
    if (showAuth) {
      if (authView === "signin") return "Sign in";
      if (authView === "signup") return "Create account";
      return "Welcome";
    }
    return activeLeagueTab === "weekly" ? "Weekly clash" : "Daily arena";
  }, [showSettings, showAuth, authView, activeLeagueTab]);
  const canRefresh =
    !showAuth && !showSettings && isConfigured && isAuthenticated;
  const updateLabel = latestVersion ? `Update v${latestVersion}` : "Update";
  const updateButton = updateAvailable ? (
    <button
      type="button"
      className="primary update-button"
      onClick={handleUpdate}
      aria-label={
        latestVersion
          ? `Update to version ${latestVersion}`
          : "Update to the latest version"
      }
      title={
        latestVersion
          ? `Update to v${latestVersion}`
          : "Update to the latest version"
      }
    >
      {updateLabel}
    </button>
  ) : null;

  if (showMainLoading) {
    return (
      <div className="app">
        <header className="header">
          <div className="app-brand">
            <span
              className="app-brand-icon"
              role="img"
              aria-label="WakaWars logo"
            >
              <span
                className="app-brand-mark logo-mask"
                style={logoMaskStyle}
              />
            </span>
            <div className="brand-copy">
              <span className="brand-title">WakaWars</span>
              <span className="brand-sub">{headerSubtitle}</span>
            </div>
          </div>
          <div className="header-meta">{updateButton}</div>
        </header>
        {error && (
          <div className="error">
            <span>{error}</span>
            <button className="ghost tiny" onClick={handleRetry}>
              Retry
            </button>
          </div>
        )}
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Session</p>
              <h2>Restoring your arena</h2>
              <p className="muted">Syncing your latest battle stats.</p>
            </div>
          </div>
          <div className="loading-shimmer" aria-hidden="true" />
        </section>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app">
        <header className="header">
          <div className="app-brand">
            <span
              className="app-brand-icon"
              role="img"
              aria-label="WakaWars logo"
            >
              <span
                className="app-brand-mark logo-mask"
                style={logoMaskStyle}
              />
            </span>
            <div className="brand-copy">
              <span className="brand-title">WakaWars</span>
              <span className="brand-sub">{headerSubtitle}</span>
            </div>
          </div>
          <div className="header-meta">{updateButton}</div>
        </header>
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Loading</p>
              <h2>Preparing WakaWars</h2>
              <p className="muted">Warming up the arena.</p>
            </div>
          </div>
          <div className="loading-shimmer" aria-hidden="true" />
        </section>
      </div>
    );
  }

  const showDockedAdd = Boolean(
    showDockedAddFriend && isConfigured && isAuthenticated && !showSettings
  );

  return (
    <div className={`app ${showDockedAdd ? "has-docked-add" : ""}`}>
      {!showWelcome && (
        <header className="header">
          <div className="app-brand">
            <span
              className="app-brand-icon"
              role="img"
              aria-label="WakaWars logo"
            >
              <span
                className="app-brand-mark logo-mask"
                style={logoMaskStyle}
              />
            </span>
            <div className="brand-copy">
              <span className="brand-title">WakaWars</span>
              <span className="brand-sub">{headerSubtitle}</span>
            </div>
          </div>
          <div className="header-meta">
            {updateButton}
            {canRefresh && (
              <button
                type="button"
                className="icon-button ghost-button"
                onClick={handleRefresh}
                disabled={refreshing || loading}
                aria-label={refreshing ? "Refreshing stats" : "Refresh stats"}
              >
                ↻
              </button>
            )}
            {canShowSettings && (
              <button
                type="button"
                className={`icon-button ghost-button ${
                  activeTab === "settings" ? "active" : ""
                }`}
                onClick={() =>
                  setActiveTab((prev) =>
                    prev === "settings" ? "league" : "settings"
                  )
                }
                aria-label="Settings"
              >
                ⚙︎
              </button>
            )}
          </div>
        </header>
      )}

      {error && (
        <div className="error">
          <span>{error}</span>
          <button className="ghost tiny" onClick={handleRetry}>
            Retry
          </button>
        </div>
      )}

      {showWelcome ? (
        <section className="panel hero-panel">
          <div className="hero-center">
            <div className="app-logo" aria-hidden="true">
              <span
                className="app-logo-mark logo-mask"
                style={logoMaskStyle}
                aria-hidden="true"
              />
              <div className="logo-orbit" />
            </div>
            <p className="eyebrow">WAKAWARS</p>
            <h2>Forge your focus arena</h2>
            <p className="muted">
              Battle friends, win medals, and keep your WakaTime momentum
              visible.
            </p>
          </div>
          <div className="hero-actions">
            <button
              className="primary"
              type="button"
              onClick={() => setAuthView("signup")}
            >
              Enter arena
            </button>
            <button
              className="ghost"
              type="button"
              onClick={() => setAuthView("signin")}
            >
              Return
            </button>
          </div>
          <div className="feature-grid">
            <div className="feature-card">
              <h3>Daily skirmishes</h3>
              <p className="muted">
                See who leads today in minutes, not noise.
              </p>
            </div>
            <div className="feature-card">
              <h3>Weekly crowns</h3>
              <p className="muted">Track the long game with weekly averages.</p>
            </div>
            <div className="feature-card">
              <h3>Local-first</h3>
              <p className="muted">
                No logins, no cloud accounts, just your data.
              </p>
            </div>
          </div>
        </section>
      ) : showSignIn ? (
        <section className="panel form-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Sign in</p>
              <h2>Rejoin the arena</h2>
              <p className="muted">Use your WakaWars username and password.</p>
            </div>
            {!showLogin && (
              <button
                className="ghost tiny"
                type="button"
                onClick={() => setAuthView("welcome")}
              >
                Back
              </button>
            )}
          </div>
          <form className="stack" onSubmit={handleLogin}>
            <label>
              WakaWars username
              <input
                type="text"
                value={login.username}
                onChange={(event) =>
                  setLogin((prev) => ({
                    ...prev,
                    username: event.target.value,
                  }))
                }
                placeholder="wakawars-username"
                required
                disabled={loading}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={login.password}
                onChange={(event) =>
                  setLogin((prev) => ({
                    ...prev,
                    password: event.target.value,
                  }))
                }
                placeholder="password"
                disabled={loading}
              />
            </label>
            <button className="primary" type="submit" disabled={loading}>
              Sign in
            </button>
          </form>
          <div className="inline-action">
            <span className="muted">New here?</span>
            <button
              className="ghost tiny"
              type="button"
              onClick={() => setAuthView("signup")}
            >
              Create account
            </button>
          </div>
        </section>
      ) : showSignUp ? (
        <section className="panel form-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Create account</p>
              <h2>Start your campaign</h2>
              <p className="muted">
                Set a WakaWars username and connect your token.
              </p>
            </div>
            <button
              className="ghost tiny"
              type="button"
              onClick={() => setAuthView(showLogin ? "signin" : "welcome")}
            >
              Back
            </button>
          </div>
          <form className="stack" onSubmit={handleOnboardingSubmit}>
            <label>
              WakaWars username
              <input
                type="text"
                value={onboarding.wakawarsUsername}
                onChange={(event) =>
                  setOnboarding((prev) => ({
                    ...prev,
                    wakawarsUsername: event.target.value,
                  }))
                }
                placeholder="wakawars-username"
                required
                disabled={loading}
              />
            </label>
            <label>
              WakaTime token
              <input
                type="password"
                value={onboarding.apiKey}
                onChange={(event) =>
                  setOnboarding((prev) => ({
                    ...prev,
                    apiKey: event.target.value,
                  }))
                }
                placeholder="wakatime_token"
                required
                disabled={loading}
              />
            </label>
            <button className="primary" type="submit" disabled={loading}>
              Create account
            </button>
          </form>
          <div className="inline-action">
            <span className="muted">Already in the league?</span>
            <button
              className="ghost tiny"
              type="button"
              onClick={() => setAuthView("signin")}
            >
              Sign in
            </button>
          </div>
        </section>
      ) : showSettings ? (
        <>
          <section className="panel settings-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Profile</p>
                <h2>Player identity</h2>
                <p className="muted">Your WakaWars badge and token status.</p>
              </div>
            </div>
            <div className="settings-list">
              <div className="settings-row">
                <span className="muted">WakaWars username</span>
                <span>{config?.wakawarsUsername}</span>
              </div>
              <div className="settings-row">
                <span className="muted">API key</span>
                <span>{config?.hasApiKey ? "Connected" : "Missing"}</span>
              </div>
            </div>
          </section>

          <section className="panel settings-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Shield</p>
                <h2>Device shield</h2>
                <p className="muted">Keep this Mac locked to your squad.</p>
              </div>
            </div>
            {session?.passwordSet ? (
              <div className="settings-row">
                <span className="muted">Password</span>
                <span>Set</span>
              </div>
            ) : (
              <>
                <p className="muted">
                  Set a password to keep this Mac logged in.
                </p>
                <form className="stack" onSubmit={handleSetPassword}>
                  <label>
                    {passwordActionLabel}
                    <input
                      type="password"
                      value={passwordForm.password}
                      onChange={(event) =>
                        setPasswordForm((prev) => ({
                          ...prev,
                          password: event.target.value,
                        }))
                      }
                      placeholder="password"
                      required
                      disabled={loading}
                    />
                  </label>
                  <label>
                    Confirm password
                    <input
                      type="password"
                      value={passwordForm.confirm}
                      onChange={(event) =>
                        setPasswordForm((prev) => ({
                          ...prev,
                          confirm: event.target.value,
                        }))
                      }
                      placeholder="confirm password"
                      required
                      disabled={loading}
                    />
                  </label>
                  <button className="primary" type="submit" disabled={loading}>
                    {passwordActionLabel}
                  </button>
                </form>
              </>
            )}
          </section>

          <section className="panel settings-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Intel</p>
                <h2>Intel visibility</h2>
                <p className="muted">Choose who can see your stats.</p>
              </div>
            </div>
            <div className="visibility-grid">
              {[
                {
                  value: "everyone",
                  title: "Everyone",
                  description: "Anyone in your leagues can see your stats.",
                },
                {
                  value: "friends",
                  title: "Friends only",
                  description: "Only mutual friends or shared groups can view.",
                },
                {
                  value: "no_one",
                  title: "No one",
                  description: "Hide stats from everyone else.",
                },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`visibility-option ${
                    config?.statsVisibility === option.value ? "active" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="stats-visibility"
                    value={option.value}
                    checked={config?.statsVisibility === option.value}
                    onChange={() =>
                      handleVisibilityChange(
                        option.value as PublicConfig["statsVisibility"]
                      )
                    }
                    disabled={loading}
                  />
                  <div className="visibility-copy">
                    <span className="visibility-title">{option.title}</span>
                    <span className="muted">{option.description}</span>
                  </div>
                </label>
              ))}
            </div>
          </section>

          <section className="panel settings-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Rivals</p>
                <h2>Rival roster</h2>
                <p className="muted">
                  {config?.friends.length ?? 0} rivals on deck.
                </p>
              </div>
            </div>
            {config?.friends.length ? (
              <div className="settings-list">
                {config.friends.map((friend) => (
                  <div className="settings-row" key={friend.username}>
                    <span>{friend.username}</span>
                    <button
                      className="ghost danger tiny"
                      type="button"
                      onClick={() => handleRemoveFriend(friend.username)}
                      disabled={loading}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No rivals yet. Recruit them below.</p>
            )}
          </section>

          <section className="panel settings-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Squads</p>
                <h2>Squad lineup</h2>
                <p className="muted">
                  {config?.groups.length ?? 0} squads saved.
                </p>
              </div>
            </div>
            <form className="row group-create" onSubmit={handleCreateGroup}>
              <input
                type="text"
                placeholder="New group name"
                value={groupNameInput}
                onChange={(event) => setGroupNameInput(event.target.value)}
                disabled={loading}
              />
              <button className="primary" type="submit" disabled={loading}>
                Create
              </button>
            </form>
            {config?.groups.length ? (
              <div className="group-list">
                {config.groups.map((group) => (
                  <div className="group-block" key={group.id}>
                    <div className="group-header">
                      <div className="group-title">
                        <h3>{group.name}</h3>
                        <span className="muted">
                          {group.members.length} members
                        </span>
                      </div>
                      <button
                        className="ghost danger tiny"
                        type="button"
                        onClick={() => handleDeleteGroup(group.id)}
                        disabled={loading}
                      >
                        Delete
                      </button>
                    </div>
                    {group.members.length ? (
                      <div className="settings-list">
                        {group.members.map((member) => (
                          <div className="settings-row" key={member.id}>
                            <span>{member.username}</span>
                            <button
                              className="ghost danger tiny"
                              type="button"
                              onClick={() =>
                                handleRemoveGroupMember(
                                  group.id,
                                  member.username
                                )
                              }
                              disabled={loading}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="muted">No members yet.</p>
                    )}
                    <form
                      className="row group-add"
                      onSubmit={(event) =>
                        handleAddGroupMember(event, group.id)
                      }
                    >
                      <input
                        type="text"
                        placeholder="Add member by username"
                        value={groupMemberInputs[group.id] ?? ""}
                        onChange={(event) =>
                          setGroupMemberInputs((prev) => ({
                            ...prev,
                            [group.id]: event.target.value,
                          }))
                        }
                        disabled={loading}
                      />
                      <button
                        className="ghost"
                        type="submit"
                        disabled={loading}
                      >
                        Add
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">
                Create squads to add multiple rivals at once.
              </p>
            )}
          </section>

          <section className="panel settings-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Systems</p>
                <h2>Launch & style</h2>
                <p className="muted">Control launch behavior and theme.</p>
              </div>
            </div>
            <div className="settings-list">
              <div className="settings-row">
                <span className="muted">Launch at login</span>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(launchAtLogin)}
                    onChange={(event) =>
                      handleLaunchToggle(event.target.checked)
                    }
                    disabled={launchAtLogin === null}
                  />
                  <span className="toggle-ui" />
                </label>
              </div>
              <div className="settings-row">
                <span className="muted">Light theme</span>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={theme === "light"}
                    onChange={(event) =>
                      setTheme(event.target.checked ? "light" : "dark")
                    }
                  />
                  <span className="toggle-ui" />
                </label>
              </div>
            </div>
            {launchAtLoginStatus === "requires-approval" && (
              <p className="muted">
                macOS needs approval in System Settings &gt; General &gt; Login
                Items.
              </p>
            )}
            {launchAtLogin === null && (
              <p className="muted">
                Launch at login is available in the macOS app.
              </p>
            )}
          </section>

          <AddFriendCard
            friendInput={friendInput}
            onFriendInputChange={(value) => {
              setFriendInput(value);
              if (addFriendError) {
                setAddFriendError(null);
              }
            }}
            onSubmit={handleAddFriend}
            loading={loading}
            errorMessage={addFriendError}
          />
        </>
      ) : (
        <>
          <section className="panel league-panel">
            <div className="league-header">
              <div className="league-title">
                <span className="ribbon">Leaderboard</span>
                <h2>
                  <span>
                    {activeLeagueTab === "weekly" ? "Weekly" : "Daily"}
                  </span>
                </h2>
              </div>
              <div className="league-actions">
                <div className="tab-group">
                  <button
                    type="button"
                    className={`tab-button ${
                      activeLeagueTab === "today" ? "active" : ""
                    }`}
                    onClick={() => setActiveLeagueTab("today")}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    className={`tab-button ${
                      activeLeagueTab === "weekly" ? "active" : ""
                    }`}
                    onClick={() => setActiveLeagueTab("weekly")}
                  >
                    Week
                  </button>
                </div>
              </div>
            </div>
            {activeStats ? (
              activeEntries.length === 0 ? (
                <div className="empty-state">
                  <h3>No rivals yet</h3>
                  <p className="muted">
                    Recruit rivals to start your first clash.
                  </p>
                </div>
              ) : (
                <div className="league-content">
                  <div className="list-section primary">
                    <div className="list">
                      {activeLeagueTab === "weekly"
                        ? weeklyStats?.entries.map((entry) => (
                            <WeeklyLeaderboardRow
                              key={entry.username}
                              entry={entry}
                              isSelf={
                                entry.username === config?.wakawarsUsername
                              }
                            />
                          ))
                        : stats?.entries.map((entry) => (
                            <LeaderboardRow
                              key={entry.username}
                              entry={entry}
                              isSelf={
                                entry.username === config?.wakawarsUsername
                              }
                            />
                          ))}
                    </div>
                  </div>
                  <div className="league-grid">
                    <div className="league-side">
                      <div className="subcard podium-card">
                        <div className="subcard-header">
                          <h3>Yesterday's podium</h3>
                          <span className="muted">Top 3</span>
                        </div>
                        {yesterdayPodium.length ? (
                          <div className="mini-list">
                            {yesterdayPodium.map((entry) => (
                              <MiniRow
                                key={`podium-${entry.username}`}
                                entry={entry}
                                isSelf={
                                  entry.username === config?.wakawarsUsername
                                }
                              />
                            ))}
                          </div>
                        ) : (
                          <p className="muted">No ranked entries yet.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <p className="muted">
                {activeLeagueTab === "weekly"
                  ? "No weekly stats yet."
                  : "No stats yet."}
              </p>
            )}
          </section>
          {/* 
          <section className="panel achievement-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Achievements</p>
                <h2>Trophy vault</h2>
                <p className="muted">Unlock badges by building momentum.</p>
              </div>
            </div>
            <QuestCard quests={quests} />
            <div className="achievement-grid">
              {achievements.map((achievement) => (
                <AchievementCard
                  key={achievement.id}
                  achievement={achievement}
                />
              ))}
            </div>
          </section>
          */}
          {showDockedAdd && (
            <AddFriendCard
              docked
              dismissible
              onDismiss={() => {
                setShowDockedAddFriend(false);
                localStorage.setItem("wakawarsHideDockedAdd", "true");
              }}
              friendInput={friendInput}
              onFriendInputChange={(value) => {
                setFriendInput(value);
                if (addFriendError) {
                  setAddFriendError(null);
                }
              }}
              onSubmit={handleAddFriend}
              loading={loading}
              errorMessage={addFriendError}
            />
          )}
        </>
      )}
    </div>
  );
};

const statusLabel = (
  status: LeaderboardEntry["status"],
  totalSeconds: number
): string | null => {
  if (status === "ok") {
    return formatDuration(totalSeconds);
  }
  if (status === "private") {
    return "Private";
  }
  if (status === "not_found") {
    return "Not found";
  }
  return "Error";
};

const rankDisplay = (rank: number | null) => {
  return {
    rankLabel: rank ? `#${rank}` : "—",
    podiumClass: rank && rank <= 3 ? `podium podium-${rank}` : "",
  };
};

type RowEntry = LeaderboardEntry | WeeklyLeaderboardEntry;

const QuestCard = ({ quests }: { quests: Quest[] }) => (
  <div className="subcard quest-card">
    <div className="subcard-header">
      <h3>Battle quests</h3>
      <span className="muted">Daily objectives</span>
    </div>
    <div className="quest-list">
      {quests.map((quest) => (
        <div key={quest.id} className={`quest-item ${quest.status}`}>
          <div className="quest-copy">
            <span className="quest-title">{quest.title}</span>
            <span className="muted">{quest.description}</span>
          </div>
          <div className="quest-progress">
            <div className="progress-track small">
              <div
                className="progress-fill"
                style={{ width: `${Math.max(6, quest.progress * 100)}%` }}
              />
            </div>
            <span className="achievement-meta">{quest.progressLabel}</span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const AchievementCard = ({ achievement }: { achievement: Achievement }) => (
  <div className={`achievement-card ${achievement.status}`}>
    <div className="achievement-icon">{achievement.icon}</div>
    <div>
      <div className="achievement-title">{achievement.title}</div>
      <div className="achievement-desc muted">{achievement.description}</div>
    </div>
    <div className="achievement-progress">
      <div className="progress-track small">
        <div
          className="progress-fill"
          style={{ width: `${Math.max(6, achievement.progress * 100)}%` }}
        />
      </div>
      <span className="achievement-meta">{achievement.progressLabel}</span>
    </div>
  </div>
);

const MiniRow = ({ entry, isSelf }: { entry: RowEntry; isSelf: boolean }) => {
  const { rankLabel, podiumClass } = rankDisplay(entry.rank ?? null);
  const timeLabel = statusLabel(entry.status, entry.totalSeconds);
  const timeClass =
    entry.status === "ok" ? "mini-time" : "mini-time muted status";
  const displayName = isSelf ? `${entry.username} (you)` : entry.username;

  return (
    <div className={`mini-row ${podiumClass}`}>
      <span className="mini-rank">{rankLabel}</span>
      <span className="mini-name">{displayName}</span>
      <span className={timeClass}>{timeLabel ?? "—"}</span>
    </div>
  );
};

const BaseLeaderboardRow = ({
  entry,
  isSelf,
  secondary,
}: {
  entry: RowEntry;
  isSelf: boolean;
  secondary?: string | null;
}) => {
  const { rankLabel, podiumClass } = rankDisplay(entry.rank ?? null);
  const timeLabel = statusLabel(entry.status, entry.totalSeconds);
  const timeClass = entry.status === "ok" ? "time" : "time muted status";

  return (
    <div
      className={`row-item ${isSelf ? "self" : ""} ${podiumClass} status-${
        entry.status
      }`}
    >
      <div className="row-item-left">
        <div className="avatar">{entry.username.slice(0, 1).toUpperCase()}</div>
        <div className="row-content">
          <div className="row-title">
            <span>{entry.username}</span>
            {isSelf && <span className="badge">YOU</span>}
          </div>
          {secondary && (
            <div className="row-sub">
              <span>{secondary}</span>
            </div>
          )}
        </div>
      </div>
      <div className="row-meta">
        <div className="row-meta-top">
          {timeLabel && <span className={timeClass}>{timeLabel}</span>}
          <span className="rank-display">{rankLabel}</span>
        </div>
      </div>
    </div>
  );
};

const LeaderboardRow = ({
  entry,
  isSelf,
}: {
  entry: LeaderboardEntry;
  isSelf: boolean;
}) => {
  return <BaseLeaderboardRow entry={entry} isSelf={isSelf} />;
};

const WeeklyLeaderboardRow = ({
  entry,
  isSelf,
}: {
  entry: WeeklyLeaderboardEntry;
  isSelf: boolean;
}) => {
  const averageLabel =
    entry.status === "ok" ? formatDuration(entry.dailyAverageSeconds) : null;

  return (
    <BaseLeaderboardRow
      entry={entry}
      isSelf={isSelf}
      secondary={averageLabel ? `Avg ${averageLabel}/day` : null}
    />
  );
};

export default App;
