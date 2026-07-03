"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { jsonHeadersWithBearer } from "@/lib/client-bearer";
import type { WhatsNewEntry, WhatsNewPage } from "@/content/whats-new/entries";

/**
 * What's New login primer.
 *
 * On mount (after auth resolves), fetches the user's un-seen entries. If there
 * are none, renders nothing. If there are, opens a multi-page modal the user
 * can page through, dismiss, or skip. Dismissing records the entry slugs in
 * `whats_new_seen` so the popup won't reappear for those entries on future
 * logins. A "View archive" link points at /whats-new (the companion to the
 * guide/tutorial).
 *
 * Rule: any commit that ships a novel/reconfigured feature must add an entry
 * to src/content/whats-new/entries.ts — that's what triggers this popup for
 * everyone who hasn't seen it. See docs/WHATS_NEW_PRIMER.md.
 */

interface ApiEntry extends WhatsNewEntry {}

export function WhatsNewDialog(): React.ReactElement | null {
  const { user, isLoading } = useAuth();
  const [entries, setEntries] = useState<ApiEntry[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [entryIdx, setEntryIdx] = useState(0);
  const [pageIdx, setPageIdx] = useState(0);

  useEffect(() => {
    if (isLoading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/whats-new/unseen", {
          headers: await jsonHeadersWithBearer(),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { entries?: ApiEntry[] };
        const list = Array.isArray(data.entries) ? data.entries : [];
        if (cancelled) return;
        setEntries(list);
        if (list.length > 0) {
          setEntryIdx(0);
          setPageIdx(0);
          setIsOpen(true);
        }
      } catch {
        /* non-fatal: popup is a nicety, never block the app */
      } finally {
        if (!cancelled) setHasLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoading, user]);

  // Reset page index whenever we move to a new entry.
  useEffect(() => {
    setPageIdx(0);
  }, [entryIdx]);

  const currentEntry = entries[entryIdx];
  const currentPage: WhatsNewPage | undefined = currentEntry?.pages[pageIdx];

  async function dismissAll(): Promise<void> {
    if (entries.length === 0) {
      setIsOpen(false);
      return;
    }
    const slugs = entries.map((e) => e.slug);
    try {
      await fetch("/api/whats-new/dismiss", {
        method: "POST",
        headers: await jsonHeadersWithBearer(),
        body: JSON.stringify({ slugs }),
      });
    } catch {
      /* best-effort; still close so the user isn't trapped */
    }
    setIsOpen(false);
  }

  function next(): void {
    if (!currentEntry) return;
    // More pages in this entry?
    if (pageIdx < currentEntry.pages.length - 1) {
      setPageIdx(pageIdx + 1);
      return;
    }
    // More entries?
    if (entryIdx < entries.length - 1) {
      setEntryIdx(entryIdx + 1);
      return;
    }
    // Last page of last entry — dismiss all and close.
    void dismissAll();
  }

  function prev(): void {
    if (pageIdx > 0) {
      setPageIdx(pageIdx - 1);
      return;
    }
    if (entryIdx > 0) {
      setEntryIdx(entryIdx - 1);
      const prevEntry = entries[entryIdx - 1];
      setPageIdx(prevEntry.pages.length - 1);
    }
  }

  if (!isLoading && hasLoaded && !isOpen) return null;
  if (!isOpen) return null;
  if (!currentEntry || !currentPage) return null;

  const totalPagesAcrossEntries = entries.reduce((acc, e) => acc + e.pages.length, 0);
  const globalPageNum =
    entries.slice(0, entryIdx).reduce((acc, e) => acc + e.pages.length, 0) + pageIdx + 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <header className="flex items-start justify-between gap-4 border-b border-zinc-200 px-6 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">
              What&apos;s new
            </div>
            <h2 id="whats-new-title" className="mt-1 text-xl font-semibold text-zinc-900">
              {currentEntry.title}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">{currentEntry.summary}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => void dismissAll()}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="px-6 py-5 overflow-y-auto">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-2">
            {currentPage.title}
          </div>
          <MarkdownBody md={currentPage.bodyMd} />
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-zinc-200 px-6 py-3">
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span>
              Page {globalPageNum} of {totalPagesAcrossEntries}
            </span>
            <Link href="/whats-new" className="text-blue-600 hover:underline" onClick={() => void dismissAll()}>
              View archive
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={prev}
              disabled={entryIdx === 0 && pageIdx === 0}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => void dismissAll()}
              className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={next}
              className="rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              {globalPageNum === totalPagesAcrossEntries ? "Got it" : "Next"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/**
 * Minimal, dependency-free markdown renderer covering the subset used in the
 * What's New folio: ## / ### headings, **bold**, *italic*, `code`,
 * [text](url) links, - bullet lists, 1. numbered lists, and paragraphs with
 * blank-line separation. Intentionally not a full markdown parser.
 */
function MarkdownBody({ md }: { md: string }): React.ReactElement {
  const blocks = useMemo(() => parseMarkdown(md), [md]);
  return <div className="prose-sm space-y-3 text-sm text-zinc-700">{blocks}</div>;
}

type Block =
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

function parseMarkdown(md: string): React.ReactElement[] {
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

  for (const raw of lines) {
    const line = raw;
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

/** Render inline markdown: **bold**, *italic*, `code`, [text](url). */
function renderInline(text: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  // Token regex captures the first supported inline construct.
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
