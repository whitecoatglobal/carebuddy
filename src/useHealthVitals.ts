import { useEffect, useState } from "react";
import { fetchHealthVitals } from "./healthClient";
import type { HealthVitals } from "./types";

interface VitalsState {
  profileId: string;
  vitals: HealthVitals | null;
  loading: boolean;
  error: string;
}

export function useHealthVitals(profileId: string, enabled: boolean) {
  const [result, setResult] = useState<VitalsState>({
    profileId: "",
    vitals: null,
    loading: false,
    error: "",
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || !profileId) {
      setResult({ profileId: "", vitals: null, loading: false, error: "" });
      return;
    }
    let active = true;
    let busy = false;
    let controller: AbortController | undefined;
    const load = async () => {
      if (!active || busy) return;
      busy = true;
      controller = new AbortController();
      const signal = controller.signal;
      setResult((previous) => ({
        profileId,
        vitals: previous.profileId === profileId ? previous.vitals : null,
        loading: true,
        error: "",
      }));
      try {
        const vitals = await fetchHealthVitals(profileId, signal);
        if (active && !signal.aborted)
          setResult({ profileId, vitals, loading: false, error: "" });
      } catch (error) {
        if (active && !signal.aborted)
          setResult({
            profileId,
            vitals: null,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Health readings are unavailable.",
          });
      } finally {
        busy = false;
      }
    };
    const resume = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    void load();
    const timer = setInterval(resume, 60_000);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      active = false;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [profileId, enabled, attempt]);

  const current = enabled && result.profileId === profileId;
  return {
    vitals: current ? result.vitals : null,
    loading: enabled && (!current || result.loading),
    error: current ? result.error : "",
    onRetry: () => setAttempt((value) => value + 1),
  };
}
