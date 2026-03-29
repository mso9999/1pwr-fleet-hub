import type { BodyMark } from "@/lib/inspection-body-diagram";

export interface ItemForFailCheck {
  category: string;
  item: string;
  rating: string;
  note: string;
  bodyMarks?: BodyMark[];
}

/**
 * Every Fail needs a line note, at least one photo for that row, or a note on at least one
 * body-plan damage mark (when using the diagram).
 */
export function failEvidenceMessage(
  items: ItemForFailCheck[],
  pendingPhotosByIndex: Record<number, File[]>
): string | null {
  for (let i = 0; i < items.length; i++) {
    const row = items[i];
    if (row.rating !== "fail") continue;
    const lineNoteOk = row.note.trim().length > 0;
    const photoOk = (pendingPhotosByIndex[i]?.length ?? 0) > 0;
    const diagramNoteOk = (row.bodyMarks ?? []).some((m) => (m.note || "").trim().length > 0);
    if (!lineNoteOk && !photoOk && !diagramNoteOk) {
      return `“${row.category} — ${row.item}”: for Fail, add a line note, upload a photo, or add a note on a damage mark on the body plan.`;
    }
  }
  return null;
}
