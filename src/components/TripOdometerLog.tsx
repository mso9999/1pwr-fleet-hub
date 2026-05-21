"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { auth } from "@/lib/firebase";
import { mediaAttachmentFileUrl } from "@/lib/media-file-url";

interface OdoRow {
  id: string;
  odo_km: number;
  notes: string;
  recorded_at: string;
  recorded_by_name: string;
  media_id: string | null;
  media_file_name: string | null;
  media_mime_type: string | null;
}

interface TripOdometerLogProps {
  tripId: string;
  organizationId: string;
  odoStart: number;
  /** When false, show history only (checked-in trips). */
  active: boolean;
  recordedById: string;
  recordedByName: string;
}

export function TripOdometerLog({
  tripId,
  organizationId,
  odoStart,
  active,
  recordedById,
  recordedByName,
}: TripOdometerLogProps): React.ReactElement {
  const [rows, setRows] = useState<OdoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [odoKm, setOdoKm] = useState("");
  const [notes, setNotes] = useState("");
  const [recordedAt, setRecordedAt] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/trips/${tripId}/odometer-readings?org=${encodeURIComponent(organizationId)}`
      );
      if (!res.ok) {
        setRows([]);
        return;
      }
      const data = (await res.json()) as OdoRow[];
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tripId, organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    const km = parseInt(odoKm, 10);
    if (!Number.isFinite(km) || km < odoStart) {
      setError(`Enter a valid odometer (at least ${odoStart.toLocaleString()} km).`);
      return;
    }

    setSaving(true);
    const fd = new FormData();
    fd.set("organizationId", organizationId);
    fd.set("odoKm", String(km));
    fd.set("notes", notes.trim());
    if (recordedAt.trim()) fd.set("recordedAt", recordedAt);
    fd.set("recordedById", recordedById);
    fd.set("recordedByName", recordedByName);

    const fromGallery = fileRef.current?.files?.[0];
    const fromCamera = cameraRef.current?.files?.[0];
    const photo = fromGallery || fromCamera;
    if (photo) fd.set("photo", photo);

    const token = await auth.currentUser?.getIdToken();
    const headers: HeadersInit = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`/api/trips/${tripId}/odometer-readings`, {
      method: "POST",
      headers,
      body: fd,
    });
    setSaving(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error || "Could not save entry");
      return;
    }
    setOdoKm("");
    setNotes("");
    setRecordedAt("");
    if (fileRef.current) fileRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
    await load();
  }

  return (
    <div className="mt-3 rounded-lg border border-dashed border-blue-200 bg-white/80 p-3 space-y-3">
      <div className="text-xs font-semibold text-zinc-700 uppercase tracking-wide">Trip odometer log</div>
      <p className="text-xs text-zinc-500">
        {active
          ? "Log daily (or any) odometer readings while deployed — replaces ad-hoc WhatsApp photo threads. Add a gauge photo for verification."
          : "Odometer readings logged during this trip."}
      </p>

      {active && (
        <form onSubmit={(e) => void submit(e)} className="space-y-2">
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-2 py-1.5">{error}</div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              label="Odometer (km) *"
              type="number"
              min={odoStart}
              step={1}
              required
              value={odoKm}
              onChange={(e) => setOdoKm(e.target.value)}
              placeholder={`e.g. ${(odoStart + 50).toLocaleString()}`}
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">Reading time (optional)</span>
              <input
                type="datetime-local"
                value={recordedAt}
                onChange={(e) => setRecordedAt(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-700">Notes (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
              placeholder="e.g. Morning reading at site"
            />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={() => {
                if (cameraRef.current) cameraRef.current.value = "";
              }}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={() => {
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => cameraRef.current?.click()}>
              Take photo
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              Upload image
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save reading"}
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-xs text-zinc-400">Loading log…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-zinc-400">{active ? "No entries yet." : "No odometer readings were logged."}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex gap-2 text-xs border border-zinc-100 rounded-md p-2 bg-zinc-50/80"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-zinc-800">{r.odo_km.toLocaleString()} km</div>
                <div className="text-zinc-500">
                  {new Date(r.recorded_at).toLocaleString()}
                  {r.recorded_by_name ? ` · ${r.recorded_by_name}` : ""}
                </div>
                {r.notes ? <div className="text-zinc-600 mt-0.5 whitespace-pre-wrap">{r.notes}</div> : null}
              </div>
              {r.media_id && r.media_file_name && (
                <a
                  href={mediaAttachmentFileUrl({
                    entity_type: "trip_odo_reading",
                    entity_id: r.id,
                    file_name: r.media_file_name,
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaAttachmentFileUrl({
                      entity_type: "trip_odo_reading",
                      entity_id: r.id,
                      file_name: r.media_file_name,
                    })}
                    alt=""
                    className="w-14 h-14 rounded object-cover border border-zinc-200"
                  />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
