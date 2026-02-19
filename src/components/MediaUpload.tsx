"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { MEDIA_CATEGORY } from "@/types";

interface Attachment {
  id: string;
  entity_type: string;
  entity_id: string;
  file_name: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  caption: string;
  category: string;
  uploaded_by_name: string;
  created_at: string;
}

interface MediaUploadProps {
  entityType: string;
  entityId: string;
  uploadedByName?: string;
  uploadedById?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

function fileUrl(a: Attachment): string {
  return `/uploads/${a.entity_type}/${a.entity_id}/${a.file_name}`;
}

export function MediaUpload({ entityType, entityId, uploadedByName = "", uploadedById = "" }: MediaUploadProps): React.ReactElement {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [caption, setCaption] = useState("");
  const [category, setCategory] = useState("general");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchAttachments = useCallback(() => {
    setIsLoading(true);
    fetch(`/api/media?entityType=${entityType}&entityId=${entityId}`)
      .then((r) => r.json())
      .then((d) => { setAttachments(d); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [entityType, entityId]);

  useEffect(() => { fetchAttachments(); }, [fetchAttachments]);

  async function handleUpload(files: FileList | File[]): Promise<void> {
    setIsUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("entityType", entityType);
      fd.append("entityId", entityId);
      fd.append("caption", caption);
      fd.append("category", category);
      fd.append("uploadedById", uploadedById);
      fd.append("uploadedByName", uploadedByName);

      await fetch("/api/media", { method: "POST", body: fd });
    }
    setCaption("");
    setIsUploading(false);
    fetchAttachments();
  }

  async function handleDelete(id: string): Promise<void> {
    if (!confirm("Delete this attachment?")) return;
    await fetch(`/api/media?id=${id}`, { method: "DELETE" });
    fetchAttachments();
  }

  function handleDrop(e: React.DragEvent): void {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) handleUpload(e.dataTransfer.files);
  }

  const images = attachments.filter((a) => isImage(a.mime_type));
  const docs = attachments.filter((a) => !isImage(a.mime_type));

  return (
    <div className="space-y-4">
      {/* Upload area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${isDragging ? "border-blue-500 bg-blue-50" : "border-zinc-200 hover:border-zinc-300"}`}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) handleUpload(e.target.files); }}
        />
        <div className="space-y-2">
          <p className="text-sm text-zinc-500">
            {isDragging ? "Drop files here" : "Drag & drop files or"}
          </p>
          {!isDragging && (
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={isUploading}>
              {isUploading ? "Uploading..." : "Choose Files"}
            </Button>
          )}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Caption (optional)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="rounded border border-zinc-200 px-2 py-1 text-xs w-40"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded border border-zinc-200 px-2 py-1 text-xs"
            >
              {Object.values(MEDIA_CATEGORY).map((c) => (
                <option key={c} value={c}>{c.replace("-", " ")}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-zinc-400">Images, PDFs, docs up to 20MB</p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-zinc-400">Loading attachments...</p>
      ) : attachments.length === 0 ? (
        <p className="text-sm text-zinc-400">No attachments yet.</p>
      ) : (
        <>
          {/* Image gallery */}
          {images.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-500 uppercase mb-2">Photos ({images.length})</h4>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {images.map((a) => (
                  <div key={a.id} className="group relative aspect-square rounded-lg overflow-hidden bg-zinc-100 border border-zinc-200">
                    <img
                      src={fileUrl(a)}
                      alt={a.caption || a.original_name}
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => setLightboxUrl(fileUrl(a))}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end">
                      <div className="w-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {a.caption && <p className="text-white text-xs truncate">{a.caption}</p>}
                        <div className="flex items-center justify-between">
                          <span className="text-white/70 text-[10px]">{a.category}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(a.id); }}
                            className="text-red-300 hover:text-red-100 text-[10px]"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Document list */}
          {docs.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-500 uppercase mb-2">Documents ({docs.length})</h4>
              <div className="space-y-1">
                {docs.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-lg border border-zinc-100 px-3 py-2 hover:bg-zinc-50">
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-zinc-100 text-xs font-medium text-zinc-500">
                      {(a.original_name.split(".").pop() || "?").toUpperCase().slice(0, 4)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <a href={fileUrl(a)} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue-600 hover:underline truncate block">
                        {a.original_name}
                      </a>
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <span>{formatSize(a.size_bytes)}</span>
                        {a.caption && <span>— {a.caption}</span>}
                        <span>{a.category}</span>
                      </div>
                    </div>
                    <button onClick={() => handleDelete(a.id)} className="text-xs text-red-400 hover:text-red-600">
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightboxUrl(null)}
        >
          <img src={lightboxUrl} alt="" className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl" />
          <button className="absolute top-4 right-4 text-white text-2xl font-bold hover:text-zinc-300" onClick={() => setLightboxUrl(null)}>
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
