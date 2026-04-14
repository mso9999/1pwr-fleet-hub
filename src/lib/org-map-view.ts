/**
 * Default map center/zoom for each operating company (matches header org selector).
 * Used when the fleet map has no marker bounds to fit (empty filter, no GPS points, etc.).
 */
export function getDefaultMapViewForOrganization(organizationId: string): {
  center: [number, number];
  zoom: number;
} {
  const byOrg: Record<string, { center: [number, number]; zoom: number }> = {
    "1pwr_lesotho": { center: [-29.4, 27.5], zoom: 8 },
    "1pwr_zambia": { center: [-14.3, 27.85], zoom: 6 },
    "1pwr_benin": { center: [9.2, 2.35], zoom: 7 },
  };
  return byOrg[organizationId] ?? byOrg["1pwr_lesotho"];
}
