import { useEffect, useRef, useState } from "react";
export function usePwa() {
  const [offline, setOffline] = useState(!navigator.onLine),
    [ready, setReady] = useState(false),
    [updateAvailable, setUpdateAvailable] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | null>(null),
    refreshRequested = useRef(false);
  useEffect(() => {
    const online = () => setOffline(!navigator.onLine);
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    let alive = true;
    const changed = () => {
      if (refreshRequested.current) location.reload();
    };
    if ("serviceWorker" in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.addEventListener("controllerchange", changed);
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`)
        .then((r) => {
          registration.current = r;
          if (r.waiting && alive) setUpdateAvailable(true);
          r.addEventListener("updatefound", () => {
            const worker = r.installing;
            worker?.addEventListener("statechange", () => {
              if (worker.state === "installed" && alive) {
                if (navigator.serviceWorker.controller)
                  setUpdateAvailable(true);
                else setReady(true);
              }
            });
          });
          navigator.serviceWorker.ready.then(() => {
            if (alive) setReady(true);
          });
        })
        .catch(() => {
          if (alive) setReady(false);
        });
    }
    return () => {
      alive = false;
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      navigator.serviceWorker?.removeEventListener("controllerchange", changed);
    };
  }, []);
  return {
    offline,
    ready,
    updateAvailable,
    refresh: () => {
      if (registration.current?.waiting) {
        refreshRequested.current = true;
        registration.current.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    },
  };
}
