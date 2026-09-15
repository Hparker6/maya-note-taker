import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/brand";

/** Lets Edge, Chrome and Safari install the notebook as an app with its own icon and window. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: "Notebook",
    description: "Course notes, handwriting, study sheets, flashcards, calendar and grades.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f4ef",
    theme_color: "#2f5b4c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
