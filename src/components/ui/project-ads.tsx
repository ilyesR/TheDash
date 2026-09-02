"use client";

import * as React from "react";
import { ImagePlus, Loader2, Megaphone, Plus, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AdIdea, Project } from "@/lib/transaction";

const FIELD =
  "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-neutral-500";

/** Longest edge kept when uploading. Ad mockups do not need full resolution. */
const MAX_EDGE = 1400;

/** Shrinks in the browser so a phone photo does not travel at full size. */
async function downscale(file: File): Promise<{ data: string; mediaType: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser blocked image processing.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
  return { data: dataUrl.slice(dataUrl.indexOf(",") + 1), mediaType: "image/jpeg" };
}

export default function ProjectAds({
  project,
  onSave,
  onError,
}: {
  project: Project;
  onSave: (next: Project) => Promise<void>;
  onError: (message: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <AdNotesPanel project={project} onSave={onSave} onError={onError} />
      <AdIdeasPanel project={project} onSave={onSave} onError={onError} />
    </div>
  );
}

function AdNotesPanel({
  project,
  onSave,
  onError,
}: {
  project: Project;
  onSave: (next: Project) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = React.useState(project.adNotes);
  const [saving, setSaving] = React.useState(false);

  const dirty = draft !== project.adNotes;

  async function save() {
    if (!dirty) return;
    setSaving(true);
    try {
      await onSave({ ...project, adNotes: draft });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save your ad notes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Megaphone size={15} className="text-white/50" />
          Ad notes
        </h2>
        {dirty && (
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[12px] font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-50"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            Save
          </button>
        )}
      </div>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void save()}
        placeholder="Audience, angles, hooks, channels, budget thoughts…"
        rows={10}
        maxLength={20000}
        aria-label="Ad notes"
        className={cn(FIELD, "min-h-[220px] flex-1 resize-y leading-relaxed")}
      />

      <p className="mt-2 text-[11px] text-white/30">
        {dirty ? "Unsaved — saves when you click away." : "Saved."}
      </p>
    </section>
  );
}

function AdIdeasPanel({
  project,
  onSave,
  onError,
}: {
  project: Project;
  onSave: (next: Project) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);

  async function commit(adIdeas: AdIdea[]) {
    await onSave({ ...project, adIdeas });
  }

  async function add() {
    const trimmed = text.trim();
    if (!trimmed) return;

    setBusy("add");
    try {
      setText("");
      await commit([
        ...project.adIdeas,
        { id: crypto.randomUUID(), text: trimmed, imageUrl: "", imagePath: "" },
      ]);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save that ad idea.");
    } finally {
      setBusy(null);
    }
  }

  async function attachPicture(ad: AdIdea, file: File) {
    setBusy(ad.id);
    try {
      const shrunk = await downscale(file);

      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shrunk),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? "Could not upload that picture.");

      // Replace rather than pile up: drop the previous file if there was one.
      if (ad.imagePath) {
        void fetch(`/api/uploads?path=${encodeURIComponent(ad.imagePath)}`, {
          method: "DELETE",
        });
      }

      await commit(
        project.adIdeas.map((a) =>
          a.id === ad.id ? { ...a, imageUrl: payload.url, imagePath: payload.path } : a
        )
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not attach that picture.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(ad: AdIdea) {
    setBusy(ad.id);
    try {
      if (ad.imagePath) {
        void fetch(`/api/uploads?path=${encodeURIComponent(ad.imagePath)}`, {
          method: "DELETE",
        });
      }
      await commit(project.adIdeas.filter((a) => a.id !== ad.id));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not delete that ad idea.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="flex flex-col rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <ImagePlus size={15} className="text-white/50" />
          Ad ideas
        </h2>
        <span className="text-[11px] text-white/35">{project.adIdeas.length}</span>
      </div>

      {project.adIdeas.length > 0 && (
        <ul className="mb-3 flex flex-col gap-2">
          {project.adIdeas.map((ad) => (
            <li
              key={ad.id}
              className="group flex items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-2.5"
            >
              <label
                className={cn(
                  "grid size-14 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-lg border border-dashed border-neutral-700 transition-colors hover:border-neutral-500",
                  ad.imageUrl && "border-solid"
                )}
                title={ad.imageUrl ? "Replace this picture" : "Add a picture"}
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  disabled={busy !== null}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void attachPicture(ad, file);
                  }}
                />
                {busy === ad.id ? (
                  <Loader2 size={15} className="animate-spin text-white/40" />
                ) : ad.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ad.imageUrl}
                    alt=""
                    className="size-full object-cover"
                    onClick={(e) => {
                      e.preventDefault();
                      setPreview(ad.imageUrl);
                    }}
                  />
                ) : (
                  <ImagePlus size={15} className="text-white/30" />
                )}
              </label>

              <span className="min-w-0 flex-1 py-0.5 text-[13px] leading-snug text-white/85">
                {ad.text || <span className="text-white/35">Untitled</span>}
              </span>

              <button
                type="button"
                onClick={() => void remove(ad)}
                disabled={busy !== null}
                aria-label={`Delete ad idea "${ad.text}"`}
                className="mt-0.5 shrink-0 rounded-md p-1 text-white/20 opacity-0 transition-all hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-40"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex items-center gap-2 border-t border-neutral-800 pt-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
          placeholder="An ad angle, a hook, a visual to try…"
          maxLength={600}
          aria-label="New ad idea"
          className={cn(FIELD, "flex-1")}
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy !== null || text.trim() === ""}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[13px] font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-50"
        >
          {busy === "add" ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Add
        </button>
      </div>

      <p className="mt-2 text-[11px] text-white/30">
        Click a thumbnail to attach or replace a picture.
      </p>

      {preview && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-black/80 p-6"
          onClick={() => setPreview(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Ad picture"
        >
          <button
            type="button"
            onClick={() => setPreview(null)}
            aria-label="Close picture"
            className="absolute right-6 top-6 rounded-lg p-2 text-white/60 hover:text-white"
          >
            <X size={20} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt=""
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </section>
  );
}
