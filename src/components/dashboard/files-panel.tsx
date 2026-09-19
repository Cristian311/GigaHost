"use client";

import {
  ChevronRight,
  File,
  FileLock2,
  FilePlus2,
  Folder,
  FolderPlus,
  Home,
  Loader2,
  Trash2,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MAX_EDITABLE_FILE_BYTES } from "@/lib/constants";

type Entry = {
  name: string;
  path: string;
  isDirectory: boolean;
  isBinary: boolean;
  sizeBytes: number;
  updatedAt: string;
};

type Editing = { path: string; content: string; isNew: boolean };

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const join = (directory: string, name: string) => (directory ? `${directory}/${name}` : name);

export function FilesPanel({ serverId, available }: { serverId: string; available: boolean }) {
  const t = useTranslations("dashboard.files");
  const tc = useTranslations("common");
  const format = useFormatter();
  const [directory, setDirectory] = useState("");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [creating, setCreating] = useState<"file" | "folder" | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const base = `/api/servers/${serverId}/files`;

  function fail(code?: string) {
    const key = `errors.${code ?? "internal_error"}` as const;
    toast.error(t.has(key) ? t(key) : t("errors.internal_error"));
  }

  async function errorCode(res: Response) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return body?.error;
  }

  useEffect(() => {
    if (!available) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${base}?path=${encodeURIComponent(directory)}`, {
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as { entries: Entry[] };
          setEntries(data.entries);
        } else if (res.status === 404 && directory) {
          // The folder was deleted from under us: go back to the root.
          setDirectory("");
        } else {
          setEntries([]);
        }
      } catch {
        if (!cancelled) setEntries([]);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [available, base, directory, refreshKey]);

  function open(path: string) {
    setEntries(null);
    setDirectory(path);
  }

  async function edit(entry: Entry) {
    setBusy(true);
    try {
      const res = await fetch(`${base}/content?path=${encodeURIComponent(entry.path)}`, {
        cache: "no-store",
      });
      if (!res.ok) return fail(await errorCode(res));
      const data = (await res.json()) as { path: string; content: string };
      setEditing({ ...data, isNew: false });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    try {
      const res = await fetch(`${base}/content`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: editing.path, content: editing.content }),
      });
      if (!res.ok) return fail(await errorCode(res));
      toast.success(t("saved"));
      setEditing(null);
      setRefreshKey((key) => key + 1);
    } finally {
      setBusy(false);
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name || !creating) return;
    const path = join(directory, name);

    if (creating === "file") {
      // Opens the editor; the file exists once it is saved.
      setEditing({ path, content: "", isNew: true });
      setCreating(null);
      setNewName("");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`${base}/directory`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) return fail(await errorCode(res));
      setCreating(null);
      setNewName("");
      setRefreshKey((key) => key + 1);
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry: Entry) {
    const message = entry.isDirectory
      ? t("confirmDeleteFolder", { name: entry.name })
      : t("confirmDeleteFile", { name: entry.name });
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      const res = await fetch(`${base}?path=${encodeURIComponent(entry.path)}`, {
        method: "DELETE",
      });
      if (!res.ok) return fail(await errorCode(res));
      setRefreshKey((key) => key + 1);
    } finally {
      setBusy(false);
    }
  }

  if (!available) {
    return (
      <p className="rounded-2xl border border-white/5 bg-card px-5 py-10 text-center text-sm text-muted-foreground">
        {t("unavailable")}
      </p>
    );
  }

  const crumbs = directory ? directory.split("/") : [];
  const bytes = editing ? new TextEncoder().encode(editing.content).length : 0;
  const tooLarge = bytes > MAX_EDITABLE_FILE_BYTES;

  return (
    <section className="rounded-2xl border border-white/5 bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex min-w-0 flex-wrap items-center gap-1 text-sm" aria-label={t("title")}>
          <button
            type="button"
            onClick={() => open("")}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            <Home className="size-3.5" /> {t("root")}
          </button>
          {crumbs.map((crumb, index) => (
            <span key={`${crumb}-${index}`} className="flex items-center gap-1">
              <ChevronRight className="size-3 text-muted-foreground" />
              <button
                type="button"
                onClick={() => open(crumbs.slice(0, index + 1).join("/"))}
                className="rounded-md px-1.5 py-1 hover:bg-white/5"
              >
                {crumb}
              </button>
            </span>
          ))}
        </nav>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setCreating("file")}>
            <FilePlus2 data-icon="inline-start" /> {t("newFile")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCreating("folder")}>
            <FolderPlus data-icon="inline-start" /> {t("newFolder")}
          </Button>
        </div>
      </div>

      <div className="mt-4">
        {entries === null ? (
          <div className="h-40 animate-pulse rounded-xl bg-white/[0.04]" />
        ) : entries.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {entries.map((entry) => {
              const Icon = entry.isDirectory ? Folder : entry.isBinary ? FileLock2 : File;
              const openable = entry.isDirectory || !entry.isBinary;
              return (
                <li key={entry.path} className="flex items-center gap-3 py-2">
                  <button
                    type="button"
                    disabled={!openable || busy}
                    title={entry.isBinary ? t("binaryHint") : undefined}
                    onClick={() => (entry.isDirectory ? open(entry.path) : edit(entry))}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/5 disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <Icon
                      className={
                        entry.isDirectory
                          ? "size-4 shrink-0 text-primary"
                          : "size-4 shrink-0 text-muted-foreground"
                      }
                    />
                    <span className="truncate">{entry.name}</span>
                  </button>
                  <span className="hidden w-24 text-right text-xs tabular-nums text-muted-foreground sm:block">
                    {entry.isDirectory ? "—" : formatSize(entry.sizeBytes)}
                  </span>
                  <span className="hidden w-40 text-right text-xs text-muted-foreground md:block">
                    {format.dateTime(new Date(entry.updatedAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("delete")}
                    disabled={busy}
                    onClick={() => remove(entry)}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* New file / folder */}
      <Dialog
        open={creating !== null}
        onOpenChange={(next) => {
          if (!next) {
            setCreating(null);
            setNewName("");
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={create}>
            <DialogHeader>
              <DialogTitle>{creating === "folder" ? t("newFolder") : t("newFile")}</DialogTitle>
              <DialogDescription>{t("inFolder", { folder: directory || t("root") })}</DialogDescription>
            </DialogHeader>
            <Input
              className="mt-4"
              value={newName}
              autoFocus
              maxLength={100}
              placeholder={creating === "folder" ? t("folderPlaceholder") : t("filePlaceholder")}
              onChange={(event) => setNewName(event.target.value)}
            />
            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={() => setCreating(null)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={busy || newName.trim().length === 0}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                {t("create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Editor */}
      <Dialog open={editing !== null} onOpenChange={(next) => (next ? null : setEditing(null))}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{editing?.path}</DialogTitle>
            <DialogDescription>{t("restartHint")}</DialogDescription>
          </DialogHeader>
          <textarea
            value={editing?.content ?? ""}
            spellCheck={false}
            aria-label={editing?.path}
            onChange={(event) =>
              setEditing((current) => (current ? { ...current, content: event.target.value } : current))
            }
            className="scrollbar-thin h-[55vh] w-full resize-none rounded-xl border border-white/10 bg-black/50 p-3 font-mono text-xs leading-relaxed outline-none focus:border-primary/50"
          />
          <DialogFooter className="items-center sm:justify-between">
            <span
              className={
                tooLarge ? "text-xs text-destructive" : "text-xs tabular-nums text-muted-foreground"
              }
            >
              {formatSize(bytes)} / {formatSize(MAX_EDITABLE_FILE_BYTES)}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>
                {tc("cancel")}
              </Button>
              <Button onClick={save} disabled={busy || tooLarge}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                {tc("save")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
