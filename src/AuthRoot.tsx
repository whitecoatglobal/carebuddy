import { useEffect, useRef, useState, type FormEvent } from "react";
import App from "./App";
import {
  AccountApiError,
  accountRequest,
  type AccountBootstrap,
} from "./syncClient";
const LOGOUT_INTENT = "carebuddy.signout-pending-v1";
const ACCOUNT_EVENT = "carebuddy.account-event-v1";
function logoutIntent(value?: boolean) {
  try {
    if (value === true) localStorage.setItem(LOGOUT_INTENT, "true");
    else if (value === false) localStorage.removeItem(LOGOUT_INTENT);
    return localStorage.getItem(LOGOUT_INTENT) === "true";
  } catch {
    return false;
  }
}
function accountEvent() {
  try {
    localStorage.setItem(ACCOUNT_EVENT, String(Date.now()) + Math.random());
  } catch {
    /* Other tabs revalidate through the server. */
  }
}
function clearAccountCaches() {
  try {
    const raw = localStorage.getItem("care-buddy-demo-v1");
    const reference = localStorage.getItem("care-buddy.client-id");
    if (raw) {
      // Preserve unclaimed migration evidence outside the old app's readable record key.
      localStorage.setItem(
        "carebuddy.legacy-unclaimed-v1",
        JSON.stringify({
          raw,
          reference,
          capturedAt: new Date().toISOString(),
        }),
      );
    }
    for (const storage of [localStorage, sessionStorage])
      for (const key of Object.keys(storage))
        if (key.startsWith("care-buddy")) storage.removeItem(key);
  } catch {
    /* Storage may be unavailable. */
  }
}
export default function AuthRoot() {
  const [migrationReference] = useState(() => {
    try {
      return (
        localStorage.getItem("care-buddy.client-id") ||
        JSON.parse(
          localStorage.getItem("carebuddy.legacy-unclaimed-v1") || "null",
        )?.reference ||
        ""
      );
    } catch {
      return "";
    }
  });
  const [account, setAccount] = useState<AccountBootstrap | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [attempt, setAttempt] = useState(0);
  const epoch = useRef(0);
  const pendingLogout = useRef<AccountBootstrap | null>(null);
  useEffect(() => {
    const current = ++epoch.current;
    clearAccountCaches();
    setChecking(true);
    setError("");
    accountRequest<AccountBootstrap>("/api/auth/session")
      .then(async (result) => {
        if (current === epoch.current) {
          if (logoutIntent()) {
            pendingLogout.current = result;
            try {
              await accountRequest("/api/auth/logout", {}, result.csrfToken);
              if (current === epoch.current) {
                pendingLogout.current = null;
                logoutIntent(false);
              }
            } catch {
              if (current === epoch.current)
                setError(
                  "Your records are hidden. Reconnect to finish signing out.",
                );
            }
            return;
          }
          clearAccountCaches();
          setAccount(result);
        }
      })
      .catch((e) => {
        if (
          current === epoch.current &&
          e instanceof AccountApiError &&
          e.status === 401
        ) {
          logoutIntent(false);
          pendingLogout.current = null;
        }
        if (
          current === epoch.current &&
          !(e instanceof AccountApiError && e.status === 401)
        )
          setError(e.message);
      })
      .finally(() => {
        if (current === epoch.current) setChecking(false);
      });
    return () => {
      ++epoch.current;
    };
  }, [attempt]);
  const expired = () => {
    ++epoch.current;
    clearAccountCaches();
    setAccount(null);
    setPassword("");
    setBusy(false);
    setError("Your session ended. Sign in to continue.");
  };
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === ACCOUNT_EVENT) expired();
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  const authenticate = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const current = epoch.current;
    setBusy(true);
    setError("");
    try {
      const result = await accountRequest<AccountBootstrap>(
        "/api/auth/" + (register ? "register" : "login"),
        {
          username,
          password,
          ...(register
            ? {
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                ...(displayName.trim()
                  ? { displayName: displayName.trim() }
                  : {}),
              }
            : {}),
        },
      );
      accountEvent();
      if (current === epoch.current) {
        clearAccountCaches();
        setPassword("");
        pendingLogout.current = null;
        logoutIntent(false);
        setAccount(result);
      }
    } catch (e) {
      if (current === epoch.current) setError((e as Error).message);
    } finally {
      if (current === epoch.current) setBusy(false);
    }
  };
  const signOut = async () => {
    const leaving = account || pendingLogout.current;
    if (!leaving || busy) return;
    pendingLogout.current = leaving;
    logoutIntent(true);
    accountEvent();
    const current = ++epoch.current;
    clearAccountCaches();
    setAccount(null);
    setPassword("");
    setError("");
    setBusy(true);
    try {
      await accountRequest("/api/auth/logout", {}, leaving.csrfToken);
      if (current === epoch.current) {
        pendingLogout.current = null;
        logoutIntent(false);
        expired();
        setError("");
      }
    } catch (e) {
      if (current === epoch.current) {
        if (e instanceof AccountApiError && e.status === 401) expired();
        else
          setError(
            "Your records are hidden. Sign-out could not be confirmed; retry when connected.",
          );
      }
    } finally {
      if (current === epoch.current) setBusy(false);
    }
  };
  if (checking)
    return (
      <main className="auth-panel">
        <h1>Care Buddy</h1>
        <p role="status">Checking your account…</p>
      </main>
    );
  if (account)
    return (
      <>
        {migrationReference && (
          <aside
            className="migration-note"
            aria-label="Previous records migration"
          >
            Your previous records need a reviewed account migration. Account:{" "}
            <strong>{account.user.username}</strong>. Migration reference:{" "}
            <code>{migrationReference}</code>.
          </aside>
        )}
        <App
          key={account.user.id}
          bootstrap={account}
          onExpired={expired}
          onSignOut={signOut}
        />
        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}
      </>
    );
  return (
    <main className="auth-panel">
      <h1>Care Buddy</h1>
      <p>Sign in to your care records.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {pendingLogout.current && (
        <button onClick={signOut} disabled={busy}>
          Retry sign out
        </button>
      )}
      <button
        className="text-button"
        onClick={() => setAttempt((a) => a + 1)}
        disabled={busy}
      >
        Retry account connection
      </button>
      <form onSubmit={authenticate}>
        <h2>{register ? "Create account" : "Sign in"}</h2>
        <label className="field">
          Username
          <input
            autoComplete="username"
            disabled={busy}
            value={username}
            minLength={3}
            maxLength={64}
            required
            pattern="[a-zA-Z0-9._-]+"
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        {register && (
          <label className="field">
            Display name
            <input
              autoComplete="name"
              disabled={busy}
              value={displayName}
              maxLength={80}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
        )}
        <label className="field">
          Password
          <input
            type="password"
            disabled={busy}
            autoComplete={register ? "new-password" : "current-password"}
            value={password}
            minLength={register ? 12 : 1}
            maxLength={128}
            required
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {register && (
          <p className="helper">
            Use at least 12 characters. Your browser time zone will be used for
            your account.
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Connecting…" : register ? "Create account" : "Sign in"}
        </button>
      </form>
      <button
        disabled={busy}
        onClick={() => {
          setRegister(!register);
          setPassword("");
          setError("");
        }}
      >
        {register ? "Already have an account? Sign in" : "Create an account"}
      </button>
    </main>
  );
}
