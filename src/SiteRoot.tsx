import { Suspense, useEffect, useState, type ReactNode } from "react";
import LandingPage from "./LandingPage";

const isHome = () => ["/", "/index.html"].includes(window.location.pathname);

export default function SiteRoot({ children }: { children: ReactNode }) {
  const [home, setHome] = useState(isHome);
  useEffect(() => {
    const onHistory = () => setHome(isHome());
    window.addEventListener("popstate", onHistory);
    return () => window.removeEventListener("popstate", onHistory);
  }, []);
  useEffect(() => {
    document.title = home ? "Care Buddy — More room to care." : "Care Buddy";
    document.documentElement.classList.toggle("landing-active", home);
    return () => document.documentElement.classList.remove("landing-active");
  }, [home]);

  if (home) return <LandingPage />;
  return (
    <Suspense
      fallback={
        <main className="client-access-panel">
          <p role="status">Opening Care Buddy…</p>
        </main>
      }
    >
      {children}
    </Suspense>
  );
}
