import type { ReactNode } from "react";

export function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    today: (
      <>
        <path d="M8 2v4m8-4v4M3 10h18" />
        <rect x="3" y="4" width="18" height="17" rx="3" />
        <path d="m8 15 3 3 5-6" />
      </>
    ),
    family: (
      <>
        <circle cx="9" cy="7" r="3" />
        <path d="M2 21v-3a7 7 0 0 1 14 0v3m1-17a3 3 0 0 1 0 6m2 4a6 6 0 0 1 3 5v2" />
      </>
    ),
    benefits: (
      <>
        <path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    buddy: (
      <>
        <rect x="3" y="4" width="18" height="14" rx="5" />
        <path d="m7 18-1 4 5-4M8 10h.01M16 10h.01M8 14h8" />
      </>
    ),
    bell: (
      <>
        <path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5Zm5 3h4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="m10 3 4 0 1 3 3 1 3 3-1 4-3 1-1 3-3 3-4-1-1-3-3-1-3-3 1-4 3-1Z" />
      </>
    ),
    arrow: <path d="m9 5 7 7-7 7" />,
    plus: <path d="M12 5v14M5 12h14" />,
    more: (
      <>
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </>
    ),
    moon: <path d="M20.5 14.5A9 9 0 0 1 9.5 3.5a9 9 0 1 0 11 11Z" />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
      </>
    ),
    cloud: (
      <path d="M6 18a4 4 0 1 1 0-8 6 6 0 0 1 11.6-1A4.5 4.5 0 1 1 18 18Z" />
    ),
    rain: (
      <>
        <path d="M6 15a4 4 0 1 1 0-8 6 6 0 0 1 11.6-1A4.5 4.5 0 0 1 18 15" />
        <path d="m7 18-1 3m6-3-1 3m6-3-1 3" />
      </>
    ),
    drop: <path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z" />,
    walk: (
      <>
        <circle cx="14" cy="4" r="2" />
        <path d="m10 10 3-3 3 5 4 1m-7-6-2 8-4 6m4-6 5 6M6 12l4-2" />
      </>
    ),
    leaf: (
      <>
        <path d="M20 3C10 2 3 7 5 14c2 7 14 5 15-11Z" />
        <path d="M4 21c2-6 6-10 12-14" />
      </>
    ),
    warning: (
      <>
        <path d="m12 3 10 18H2Z" />
        <path d="M12 9v5m0 3h.01" />
      </>
    ),
    location: (
      <>
        <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
    heart: (
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
    ),
    check: <path d="m5 12 4 4L19 6" />,
    x: <path d="M6 6l12 12M18 6 6 18" />,
    car: (
      <>
        <path d="m5 8 2-5h10l2 5M3 10h18v9H3Z" />
        <path d="M6 19v2m12-2v2M6 13h2m8 0h2" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    pulse: (
      <>
        <path d="M3 12h4l2-5 3 10 2-5h7" />
      </>
    ),
    thermometer: (
      <>
        <path d="M10 14.7V5a2 2 0 0 1 4 0v9.7a4 4 0 1 1-4 0Z" />
        <path d="M12 9v8m5-11h2m-2 4h2" />
        <circle cx="12" cy="18" r="1" />
      </>
    ),
    lungs: (
      <>
        <path d="M12 3v8m0-3-4 4m4-4 4 4M8 8c-3 0-6 5-6 9 0 3 3 4 6 2V8Zm8 0c3 0 6 5 6 9 0 3-3 4-6 2V8Z" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </>
    ),
  };
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.clock}
    </svg>
  );
}
