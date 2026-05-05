"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { dateRangesOverlap } from "@/lib/mission-reservations";

interface CalendarReservation {
  reservation_id: string;
  vehicle_id: string;
  mission_id: string;
  start_date: string;
  end_date: string;
  reservation_status: string;
  vehicle_code: string;
  mission_title: string;
  mission_destination: string;
  mission_departure_date: string;
  lifecycle_status: string;
  approval_status: string;
}

function monthBounds(y: number, m: number): { from: string; to: string; label: string } {
  const fromD = new Date(y, m, 1);
  const toD = new Date(y, m + 1, 0);
  const pad = (n: number): string => String(n).padStart(2, "0");
  const fmt = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const label = fromD.toLocaleString(undefined, { month: "long", year: "numeric" });
  return { from: fmt(fromD), to: fmt(toD), label };
}

export default function FleetReservationsPage(): React.ReactElement {
  const { organizationId } = useAuth();
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [rows, setRows] = useState<CalendarReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const { from, to, label } = useMemo(() => monthBounds(cursor.y, cursor.m), [cursor]);

  const load = useCallback(() => {
    if (!organizationId) return;
    setLoading(true);
    setErr(null);
    fetch(
      `/api/vehicle-reservations/calendar?org=${encodeURIComponent(organizationId)}&from=${from}&to=${to}`,
    )
      .then((r) => r.json())
      .then((d: { error?: string; reservations?: CalendarReservation[] }) => {
        if (d.error) throw new Error(d.error);
        setRows(Array.isArray(d.reservations) ? d.reservations : []);
      })
      .catch((e: Error) => setErr(e.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, [organizationId, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const overlapPairs = useMemo(() => {
    const out: Array<{ a: CalendarReservation; b: CalendarReservation }> = [];
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i];
        const b = rows[j];
        if (a.vehicle_id !== b.vehicle_id) continue;
        if (dateRangesOverlap(a.start_date, a.end_date, b.start_date, b.end_date)) {
          out.push({ a, b });
        }
      }
    }
    return out;
  }, [rows]);

  function prevMonth(): void {
    setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }));
  }

  function nextMonth(): void {
    setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }));
  }

  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.start_date.localeCompare(b.start_date) || a.vehicle_code.localeCompare(b.vehicle_code)),
    [rows],
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Reservation calendar</h1>
        <p className="text-sm text-zinc-600 mt-1">
          Active vehicle reservations for approved missions in the selected month. The fleet system blocks overlapping
          reservations when creating or updating holds; this view helps spot scheduling conflicts and plan capacity.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg capitalize">{label}</CardTitle>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={prevMonth}>
              Previous
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={nextMonth}>
              Next
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={load} disabled={loading}>
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
          )}
          {overlapPairs.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <strong>Overlapping active reservations</strong> detected for the same vehicle in this window (
              {overlapPairs.length} pair{overlapPairs.length === 1 ? "" : "s"}). This should not happen if enforcement
              is working; review data or contact an admin.
            </div>
          )}
          {loading && <p className="text-sm text-zinc-500">Loading reservations…</p>}
          {!loading && sorted.length === 0 && (
            <p className="text-sm text-zinc-500">No active reservations overlap this month.</p>
          )}
          {!loading && sorted.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-semibold uppercase text-zinc-600">
                    <th className="p-3">Vehicle</th>
                    <th className="p-3">Mission</th>
                    <th className="p-3">Reserved from</th>
                    <th className="p-3">Reserved to</th>
                    <th className="p-3">Mission status</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.reservation_id} className="border-b border-zinc-100 hover:bg-zinc-50/80">
                      <td className="p-3 font-medium text-zinc-900">{r.vehicle_code}</td>
                      <td className="p-3">
                        <div className="font-medium text-zinc-800">{r.mission_title || "—"}</div>
                        <div className="text-xs text-zinc-500">{r.mission_destination || "—"}</div>
                        <Link
                          href={`/vehicle-requests?highlight=${encodeURIComponent(r.mission_id)}`}
                          className="text-xs text-blue-600 underline"
                        >
                          Open mission
                        </Link>
                      </td>
                      <td className="p-3 whitespace-nowrap">{r.start_date}</td>
                      <td className="p-3 whitespace-nowrap">{r.end_date}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-xs capitalize">
                            {r.lifecycle_status?.replace(/-/g, " ") || "—"}
                          </Badge>
                          <Badge variant="outline" className="text-xs capitalize">
                            {r.approval_status?.replace(/-/g, " ") || "—"}
                          </Badge>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
