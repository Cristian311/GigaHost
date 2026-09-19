"use client";

import { CheckCircle2, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import { deleteGameAction, inspectEggAction, upsertGameAction } from "@/server/actions/admin";
import type { EggInspection } from "@/server/services/admin-service";

export type AdminGameRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  image: string;
  accentColor: string;
  minRamGb: number;
  recommendedRamGb: number;
  minCpu: number;
  minStorageGb: number;
  versions: string[];
  available: boolean;
  unavailableReason: string | null;
  sortOrder: number;
  pterodactylNestId: number | null;
  pterodactylEggId: number | null;
  dockerImage: string | null;
  versionVariable: string | null;
  eggVariables: string;
};

type FormState = Omit<AdminGameRow, "id" | "versions"> & { id?: string; versions: string };

const EMPTY: FormState = {
  slug: "",
  name: "",
  tagline: "",
  description: "",
  image: "/games/minecraft-java.svg",
  accentColor: "#7c3aed",
  minRamGb: 2,
  recommendedRamGb: 4,
  minCpu: 1,
  minStorageGb: 10,
  versions: "Latest",
  available: true,
  unavailableReason: "",
  sortOrder: 99,
  pterodactylNestId: null,
  pterodactylEggId: null,
  dockerImage: "",
  versionVariable: "",
  eggVariables: "{}",
};

