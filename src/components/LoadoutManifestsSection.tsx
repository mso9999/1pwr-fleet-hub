"use client";

/**
 * Load-out manifests from AM (Firestore `am_core_loadout_manifests`), linked by `trip_id` === FM trip id (SQLite).
 *
 * Manual test (no automated tests in this package yet):
 * - As Manager+ (permissionLevel ≥ 3): open Trips, expand a trip; section lists manifests with trip_id matching;
 *   paste a manifest doc id + optional label → Link → row appears; Open in AM opens correct view; Unlink clears association.
 * - As below Manager: list may load if rules allow read; link/unlink buttons hidden; direct Firestore update would show permission error.
 * - If Firestore rules deny reads: expect an error message (coordinate rules with AM — do not deploy unilaterally).
 */

import { useEffect, useState, useCallback } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const AM_MANIFEST_VIEW =
  "https://am.1pwrafrica.com/loadout/view.php";
const COLLECTION = "am_core_loadout_manifests";

/** AM Manager+ per shared Firestore rules; see docs/FM_LOADOUT_MANIFEST_INTEGRATION.md */
const MANAGER_PERMISSION_LEVEL = 3;

export interface LoadoutManifestRow {
  id: string;
  manifest_number?: string;
  title?: string;
  status?: string;
  destination_site_label?: string;
}

function firestoreErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: string }).code;
    if (code === "permission-denied") {
      return (
        "Permission denied. Manifest access in Asset Management requires appropriate Firestore rules " +
        "(typically Manager-level, permissionLevel ≥ 3). Coordinate with AM if your role should allow this."
      );
    }
    if (code === "not-found") {
      return "Manifest document not found. Check the ID from AM.";
    }
  }
  return err instanceof Error ? err.message : "Request failed";
}

export function LoadoutManifestsSection({
  tripId,
  tripLabel = "",
}: {
  tripId: string;
  /** Stored on the manifest as `trip_label` when linking */
  tripLabel?: string;
}): React.ReactElement {
  const { user } = useAuth();
  const canManage =
    (user?.permissionLevel ?? 0) >= MANAGER_PERMISSION_LEVEL;

  const [rows, setRows] = useState<LoadoutManifestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [manifestIdInput, setManifestIdInput] = useState("");
  const [labelInput, setLabelInput] = useState(tripLabel);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setLabelInput(tripLabel);
  }, [tripLabel]);

  useEffect(() => {
    if (!tripId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const q = query(
      collection(firestore, COLLECTION),
      where("trip_id", "==", tripId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(
          snap.docs.map((d) => {
            const data = d.data() as Record<string, unknown>;
            return {
              id: d.id,
              manifest_number:
                typeof data.manifest_number === "string"
                  ? data.manifest_number
                  : undefined,
              title: typeof data.title === "string" ? data.title : undefined,
              status: typeof data.status === "string" ? data.status : undefined,
              destination_site_label:
                typeof data.destination_site_label === "string"
                  ? data.destination_site_label
                  : undefined,
            };
          })
        );
        setLoadError(null);
        setLoading(false);
      },
      (err) => {
        setLoadError(firestoreErrorMessage(err));
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tripId]);

  const handleLink = useCallback(async () => {
    const manifestDocId = manifestIdInput.trim();
    if (!manifestDocId) {
      setActionError("Enter a manifest document ID from AM.");
      return;
    }
    setActionError(null);
    setBusyId("link");
    try {
      await updateDoc(doc(firestore, COLLECTION, manifestDocId), {
        trip_id: tripId,
        trip_label: labelInput.trim(),
        updated_at: new Date().toISOString(),
        linked_from_fm: true,
      });
      setManifestIdInput("");
      setLabelInput(tripLabel);
    } catch (e) {
      setActionError(firestoreErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }, [tripId, tripLabel, manifestIdInput, labelInput]);

  const handleUnlink = useCallback(
    async (manifestDocId: string) => {
      if (!confirm("Unlink this manifest from this trip? (You can link it again later.)")) {
        return;
      }
      setActionError(null);
      setBusyId(manifestDocId);
      try {
        await updateDoc(doc(firestore, COLLECTION, manifestDocId), {
          trip_id: "",
          trip_label: "",
          linked_from_fm: false,
          updated_at: new Date().toISOString(),
        });
      } catch (e) {
        setActionError(firestoreErrorMessage(e));
      } finally {
        setBusyId(null);
      }
    },
    []
  );

  return (
    <div
      className="rounded-lg border border-zinc-200 bg-white/80 p-4 space-y-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div>
        <div className="text-xs font-medium text-zinc-500 uppercase">
          Load-out manifests (AM)
        </div>
        <p className="text-xs text-zinc-500 mt-1">
          Packing lists live in Asset Management. Link by pasting the manifest document ID from AM;{" "}
          <code className="text-[11px] bg-zinc-100 px-1 rounded">trip_id</code> is set to this trip&apos;s ID.
        </p>
      </div>

      {loadError && (
        <p className="text-sm text-red-600" role="alert">
          {loadError}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading manifests…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No manifests linked to this trip.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium text-zinc-500 uppercase">
                <th className="pb-2 pr-3">Number</th>
                <th className="pb-2 pr-3">Title</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3 hidden sm:table-cell">Destination</th>
                <th className="pb-2 pr-3 w-40">AM</th>
                {canManage && <th className="pb-2 w-24"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100">
                  <td className="py-2 pr-3 font-medium">
                    {r.manifest_number || "—"}
                  </td>
                  <td className="py-2 pr-3 text-zinc-700">{r.title || "—"}</td>
                  <td className="py-2 pr-3">{r.status || "—"}</td>
                  <td className="py-2 pr-3 hidden sm:table-cell text-zinc-600">
                    {r.destination_site_label || "—"}
                  </td>
                  <td className="py-2 pr-3">
                    <a
                      href={`${AM_MANIFEST_VIEW}?id=${encodeURIComponent(r.id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Open in AM
                    </a>
                  </td>
                  {canManage && (
                    <td className="py-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        disabled={busyId === r.id}
                        onClick={() => handleUnlink(r.id)}
                      >
                        {busyId === r.id ? "…" : "Unlink"}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <div className="pt-2 border-t border-zinc-200 space-y-2">
          <div className="text-xs font-medium text-zinc-500 uppercase">
            Link manifest
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 items-end">
            <Input
              label="Manifest document ID"
              placeholder="Paste from AM"
              value={manifestIdInput}
              onChange={(e) => setManifestIdInput(e.target.value)}
            />
            <Input
              label="Trip label (optional)"
              placeholder={tripLabel || "e.g. vehicle + route + date"}
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => void handleLink()}
                disabled={busyId === "link"}
              >
                {busyId === "link" ? "Linking…" : "Link"}
              </Button>
            </div>
          </div>
          {actionError && (
            <p className="text-sm text-red-600" role="alert">
              {actionError}
            </p>
          )}
        </div>
      )}

      {!canManage && (
        <p className="text-xs text-zinc-400">
          Link and unlink require Manager-level access (permissionLevel ≥ {MANAGER_PERMISSION_LEVEL}).
        </p>
      )}
    </div>
  );
}
