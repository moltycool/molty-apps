import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { LeaderboardResponse, PublicConfig, LeaderboardEntry } from "@molty/shared";
import { formatDuration } from "@molty/shared";

const initialOnboardingState = { wakawarsUsername: "", apiKey: "" };
const initialLoginState = { username: "", password: "" };
const initialPasswordState = { password: "", confirm: "" };

type SessionState = {
  authenticated: boolean;
  passwordSet: boolean;
  wakawarsUsername?: string;
};

const App = () => {
  const [apiBase, setApiBase] = useState<string | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [stats, setStats] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(() =>
    localStorage.getItem("wakawarsSession")
  );
  const [session, setSession] = useState<SessionState | null>(null);
  const [onboarding, setOnboarding] = useState(initialOnboardingState);
  const [login, setLogin] = useState(initialLoginState);
  const [passwordForm, setPasswordForm] = useState(initialPasswordState);
  const [friendInput, setFriendInput] = useState("");
  const [activeTab, setActiveTab] = useState<"league" | "settings">("league");
  const [showDockedAddFriend, setShowDockedAddFriend] = useState(true);
  const [launchAtLogin, setLaunchAtLogin] = useState<boolean | null>(null);

  const isAuthenticated = Boolean(session?.authenticated || (!session?.passwordSet && session));
  const isConfigured = Boolean(config?.wakawarsUsername && config?.hasApiKey);

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
            ...(options?.headers || {})
          }
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const message = payload?.error || `Request failed (${response.status})`;
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

  const loadSession = useCallback(async () => {
    try {
      const payload = await request<SessionState>("/session");
      setSession(payload);
      if (payload.passwordSet && !payload.authenticated) {
        setSessionId(null);
        localStorage.removeItem("wakawarsSession");
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session");
    }
  }, [request]);

  const loadConfig = useCallback(async () => {
    try {
      const payload = await request<PublicConfig>("/config");
      setConfig(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load config");
    }
  }, [request]);

  const loadStats = useCallback(
    async (silent = false) => {
    if (!isConfigured || !isAuthenticated) return;
    if (!silent) {
      setLoading(true);
    }
    try {
      const payload = await request<LeaderboardResponse>("/stats/today");
      setStats(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  },
    [isConfigured, isAuthenticated, request]
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
        .catch((err) => setError(err instanceof Error ? err.message : "Network error"));
      return;
    }

    const defaultBase = import.meta.env.DEV
      ? "http://localhost:3000/wakawars/v0"
      : "https://wakawars.molty.app/wakawars/v0";
    setApiBase(defaultBase);
  }, []);

  useEffect(() => {
    if (!window.molty?.getLoginItemSettings) return;
    window.molty
      .getLoginItemSettings()
      .then((settings) => setLaunchAtLogin(settings.openAtLogin))
      .catch(() => setLaunchAtLogin(null));
  }, []);

  useEffect(() => {
    if (!apiBase) return;
    loadSession();
  }, [apiBase, loadSession]);

  useEffect(() => {
    if (!session) return;
    if (!session.passwordSet || session.authenticated) {
      loadConfig();
    }
  }, [session, loadConfig]);

  useEffect(() => {
    if (!isConfigured || !isAuthenticated) return;
    loadStats();
  }, [isConfigured, isAuthenticated, loadStats]);

  useEffect(() => {
    if (!isConfigured || !isAuthenticated) return;
    const intervalId = window.setInterval(() => {
      loadStats(true);
    }, 15 * 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, [isConfigured, isAuthenticated, loadStats]);

  useEffect(() => {
    if (session?.wakawarsUsername && !login.username) {
      setLogin((prev) => ({ ...prev, username: session.wakawarsUsername ?? prev.username }));
    }
  }, [session?.wakawarsUsername, login.username]);

  const handleOnboardingSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const payload = await request<PublicConfig>("/config", {
        method: "POST",
        body: JSON.stringify(onboarding)
      });
      setConfig(payload);
      setOnboarding(initialOnboardingState);
      setError(null);
      await loadSession();
      await loadStats(true);
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
      const payload = await request<{ sessionId: string; wakawarsUsername: string }>(
        "/session/login",
        {
          method: "POST",
          body: JSON.stringify({
            username: login.username,
            password: login.password
          })
        }
      );
      setSessionId(payload.sessionId);
      localStorage.setItem("wakawarsSession", payload.sessionId);
      setSession({
        authenticated: true,
        passwordSet: true,
        wakawarsUsername: payload.wakawarsUsername
      });
      setLogin(initialLoginState);
      setError(null);
      await loadConfig();
      await loadStats(true);
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
        body: JSON.stringify({ password: passwordForm.password })
      });

      if (config?.wakawarsUsername) {
        const loginPayload = await request<{ sessionId: string; wakawarsUsername: string }>(
          "/session/login",
          {
            method: "POST",
            body: JSON.stringify({
              username: config.wakawarsUsername,
              password: passwordForm.password
            })
          }
        );
        setSessionId(loginPayload.sessionId);
        localStorage.setItem("wakawarsSession", loginPayload.sessionId);
        setSession({
          authenticated: true,
          passwordSet: true,
          wakawarsUsername: loginPayload.wakawarsUsername
        });
      }

      setPasswordForm(initialPasswordState);
      await loadConfig();
      await loadStats(true);
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
    try {
      const payload = await request<PublicConfig>("/friends", {
        method: "POST",
        body: JSON.stringify({
          username: friendInput.trim()
        })
      });
      setConfig(payload);
      setFriendInput("");
      setError(null);
      await loadStats(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add friend");
    } finally {
      setLoading(false);
    }
  };

  const handleLaunchToggle = async (nextValue: boolean) => {
    setLaunchAtLogin(nextValue);
    if (!window.molty?.setLoginItemSettings) {
      return;
    }

    try {
      const settings = await window.molty.setLoginItemSettings(nextValue);
      setLaunchAtLogin(settings.openAtLogin);
    } catch {
      setError("Unable to update settings.");
    }
  };

  const handleRemoveFriend = async (username: string) => {
    setLoading(true);
    try {
      const payload = await request<PublicConfig>(`/friends/${encodeURIComponent(username)}`, {
        method: "DELETE"
      });
      setConfig(payload);
      setError(null);
      await loadStats(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove friend");
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setError(null);
    loadSession();
    loadConfig();
    loadStats(true);
  };

  const lastUpdated = useMemo(() => {
    if (!stats?.updatedAt) return "";
    const date = new Date(stats.updatedAt);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [stats?.updatedAt]);

  const showLogin = Boolean(session?.passwordSet && !session?.authenticated);
  const canShowSettings = Boolean(isConfigured && !showLogin);
  const showSettings = Boolean(canShowSettings && activeTab === "settings");
  const passwordActionLabel = "Set password";

  if (!session) {
    return (
      <div className="app">
        <header className="header">
          <div>
            <h1>WakaWars</h1>
          </div>
          <div className="header-meta" />
        </header>
        <section className="card">
          <h2>Loading</h2>
          <p className="muted">Preparing your WakaWars session...</p>
        </section>
      </div>
    );
  }

  const showDockedAdd = Boolean(
    showDockedAddFriend && isConfigured && !showLogin && !showSettings
  );

  const AddFriendCard = ({
    docked,
    dismissible,
    onDismiss
  }: {
    docked?: boolean;
    dismissible?: boolean;
    onDismiss?: () => void;
  }) => (
    <section className={`card ${docked ? "add-friend-dock" : ""}`}>
      <div className="section-header">
        <h2>Add a friend</h2>
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
      <form className="row add-friend-row" onSubmit={handleAddFriend}>
        <input
          type="text"
          value={friendInput}
          onChange={(event) => setFriendInput(event.target.value)}
          placeholder="username"
          disabled={loading}
        />
        <button className="primary" type="submit" disabled={loading}>
          Add
        </button>
      </form>
    </section>
  );

  return (
    <div className={`app ${showDockedAdd ? "has-docked-add" : ""}`}>
      <header className="header">
        <div>
          <h1>WakaWars</h1>
        </div>
        <div className="header-meta">
          {canShowSettings && (
            <button
              type="button"
              className={`icon-button ${activeTab === "settings" ? "active" : ""}`}
              onClick={() =>
                setActiveTab((prev) => (prev === "settings" ? "league" : "settings"))
              }
              aria-label="Settings"
            >
              ⚙︎
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="error">
          <span>{error}</span>
          <button className="ghost tiny" onClick={handleRetry}>
            Retry
          </button>
        </div>
      )}

      {showLogin ? (
        <section className="card">
          <h2>Welcome back</h2>
          <p className="muted">Enter your WakaWars credentials to unlock this device.</p>
          <form className="stack" onSubmit={handleLogin}>
            <label>
              WakaWars username
              <input
                type="text"
                value={login.username}
                onChange={(event) => setLogin((prev) => ({ ...prev, username: event.target.value }))}
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
                onChange={(event) => setLogin((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="password"
                required
                disabled={loading}
              />
            </label>
            <button className="primary" type="submit" disabled={loading}>
              Unlock
            </button>
          </form>
        </section>
      ) : !isConfigured ? (
        <section className="card">
          <h2>Get started</h2>
          <p className="muted">
            Create your WakaWars identity and connect your WakaTime API key.
          </p>
          <form className="stack" onSubmit={handleOnboardingSubmit}>
            <label>
              WakaWars username
              <input
                type="text"
                value={onboarding.wakawarsUsername}
                onChange={(event) =>
                  setOnboarding((prev) => ({ ...prev, wakawarsUsername: event.target.value }))
                }
                placeholder="wakawars-username"
                required
                disabled={loading}
              />
            </label>
            <label>
              WakaTime API key
              <input
                type="password"
                value={onboarding.apiKey}
                onChange={(event) =>
                  setOnboarding((prev) => ({ ...prev, apiKey: event.target.value }))
                }
                placeholder="api_key"
                required
                disabled={loading}
              />
            </label>
            <button className="primary" type="submit" disabled={loading}>
              Save
            </button>
          </form>
        </section>
      ) : showSettings ? (
        <>
          <section className="card">
            <h2>Account</h2>
            <div className="settings-row">
              <span className="muted">WakaWars username</span>
              <span>{config?.wakawarsUsername}</span>
            </div>
            <div className="settings-row">
              <span className="muted">API key</span>
              <span>{config?.hasApiKey ? "Connected" : "Missing"}</span>
            </div>
          </section>

          <section className="card">
            <h2>Security</h2>
            {session?.passwordSet ? (
              <div className="settings-row">
                <span className="muted">Password</span>
                <span>Set</span>
              </div>
            ) : (
              <>
                <p className="muted">Set a password to keep this Mac logged in.</p>
                <form className="stack" onSubmit={handleSetPassword}>
                  <label>
                    {passwordActionLabel}
                    <input
                      type="password"
                      value={passwordForm.password}
                      onChange={(event) =>
                        setPasswordForm((prev) => ({ ...prev, password: event.target.value }))
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
                        setPasswordForm((prev) => ({ ...prev, confirm: event.target.value }))
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

          <section className="card">
            <h2>System</h2>
            <div className="settings-row">
              <span className="muted">Launch at login</span>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={Boolean(launchAtLogin)}
                  onChange={(event) => handleLaunchToggle(event.target.checked)}
                  disabled={launchAtLogin === null}
                />
                <span className="toggle-ui" />
              </label>
            </div>
            {launchAtLogin === null && (
              <p className="muted">Launch at login is available in the macOS app.</p>
            )}
          </section>

          <AddFriendCard />
        </>
      ) : (
        <>
          <section className="card">
            <div className="section-header">
              <h2>Today</h2>
              {lastUpdated && <span className="muted">Updated {lastUpdated}</span>}
            </div>
            {stats ? (
              <div className="list">
                {stats.entries.map((entry) => (
                  <LeaderboardRow
                    key={entry.username}
                    entry={entry}
                    isSelf={entry.username === config?.wakawarsUsername}
                    onRemove={handleRemoveFriend}
                    disabled={loading}
                  />
                ))}
              </div>
            ) : (
              <p className="muted">No stats yet.</p>
            )}
          </section>
          {showDockedAdd && (
            <AddFriendCard
              docked
              dismissible
              onDismiss={() => setShowDockedAddFriend(false)}
            />
          )}
        </>
      )}
    </div>
  );
};

const statusLabel = (entry: LeaderboardEntry): string => {
  if (entry.status === "ok") {
    return formatDuration(entry.totalSeconds);
  }
  if (entry.status === "private") {
    return "Private";
  }
  if (entry.status === "not_found") {
    return "Not found";
  }
  return "Error";
};

const LeaderboardRow = ({
  entry,
  isSelf,
  onRemove,
  disabled
}: {
  entry: LeaderboardEntry;
  isSelf: boolean;
  onRemove: (username: string) => void;
  disabled: boolean;
}) => {
  const medal =
    entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : null;
  const podiumClass =
    entry.rank && entry.rank <= 3 ? `podium podium-${entry.rank}` : "";
  const rankLabel = medal ?? (entry.rank ? `#${entry.rank}` : "—");

  return (
    <div className={`row-item ${isSelf ? "self" : ""} ${podiumClass}`}>
      <div className="avatar">{entry.username.slice(0, 1).toUpperCase()}</div>
      <div className="row-content">
        <div className="row-title">
          <span>{entry.username}</span>
        </div>
      </div>
      <div className="row-meta">
        <div className="row-meta-top">
          <span className="rank-display">{rankLabel}</span>
          <span className="time">{statusLabel(entry)}</span>
        </div>
        {!isSelf && (
          <button
            className="ghost tiny"
            onClick={() => onRemove(entry.username)}
            disabled={disabled}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
};

export default App;
