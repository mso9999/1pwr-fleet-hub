/**
 * Canonical mission route text — matches vehicle-requests `missionRouteSummary`
 * (origin → ordered stops; destination column used only when no stop list).
 */

export type MissionRouteStopLike = {
  location?: string | null;
  stop_order?: number | null;
};

export function missionOriginLabel(departureLocation?: string | null): string {
  const origin = String(departureLocation || "").trim();
  return origin || "HQ";
}

export function formatMissionRouteSummary(args: {
  departureLocation?: string | null;
  destination?: string | null;
  stops?: MissionRouteStopLike[] | null;
  /** " -> " or " → " */
  separator?: string;
}): string {
  const sep = args.separator ?? " → ";
  const origin = missionOriginLabel(args.departureLocation);
  const dest = String(args.destination || "").trim();
  const ordered = [...(Array.isArray(args.stops) ? args.stops : [])].sort(
    (a, b) => (a.stop_order || 0) - (b.stop_order || 0)
  );
  const points = ordered.map((s) => String(s.location || "").trim()).filter(Boolean);
  if (points.length > 0) {
    const destLower = dest.toLowerCase();
    const hasDestInStops =
      dest !== "" && points.some((p) => p.toLowerCase() === destLower);
    if (dest && !hasDestInStops) {
      return [origin, dest, ...points].join(sep);
    }
    return [origin, ...points].join(sep);
  }
  return dest ? `${origin}${sep}${dest}` : origin;
}
