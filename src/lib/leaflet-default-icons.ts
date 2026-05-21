import type L from "leaflet";

/**
 * Leaflet's default marker looks for images at site root (`/marker-icon.png`), which 404s under Next.js.
 * Point defaults at the same version as our `leaflet` dependency (see package.json).
 */
export function fixLeafletDefaultIcons(Leaflet: typeof L): void {
  if (typeof window === "undefined") return;
  const CDN = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images";
  const proto = Leaflet.Icon.Default.prototype as unknown as { _getIconUrl?: () => string };
  delete proto._getIconUrl;
  Leaflet.Icon.Default.mergeOptions({
    iconRetinaUrl: `${CDN}/marker-icon-2x.png`,
    iconUrl: `${CDN}/marker-icon.png`,
    shadowUrl: `${CDN}/marker-shadow.png`,
  });
}
