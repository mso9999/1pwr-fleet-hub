/**
 * Driving distance via public OSRM demo server (no API key).
 * For heavy production use, replace with self-hosted OSRM or OpenRouteService + key.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export async function drivingDistanceKm(from: LatLng, to: LatLng): Promise<number | null> {
  const a = `${from.lng},${from.lat}`;
  const b = `${to.lng},${to.lat}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${a};${b}?overview=false`;
  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = (await res.json()) as { routes?: Array<{ distance?: number }> };
    const meters = data.routes?.[0]?.distance;
    if (typeof meters !== "number" || !Number.isFinite(meters)) return null;
    return Math.round((meters / 1000) * 10) / 10;
  } catch {
    return null;
  }
}
