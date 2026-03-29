import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "1PWR Fleet Hub",
    short_name: "Fleet Hub",
    description: "Fleet management for 1PWR vehicles — check-ins, inspections, work orders",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#1e293b",
    icons: [
      {
        src: "/favicon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
