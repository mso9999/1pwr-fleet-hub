"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bearerAuthHeaders, jsonHeadersWithBearer } from "@/lib/client-bearer";

interface ScopeRow {
  user_id: string;
  organization_id: string;
  email: string;
  name: string;
  role: string;
  granted_by: string;
  granted_at: string;
}

/**
 * Admin / superadmin: who is fleet lead for this organization (user_fleet_lead_scopes).
 * A scope grants allocation and fleet-management edits in this org only, without
 * changing the user's role, so a manager keeps mission approval.
 */
export function FleetLeadScopesAdmin({ organizationId }: { organizationId: string }): React.ReactElement {
  const [rows, setRows] = useState<ScopeRow[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/admin/fleet-lead-scopes?org=${encodeURIComponent(organizationId)}`, {
        headers: await bearerAuthHeaders(),
      });
      const data = (await res.json().catch(() => ({}))) as { scopes?: ScopeRow[]; error?: string };
      if (cancelled) return;
      setRows(res.ok && Array.isArray(data.scopes) ? data.scopes : []);
      if (!res.ok) setMessage(data.error || "Could not load fleet leads.");
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, reloadKey]);

  async function grant(): Promise<void> {
    if (!email.trim()) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/fleet-lead-scopes", {
      method: "POST",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify({ email: email.trim(), organizationId }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error || `Grant failed (HTTP ${res.status}).`);
      return;
    }
    setEmail("");
    load();
  }

  async function revoke(row: ScopeRow): Promise<void> {
    if (!confirm(`Remove ${row.email} as fleet lead for ${row.organization_id}?`)) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch(
      `/api/admin/fleet-lead-scopes?email=${encodeURIComponent(row.email)}&org=${encodeURIComponent(row.organization_id)}`,
      { method: "DELETE", headers: await bearerAuthHeaders() }
    );
    setBusy(false);
    if (!res.ok) setMessage(`Revoke failed (HTTP ${res.status}).`);
    load();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Fleet leads (this country)</CardTitle>
        <p className="text-sm text-slate-500 font-normal mt-1">
          Fleet lead for this organization only: allocate vehicles, skip the outside-50-km inspection with a reason,
          and fleet-management edits. The user&apos;s role is unchanged, so a manager keeps mission approval. Users
          with role <code className="text-xs">fleet_lead</code> are fleet lead of their own organization without a
          row here.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">No fleet-lead grants for this organization.</p>
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <div key={`${row.user_id}-${row.organization_id}`} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1">
                  {row.name || row.email} <span className="text-slate-400">({row.email}, role {row.role})</span>
                </span>
                <span className="text-xs text-slate-400">
                  {row.granted_by ? `by ${row.granted_by}, ` : ""}
                  {row.granted_at}
                </span>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void revoke(row)}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-3 items-end">
          <Input
            label="User email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@1pwrafrica.com"
            className="w-72"
          />
          <Button type="button" disabled={busy || !email.trim()} onClick={() => void grant()}>
            Make fleet lead here
          </Button>
        </div>
        {message && <p className="text-sm text-red-600">{message}</p>}
      </CardContent>
    </Card>
  );
}
