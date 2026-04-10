"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";

interface DailyPayload {
  date: string;
  headline: string;
  markdown: string;
  plainText: string;
  items: unknown[];
}

export default function DailyUpdatePage(): React.ReactElement {
  const { organizationId } = useAuth();
  const [date, setDate] = useState(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  });
  const [data, setData] = useState<DailyPayload | null>(null);
  const [edited, setEdited] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchPayload = useCallback(async (): Promise<DailyPayload> => {
    const r = await fetch(`/api/daily-update?org=${organizationId}&date=${date}`);
    return r.json() as Promise<DailyPayload>;
  }, [organizationId, date]);

  const requestIdRef = useRef(0);

  useEffect(() => {
    const id = ++requestIdRef.current;
    fetchPayload().then((d) => {
      if (requestIdRef.current !== id) return;
      setData(d);
      setEdited(d.plainText);
    });
  }, [fetchPayload]);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchPayload()
      .then((d) => {
        setData(d);
        setEdited(d.plainText);
      })
      .finally(() => setLoading(false));
  }, [fetchPayload]);

  async function copyToClipboard(): Promise<void> {
    try {
      await navigator.clipboard.writeText(edited);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-zinc-900">Daily update generator</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Compiled from work order status changes and progress notes for the selected day. The snapshot highlights 4WD and cargo trucks; plant, tractors, trailers, and mobile equipment appear only when they have activity that day. Edit before pasting to WhatsApp.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Date</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        <Button variant="outline" onClick={refresh} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
        <Button onClick={copyToClipboard}>{copied ? "Copied" : "Copy to clipboard"}</Button>
      </div>

      {data && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{data.headline}</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              data-tutorial="tutorial-daily-update-editor"
              className="w-full min-h-[320px] rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm font-mono text-zinc-800"
              value={edited}
              onChange={(e) => setEdited(e.target.value)}
              spellCheck={false}
            />
            <p className="text-xs text-zinc-500 mt-2">
              {(data.items as unknown[]).length} work order line(s) from activity on this date (road fleet listed first).
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