export function GamesManager({ games }: { games: AdminGameRow[] }) {
  const t = useTranslations("admin.games");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [inspecting, startInspect] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [inspection, setInspection] = useState<EggInspection | null>(null);

  const errorText = (code: string) => {
    const key = `errors.${code}`;
    return t.has(key) ? t(key) : t("errors.internal_error");
  };

  function edit(game?: AdminGameRow) {
    setForm(
      game
        ? { ...game, versions: game.versions.join(", "), unavailableReason: game.unavailableReason ?? "" }
        : { ...EMPTY, sortOrder: games.length },
    );
    setInspection(null);
    setOpen(true);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await upsertGameAction({
        ...form,
        unavailableReason: form.unavailableReason || null,
        dockerImage: form.dockerImage || null,
        versionVariable: form.versionVariable || null,
      });
      if (!result.ok) {
        toast.error(errorText(result.error));
        return;
      }
      toast.success(t("saved"));
      setOpen(false);
      router.refresh();
    });
  }

  function remove(game: AdminGameRow) {
    if (!window.confirm(t("deleteConfirm"))) return;
    startTransition(async () => {
      const result = await deleteGameAction(game.id);
      if (!result.ok) {
        toast.error(errorText(result.error));
        return;
      }
      router.refresh();
    });
  }

  function inspect() {
    const { pterodactylNestId: nestId, pterodactylEggId: eggId } = form;
    if (!nestId || !eggId) return;
    startInspect(async () => {
      const result = await inspectEggAction({ nestId, eggId });
      if (!result.ok) {
        setInspection(null);
        toast.error(errorText(result.error));
        return;
      }
      setInspection(result.data);
    });
  }

  const text = (key: keyof FormState, label: string, extra?: Partial<React.ComponentProps<"input">>) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        value={String(form[key] ?? "")}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        {...extra}
      />
    </div>
  );

  const number = (key: keyof FormState, label: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        type="number"
        min={0}
        value={Number(form[key] ?? 0)}
        onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
      />
    </div>
  );

  const optionalId = (key: "pterodactylNestId" | "pterodactylEggId", label: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        type="number"
        min={1}
        value={form[key] ?? ""}
        onChange={(e) => {
          setForm({ ...form, [key]: e.target.value === "" ? null : Number(e.target.value) });
          setInspection(null);
        }}
      />
    </div>
  );

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => edit()}>
          <Plus data-icon="inline-start" /> {t("add")}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/5 bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("slug")}</TableHead>
              <TableHead>{t("minRam")}</TableHead>
              <TableHead>{t("minCpu")}</TableHead>
              <TableHead>{t("available")}</TableHead>
              <TableHead>{t("pterodactyl")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {games.map((game) => (
              <TableRow key={game.id}>
                <TableCell className="font-medium">
                  <span
                    className="mr-2 inline-block size-2.5 rounded-full align-middle"
                    style={{ background: game.accentColor }}
                  />
                  {game.name}
                </TableCell>
                <TableCell className="font-mono text-xs">{game.slug}</TableCell>
                <TableCell>{game.minRamGb} GB</TableCell>
                <TableCell>{game.minCpu}</TableCell>
                <TableCell>
                  <Badge variant={game.available ? "default" : "outline"}>
                    {game.available ? tc("yes") : tc("no")}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {game.pterodactylEggId !== null
                    ? `nest ${game.pterodactylNestId} · egg ${game.pterodactylEggId}`
                    : <span className="text-muted-foreground">{t("notConfigured")}</span>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon-sm" variant="ghost" onClick={() => edit(game)} aria-label={t("edit")}>
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => remove(game)}
                      aria-label={t("delete")}
                      disabled={pending}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <form onSubmit={save}>
            <DialogHeader>
              <DialogTitle>{form.id ? t("edit") : t("add")}</DialogTitle>
            </DialogHeader>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {text("name", t("name"), { required: true })}
              {text("slug", t("slug"), { required: true, pattern: "[a-z0-9-]+" })}
              <div className="sm:col-span-2">{text("tagline", t("tagline"), { required: true })}</div>
              <div className="sm:col-span-2">{text("description", t("description"), { required: true })}</div>
              {text("image", t("image"), { required: true })}
              {text("accentColor", t("accentColor"), { required: true, pattern: "#[0-9a-fA-F]{6}" })}
              {number("minRamGb", t("minRam"))}
              {number("recommendedRamGb", t("recommendedRam"))}
              {number("minCpu", t("minCpu"))}
              {number("minStorageGb", t("minStorage"))}
              <div className="sm:col-span-2">{text("versions", t("versions"))}</div>
              {number("sortOrder", t("sortOrder"))}
              <div className="flex items-center gap-3 pt-6">
                <Switch
                  id="available"
                  checked={form.available}
                  onCheckedChange={(checked) => setForm({ ...form, available: checked })}
                />
                <Label htmlFor="available">{t("available")}</Label>
              </div>
              {!form.available ? (
                <div className="sm:col-span-2">{text("unavailableReason", t("unavailableReason"))}</div>
              ) : null}

              <h3 className="border-t border-white/5 pt-4 text-sm font-semibold text-muted-foreground uppercase sm:col-span-2">
                {t("pterodactyl")}
              </h3>
              {optionalId("pterodactylNestId", t("nestId"))}
              {optionalId("pterodactylEggId", t("eggId"))}
              {text("versionVariable", t("versionVariable"), {
                placeholder: "MINECRAFT_VERSION",
                pattern: "[A-Z0-9_]*",
              })}
              {text("dockerImage", t("dockerImage"), { placeholder: t("dockerImageHint") })}
              <div className="sm:col-span-2">
                {text("eggVariables", t("eggVariables"), {
                  placeholder: '{"SERVER_JARFILE":"server.jar"}',
                  className: "font-mono",
                })}
              </div>
              <div className="sm:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={inspect}
                  disabled={inspecting || !form.pterodactylNestId || !form.pterodactylEggId}
                >
                  {inspecting ? <Loader2 className="animate-spin" /> : <Search data-icon="inline-start" />}
                  {t("inspect")}
                </Button>
                {inspection ? (
                  <div className="mt-3 space-y-2 rounded-xl border border-success/30 bg-success/5 p-3 text-xs">
                    <p className="flex items-center gap-1.5 font-semibold text-success">
                      <CheckCircle2 className="size-4" /> {inspection.name}
                    </p>
                    <p className="font-mono break-all text-muted-foreground">
                      {inspection.dockerImages.join(" · ")}
                    </p>
                    <p className="font-semibold">{t("inspectVariables")}</p>
                    <ul className="space-y-0.5 font-mono">
                      {inspection.variables.map((v) => (
                        <li key={v.env}>
                          {v.env}
                          {v.required ? <span className="text-warning">*</span> : null} ={" "}
                          <span className="text-muted-foreground">{v.defaultValue || "\"\""}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                {tc("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
