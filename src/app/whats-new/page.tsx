"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { jsonHeadersWithBearer } from "@/lib/client-bearer";
import type { WhatsNewEntry } from "@/content/whats-new/entries";

const CATEGORY_LABELS: Record<string, string> = {
  feature: "New feature",
  reconfigure: "Reconfigured",
  fix: "Fix",
};

function formatDate(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00Z" : ""));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function WhatsNewArchivePage(): React.ReactElement {
  const [entries, setEntries] = useState<WhatsNewEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/whats-new?includeArchived=true", {
          headers: await jsonHeadersWithBearer(),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { entries?: WhatsNewEntry[] };
        if (!cancelled) setEntries(Array.isArray(data.entries) ? data.entries : []);
      } catch {
        /* non-fatal */
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/guide" className="text-sm text-blue-600 hover:underline">
          ← Back to guide
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-zinc-900">What&apos;s new — archive</h1>
        <p className="mt-2 text-sm text-zinc-600">
          A historical record of feature updates and reconfigurations shipped to Fleet Hub. New
          entries appear as a popup at login the first time you see them; this page is the permanent
          companion to the user guide.
        </p>
      </div>

      {isLoading ? (
        <p className="text-zinc-500 text-center py-8">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-zinc-500 text-center py-8">No entries yet.</p>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => (
            <Card key={entry.slug} className="border-zinc-200 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={entry.archived ? "secondary" : "info"}
                    className="text-[10px] uppercase tracking-wide"
                  >
                    {CATEGORY_LABELS[entry.category] ?? entry.category}
                  </Badge>
                  {entry.archived && (
                    <Badge variant="secondary" className="text-[10px]">
                      Archived
                    </Badge>
                  )}
                  <span className="text-xs text-zinc-400">{formatDate(entry.effectiveAt)}</span>
                  {entry.appVersion && (
                    <span className="text-xs text-zinc-400">v{entry.appVersion}</span>
                  )}
                </div>
                <CardTitle className="text-lg">{entry.title}</CardTitle>
                <p className="text-sm text-zinc-500">{entry.summary}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {entry.pages.map((page, i) => (
                  <div key={i} className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      {page.title}
                    </div>
                    <ArchiveMarkdown md={page.bodyMd} />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/** Reuse the same minimal renderer as the popup. Kept here to keep the archive
 * page self-contained (no shared module churn). Subset: ## / ### headings,
 * **bold**, *italic*, `code`, [text](url), - bullets, 1. numbered lists. */
function ArchiveMarkdown({ md }: { md: string }): React.ReactElement {
  const blocks = parseBlocks(md);
  return <div className="space-y-3 text-sm text-zinc-700">{blocks}</div>;
}

type Block =
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

function parseBlocks(md: string): React.ReactElement[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let ul: string[] | null = null;
  let ol: string[] | null = null;

  const flushPara = (): void => {
    if (para.length) {
      blocks.push({ kind: "p", text: para.join(" ").trim() });
      para = [];
    }
  };
  const flushList = (): void => {
    if (ul) {
      blocks.push({ kind: "ul", items: ul });
      ul = null;
    }
    if (ol) {
      blocks.push({ kind: "ol", items: ol });
      ol = null;
    }
  };

  for (const line of lines) {
    if (line.trim() === "") {
      flushPara();
      flushList();
      continue;
    }
    const h3 = /^###\s+(.*)$/.exec(line);
    const h2 = /^##\s+(.*)$/.exec(line);
    const ulMatch = /^[-*]\s+(.*)$/.exec(line);
    const olMatch = /^\d+\.\s+(.*)$/.exec(line);
    if (h3) {
      flushPara();
      flushList();
      blocks.push({ kind: "h3", text: h3[1].trim() });
    } else if (h2) {
      flushPara();
      flushList();
      blocks.push({ kind: "h2", text: h2[1].trim() });
    } else if (ulMatch) {
      flushPara();
      if (!ul) ul = [];
      ul.push(ulMatch[1].trim());
    } else if (olMatch) {
      flushPara();
      if (!ol) ol = [];
      ol.push(olMatch[1].trim());
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();

  return blocks.map((b, i) => {
    if (b.kind === "h2")
      return (
        <h3 key={i} className="text-base font-semibold text-zinc-900 mt-2">
          {renderInline(b.text)}
        </h3>
      );
    if (b.kind === "h3")
      return (
        <h4 key={i} className="text-sm font-semibold text-zinc-900 mt-2">
          {renderInline(b.text)}
        </h4>
      );
    if (b.kind === "p")
      return (
        <p key={i} className="leading-relaxed">
          {renderInline(b.text)}
        </p>
      );
    if (b.kind === "ul")
      return (
        <ul key={i} className="list-disc space-y-1.5 pl-5">
          {b.items.map((it, j) => (
            <li key={j}>{renderInline(it)}</li>
          ))}
        </ul>
      );
    return (
      <ol key={i} className="list-decimal space-y-1.5 pl-5">
        {b.items.map((it, j) => (
          <li key={j}>{renderInline(it)}</li>
        ))}
      </ol>
    );
  });
}

function renderInline(text: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  const tokenRe = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/;
  while (rest.length) {
    const m = tokenRe.exec(rest);
    if (!m) {
      nodes.push(rest);
      break;
    }
    if (m.index > 0) nodes.push(rest.slice(0, m.index));
    if (m[2] !== undefined) {
      nodes.push(<strong key={key++}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      nodes.push(<em key={key++}>{m[3]}</em>);
    } else if (m[4] !== undefined) {
      nodes.push(
        <code key={key++} className="rounded bg-zinc-100 px-1 py-0.5 text-[12px] font-mono">
          {m[4]}
        </code>
      );
    } else if (m[5] !== undefined && m[6] !== undefined) {
      nodes.push(
        <a
          key={key++}
          href={m[6]}
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 hover:underline"
        >
          {m[5]}
        </a>
      );
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return nodes;
}
