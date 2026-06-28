"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (`/sw.js`) for installable-PWA + offline
 * support. Production only — registering during dev fights Turbopack HMR
 * and can serve stale chunks. Safe no-op where SW is unsupported.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failures are non-fatal — the app still works online.
      });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
