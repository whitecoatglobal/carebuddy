import { useEffect, useState } from "react";
import App from "./App";
import { checkClientAccess, getClientId } from "./syncClient";

export default function ClientAccessRoot() {
  const [status, setStatus] = useState<
    "checking" | "allowed" | "blocked" | "error"
  >("checking");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setStatus("checking");
    checkClientAccess()
      .then((allowed) => {
        if (active) setStatus(allowed ? "allowed" : "blocked");
      })
      .catch(() => {
        if (active) {
          setError(
            "Could not verify access. Check your connection and try again.",
          );
          setStatus("error");
        }
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  if (status === "allowed") return <App />;
  return (
    <main className="client-access-panel">
      <h1>CareBuddy</h1>
      {status === "checking" ? (
        <p role="status">Checking browser access…</p>
      ) : (
        <>
          <h2>
            {status === "blocked"
              ? "Access not enabled"
              : "Unable to check access"}
          </h2>
          <p>
            {status === "blocked"
              ? "Send this browser ID to the owner to enable access."
              : error}
          </p>
          <p>
            Browser ID: <code>{getClientId()}</code>
          </p>
          <button onClick={() => setAttempt((value) => value + 1)}>
            Check again
          </button>
        </>
      )}
    </main>
  );
}
