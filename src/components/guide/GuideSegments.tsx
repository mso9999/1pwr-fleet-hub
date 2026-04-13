import Link from "next/link";
import type { GuideSegment } from "@/content/guide/types";

function renderSegment(s: GuideSegment, i: number): React.ReactNode {
  if (typeof s === "string") {
    return <span key={i}>{s}</span>;
  }
  if (s.type === "strong") {
    return <strong key={i}>{s.text}</strong>;
  }
  if (s.type === "link") {
    return (
      <Link key={i} href={s.href} className="text-blue-600 font-medium hover:underline">
        {s.label}
      </Link>
    );
  }
  return null;
}

export function GuideParagraph({ segments }: { segments: GuideSegment[] }): React.ReactElement {
  return (
    <p className="text-sm text-zinc-700 leading-relaxed">
      {segments.map((seg, i) => renderSegment(seg, i))}
    </p>
  );
}
