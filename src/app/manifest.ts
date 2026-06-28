import type { MetadataRoute } from "next";

/**
 * Web App Manifest — makes the portal installable ("Add to Home Screen")
 * and launchable as a standalone app on iOS/Android.
 *
 * `start_url: "/"` lets middleware route the installed app to the right
 * surface per role (member portal vs coach workspace) after auth. The
 * theme/background colors mirror the light `--background` token so the
 * splash + OS chrome match the paper aesthetic.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Higgins Tennis NL",
    short_name: "Higgins",
    description:
      "Book courts, manage lessons, and stay on top of your tennis schedule.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf9f3",
    theme_color: "#fbf9f3",
    categories: ["sports", "lifestyle"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
