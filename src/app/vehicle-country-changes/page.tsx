"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { auth } from "@/lib/firebase";
import { isExecutiveRole, isFleetManagementRole } from "@/lib/fleet-roles";

interface ChangeRequestRow {
  id: string;
  vehicle_id: string;
  vehicle_code: string;
  from_organization_id: string;
  to_organization_id: string;
  from_org_name: string;
  to_org_name: string;
  change_kind: string;
  reason: string;
  effective_date: string;
  expected_return_date: string;
  transfer_summary: string;
  status: string;
  requested_by_name: string;
  created_at: string;
}

function kindLabel(k: string): string {
  if (k === "data_correction") return "Data correction";
  if (k === "secondment") return "Secondment";
  if (k === "permanent_transfer") return "Permanent transfer";
  return k;
}

export default function VehicleCountryChangesPage(): React.ReactElement {
  const { organizationId, user } = useAuth();
  const [rows, setRows] = useState<ChangeRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const canFleet = user && isFleetManagementRole(user.role);
  const canExec = user && isExecutiveRole(user.role);

  const load = useCallback(() => {
    setLoading(true);
    void (async () => {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setRows([]);
        setLoading(false);
        return;
      }
      try {
        const r = await fetch(
          `/api/vehicle-country-change-requests?org=${encodeURIComponent(organizationId)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const d = await r.json();
        setRows(Array.isArray(d) ? (d as ChangeRequestRow[]) : []);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function approve(id: string): Promise<void> {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    setActionId(id);
    const res = await fetch(`/api/vehicle-country-change-requests/${id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    setActionId(null);
    if (res.ok) load();
  }

  async function reject(id: string): Promise<void> {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    const raw =
      typeof window !== "undefined" ? window.prompt("Rejection reason (optional)", "Rejected") : null;
    const reason = raw != null && raw.trim() ? raw.trim() : "Rejected";
    setActionId(id);
    const res = await fetch(`/api/vehicle-country-change-requests/${id}/reject`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason }),
    });
    setActionId(null);
    if (res.ok) load();
  }

  const pending = rows.filter((r) => r.status === "pending_fleet" || r.status === "pending_executive");

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold">Country / organization transfers</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Approve data corrections (fleet leadership) or cross-border transfers (C-level).{" "}
          <Link href="/vehicles" className="text-blue-600 hover:underline">
            Vehicles
          </Link>
        </p>
      </div>

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : pending.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-zinc-500 text-sm">No pending requests.</CardContent>
        </Card>
      ) : (
        <ul className="space-y-4">
          {pending.map((r) => {
            const needsFleet = r.status === "pending_fleet" && r.change_kind === "data_correction";
            const needsExec = r.status === "pending_executive";
            const showApprove =
              (needsFleet && canFleet) || (needsExec && canExec);
            const showReject =
              (needsFleet && canFleet) || (needsExec && canExec);

            return (
              <li key={r.id}>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">
                      {r.vehicle_code} → {r.to_org_name || r.to_organization_id}
                    </CardTitle>
                    <p className="text-xs text-zinc-500 font-normal">
                      {kindLabel(r.change_kind)} · Requested by {r.requested_by_name || "—"} ·{" "}
                      {new Date(r.created_at).toLocaleString()}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div>
                      <span className="text-zinc-500">From: </span>
                      {r.from_org_name || r.from_organization_id}
                    </div>
                    <div>
                      <span className="text-zinc-500">Explanation: </span>
                      {r.reason}
                    </div>
                    {r.change_kind !== "data_correction" && (
                      <>
                        {r.effective_date && (
                          <div>
                            <span className="text-zinc-500">Effective: </span>
                            {r.effective_date}
                          </div>
                        )}
                        {r.expected_return_date && (
                          <div>
                            <span className="text-zinc-500">Expected return: </span>
                            {r.expected_return_date}
                          </div>
                        )}
                        {r.transfer_summary && (
                          <div>
                            <span className="text-zinc-500">Transfer details: </span>
                            {r.transfer_summary}
                          </div>
                        )}
                      </>
                    )}
                    <div className="text-xs text-zinc-400">
                      {needsFleet && "Awaiting fleet lead / manager / admin approval."}
                      {needsExec && "Awaiting C-level / executive sign-off."}
                    </div>
                    {showApprove || showReject ? (
                      <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-zinc-100">
                        {showReject && (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={actionId === r.id}
                            onClick={() => void reject(r.id)}
                          >
                            {actionId === r.id ? "…" : "Reject"}
                          </Button>
                        )}
                        {showApprove && (
                          <Button type="button" disabled={actionId === r.id} onClick={() => void approve(r.id)}>
                            {actionId === r.id ? "…" : "Approve"}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500 pt-2">
                        {needsFleet && !canFleet && "Sign in as fleet lead, manager, or admin to approve corrections."}
                        {needsExec && !canExec && "Sign in with an executive role to approve transfers."}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && rows.length > pending.length && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent history</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-zinc-100 text-sm">
              {rows
                .filter((r) => r.status !== "pending_fleet" && r.status !== "pending_executive")
                .slice(0, 30)
                .map((r) => (
                  <li key={r.id} className="py-2 flex justify-between gap-2">
                    <span>
                      {r.vehicle_code} · {kindLabel(r.change_kind)} ·{" "}
                      <span className="text-zinc-500">{r.status}</span>
                    </span>
                    <span className="text-zinc-400 text-xs whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
