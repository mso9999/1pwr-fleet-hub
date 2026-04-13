"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PvrRatesPayload {
  organizationId: string;
  snapshot: {
    fullPerKmLsl: number;
    halfPerKmLsl: number;
    hqBasisKm: number;
    hqFlatFullLsl: number;
    hqFlatHalfLsl: number;
  };
  source: "database" | "defaults";
  row: {
    fullPerKmLsl: number;
    halfPerKmLsl: number;
    hqBasisKm: number;
    updatedAt: string;
    updatedByName: string;
  } | null;
  defaults: {
    fullPerKmLsl: number;
    halfPerKmLsl: number;
    hqBasisKm: number;
    hqFlatFullLsl: number;
    hqFlatHalfLsl: number;
  };
}

export function PvrRatesAdmin({ organizationId }: { organizationId: string }): React.ReactElement {
  const [full, setFull] = useState("");
  const [half, setHalf] = useState("");
  const [basisKm, setBasisKm] = useState("");
  const [payload, setPayload] = useState<PvrRatesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const authHeader = useCallback(async (): Promise<Record<string, string>> => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const h = await authHeader();
      const res = await fetch(`/api/admin/pvr-rates?org=${encodeURIComponent(organizationId)}`, {
        headers: { ...h },
      });
      if (!res.ok) {
        setPayload(null);
        return;
      }
      const data = (await res.json()) as PvrRatesPayload;
      setPayload(data);
      const src = data.row;
      setFull(String(src?.fullPerKmLsl ?? data.defaults.fullPerKmLsl));
      setHalf(String(src?.halfPerKmLsl ?? data.defaults.halfPerKmLsl));
      setBasisKm(String(src?.hqBasisKm ?? data.defaults.hqBasisKm));
    } finally {
      setLoading(false);
    }
  }, [authHeader, organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const preview = useMemo(() => {
    const f = Number(full);
    const h = Number(half);
    const b = Number(basisKm);
    if (!Number.isFinite(f) || !Number.isFinite(h) || !Number.isFinite(b) || b <= 0) return null;
    return { hqFull: f * b, hqHalf: h * b };
  }, [full, half, basisKm]);

  async function save(): Promise<void> {
    setSaving(true);
    setMessage(null);
    try {
      const h = await authHeader();
      const res = await fetch("/api/admin/pvr-rates", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...h },
        body: JSON.stringify({
          organizationId,
          fullPerKmLsl: Number(full),
          halfPerKmLsl: Number(half),
          hqBasisKm: Number(basisKm),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || "Save failed.");
        return;
      }
      setMessage("Rates saved. New claims use this policy.");
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-violet-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Personal vehicle reimbursement — financial rates</CardTitle>
        <p className="text-sm text-slate-500 font-normal">
          Only users with the <code className="text-xs bg-slate-100 px-1 rounded">finance</code> or{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">superadmin</code> role can edit these values.
          Per-km and HQ round-trip flat amounts are derived from the same rules as spreadsheet F006.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-slate-400">Loading rates…</p>
        ) : !payload ? (
          <p className="text-sm text-red-600">Could not load rates (check sign-in).</p>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              Active source:{" "}
              <span className="font-medium">{payload.source === "database" ? "Saved policy" : "Built-in defaults (save to override)"}</span>
              {payload.row && (
                <span className="text-slate-500">
                  {" "}
                  · Last updated {payload.row.updatedAt} by {payload.row.updatedByName || "—"}
                </span>
              )}
            </p>
            <div className="grid sm:grid-cols-3 gap-4 items-end">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Full rate (LSL / km)</label>
                <Input value={full} onChange={(e) => setFull(e.target.value)} type="number" step="0.01" min="0" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Half rate (LSL / km)</label>
                <Input value={half} onChange={(e) => setHalf(e.target.value)} type="number" step="0.01" min="0" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">HQ round-trip basis (km)</label>
                <Input value={basisKm} onChange={(e) => setBasisKm(e.target.value)} type="number" step="1" min="1" />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              HQ round-trip flat preview: full = {preview ? preview.hqFull.toFixed(2) : "—"} LSL · half ={" "}
              {preview ? preview.hqHalf.toFixed(2) : "—"} LSL
            </p>
            {message && (
              <p
                className={`text-sm ${
                  /failed|Unauthorized|must be/i.test(message) ? "text-red-600" : "text-emerald-700"
                }`}
              >
                {message}
              </p>
            )}
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save rates"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
