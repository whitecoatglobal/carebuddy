import { useEffect, useState } from "react";
import type { Profile } from "./types";
import { Icon } from "./Icon";
import { isSyncEnabled } from "./syncClient";
import {
  downloadAssistantPlugin,
  fetchConnections,
  revokeAssistantConnection,
  type AssistantTarget,
  type AssistantConnection,
} from "./integrationClient";
import "./assistantExport.css";

const assistantName = (target: AssistantTarget) =>
  target === "codex" ? "Codex" : "Claude";
function connectionStatus(connection: AssistantConnection) {
  return connection.revokedAt
    ? "Revoked"
    : Date.parse(connection.expiresAt) <= Date.now()
      ? "Expired"
      : "Active";
}
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Singapore",
  }).format(new Date(date));

export function AssistantExport({
  clientId,
  profiles,
  selectedProfileId,
  onBack,
}: {
  clientId: string;
  profiles: Profile[];
  selectedProfileId: string;
  onBack: () => void;
}) {
  const [target, setTarget] = useState<AssistantTarget>("codex");
  const [people, setPeople] = useState<string[]>([selectedProfileId]);
  const [includeHealth, setIncludeHealth] = useState(true);
  const [connections, setConnections] = useState<AssistantConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const visible = profiles.filter((p) => p.canView);
  const chosen = people.filter((id) => visible.some((p) => p.id === id));
  const connected = isSyncEnabled();
  useEffect(() => {
    if (!connected) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetchConnections(clientId, controller.signal)
      .then(setConnections)
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [clientId, reload, connected]);
  async function download() {
    setBusy("download");
    setError("");
    setNotice("");
    try {
      await downloadAssistantPlugin(clientId, target, chosen, includeHealth);
      setNotice(
        `${assistantName(target)} plugin downloaded. Follow the setup steps below to enable monitoring.`,
      );
      setReload((value) => value + 1);
    } catch (err) {
      setError((err as Error).message);
      setReload((value) => value + 1);
    } finally {
      setBusy("");
    }
  }
  async function revoke(id: string) {
    setBusy(id);
    setError("");
    setNotice("");
    try {
      await revokeAssistantConnection(clientId, id);
      setNotice(
        "Connection revoked. The assistant can no longer read new care notifications.",
      );
      setReload((value) => value + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="assistant-export">
      <button className="text-button sleep-back" onClick={onBack}>
        <span aria-hidden="true">←</span> Back to Settings
      </button>
      <div className="assistant-heading">
        <span className="eyebrow">CARE, WHERE YOU WORK</span>
        <h1>Connect your AI assistant</h1>
        <p className="lead">
          Let care reminders find you in Codex or Claude. A personal plugin
          keeps your assistant connected to your saved care.
        </p>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
          <button
            onClick={() => {
              setError("");
              setReload((value) => value + 1);
            }}
          >
            Retry connection list
          </button>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          <Icon name="check" />
          {notice}
        </div>
      )}
      {!connected && (
        <p className="notice">
          Plugin export is available in the connected CareBuddy app.
        </p>
      )}
      <div className="assistant-layout">
        <section className="assistant-panel" aria-labelledby="export-heading">
          <div className="assistant-panel-title">
            <div className="assistant-symbol">
              <Icon name="buddy" />
            </div>
            <div>
              <span className="eyebrow">YOUR PERSONAL PLUGIN</span>
              <h2 id="export-heading">Take CareBuddy with you</h2>
            </div>
          </div>
          <fieldset disabled={!!busy || !connected}>
            <legend>Choose your assistant</legend>
            <div className="assistant-choice">
              {(["codex", "claude"] as const).map((value) => (
                <label className={target === value ? "chosen" : ""} key={value}>
                  <input
                    type="radio"
                    name="assistant"
                    value={value}
                    checked={target === value}
                    onChange={() => setTarget(value)}
                  />
                  <span>
                    <strong>{assistantName(value)}</strong>
                    <small>
                      {value === "codex"
                        ? "Desktop plugin & scheduled checks"
                        : "Upload plugin & scheduled checks"}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={!!busy || !connected}>
            <legend>People to connect</legend>
            <p className="helper">Choose whose care your assistant can read.</p>
            <div className="assistant-people">
              {visible.map((p) => (
                <label key={p.id}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(p.id)}
                    onChange={(e) =>
                      setPeople(
                        e.target.checked
                          ? [...chosen, p.id]
                          : chosen.filter((id) => id !== p.id),
                      )
                    }
                  />
                  <span>
                    <strong>{p.displayName}</strong>
                    <small>{p.relationship}</small>
                  </span>
                </label>
              ))}
            </div>
            {!visible.length && (
              <p className="helper">Add a care profile to get started.</p>
            )}
          </fieldset>
          <div className="assistant-alert-types">
            <div>
              <Icon name="bell" />
              <span>
                <strong>Care reminders & appointments</strong>
                <small>
                  Due routines, upcoming visits and saved care alerts.
                </small>
              </span>
              <span className="assistant-included">Included</span>
            </div>
            <label>
              <input
                type="checkbox"
                checked={includeHealth}
                disabled={!!busy || !connected}
                onChange={(e) => setIncludeHealth(e.target.checked)}
              />
              <span>
                <strong>Health-reading alerts</strong>
                <small>
                  Flag saved readings outside general adult reference ranges or
                  older than 24 hours. Demo readings stay labelled.
                </small>
              </span>
            </label>
          </div>
          <button
            className="primary assistant-download"
            disabled={
              !connected ||
              loading ||
              !!busy ||
              !chosen.length ||
              chosen.length > 10
            }
            onClick={() => void download()}
          >
            <Icon name="plus" />
            {busy === "download"
              ? "Preparing your plugin…"
              : `Download ${assistantName(target)} plugin`}
          </button>
          <p className="helper assistant-private">
            <Icon name="benefits" />
            <span>
              The download contains a private connection key. Keep it private.
              Access lasts 90 days and can be revoked below.
            </span>
          </p>
        </section>
        <aside className="assistant-setup" aria-labelledby="setup-heading">
          <span className="eyebrow">A GENTLE NUDGE, IN YOUR ASSISTANT</span>
          <h2 id="setup-heading">Set it up in three steps</h2>
          <ol>
            <li>
              <strong>
                {target === "codex"
                  ? "Download & extract"
                  : "Download your plugin"}
              </strong>
              <p>
                {target === "codex"
                  ? "Keep the care-buddy-export folder on your computer. The ZIP includes its full setup guide."
                  : "Keep the ZIP ready to upload. Claude Code users can extract it; the setup guide covers both options."}
              </p>
            </li>
            <li>
              <strong>Add the plugin</strong>
              <p>
                {target === "codex"
                  ? "Open the extracted folder in Codex, restart the app, then enable CareBuddy from its local plugin marketplace."
                  : "In Claude, open Customize → Plugins and upload your custom plugin ZIP. Enable CareBuddy and its connection."}
              </p>
            </li>
            <li>
              <strong>Start your care check-ins</strong>
              <p>
                {target === "codex"
                  ? "Ask Codex to check CareBuddy and monitor in the background every 15 minutes."
                  : "Ask Claude for a care check, then schedule recurring checks using an available cadence in Scheduled."}
              </p>
              <code>
                {target === "codex"
                  ? "Use CareBuddy to check my care notifications, then monitor every 15 minutes."
                  : "Use CareBuddy to check my care notifications, then schedule hourly check-ins."}
              </code>
            </li>
          </ol>
          <div className="assistant-running-note">
            <Icon name="leaf" />
            <p>
              {target === "codex"
                ? "Local scheduled checks need your computer on and the desktop app running."
                : "Claude scheduled tasks need the plugin connected and a supported plan. In Claude Code, /loop checks need the session running."}{" "}
              Enable assistant notifications to receive prompts outside the app.
              Installing the plugin does not start a schedule.
            </p>
          </div>
          {target === "claude" && (
            <details className="assistant-code-setup">
              <summary>Using Claude Code instead?</summary>
              <p className="helper">
                Extract the ZIP, start Claude with the plugin folder, then run a
                session check every 15 minutes.
              </p>
              <code>
                claude --plugin-dir ./care-buddy-claude-plugin
                <br />
                /loop 15m /care-buddy:care-monitor
              </code>
            </details>
          )}
          <p className="helper">
            Reads saved care data and remembers delivered alerts. It cannot edit
            your routines, appointments or readings. General reference ranges
            can differ from your clinician’s targets; polling is not emergency
            monitoring.
          </p>
        </aside>
      </div>
      <section
        className="assistant-connections"
        aria-labelledby="connections-heading"
      >
        <div>
          <span className="eyebrow">YOU’RE IN CONTROL</span>
          <h2 id="connections-heading">Your connections</h2>
          <p className="helper">
            Revoke access at any time. To change people or alert types, download
            a new plugin and revoke the previous connection.
          </p>
        </div>
        {loading ? (
          <p role="status">Loading connections…</p>
        ) : !connections.length ? (
          <p className="assistant-empty">
            Your assistant connections will appear here after your first export.
          </p>
        ) : (
          connections.map((connection) => (
            <div className="assistant-connection" key={connection.id}>
              <div>
                <strong>{assistantName(connection.target)}</strong>
                <span
                  className={`assistant-connection-state ${connectionStatus(connection).toLowerCase()}`}
                >
                  {connectionStatus(connection)}
                </span>
                <p>
                  {connection.profileNames.join(", ")}
                  {connection.includeHealth
                    ? " · Health alerts on"
                    : " · Care reminders only"}
                </p>
                <small>
                  Added {dateLabel(connection.createdAt)} · Expires{" "}
                  {dateLabel(connection.expiresAt)}
                </small>
              </div>
              {connectionStatus(connection) === "Active" && (
                <button
                  className="danger-text"
                  disabled={!!busy}
                  onClick={() => void revoke(connection.id)}
                >
                  {busy === connection.id ? "Revoking…" : "Revoke access"}
                </button>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
