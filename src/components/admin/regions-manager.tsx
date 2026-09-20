"use client";

import { CheckCircle2, Loader2, Pencil, Plus, Search } from "lucide-react";
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
import { inspectLocationAction, upsertRegionAction } from "@/server/actions/admin";
import type { LocationInspection } from "@/server/services/admin-service";

export type AdminRegionRow = {
  id: string;
  code: string;
  name: string;
  country: string;
  flag: string;
  priceMultiplier: number;
  active: boolean;
  sortOrder: number;
  pterodactylLocationId: number | null;
  serverCount: number;
};

type FormState = Omit<AdminRegionRow, "id" | "serverCount"> & { id?: string };

const EMPTY: FormState = {
  code: "",
  name: "",
  country: "",
  flag: "🏳️",
  priceMultiplier: 1,
  active: true,
  sortOrder: 99,
  pterodactylLocationId: null,
};

export function RegionsManager({ regions }: { regions: AdminRegionRow[] }) {
  const t = useTranslations("admin.regions");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [inspecting, startInspect] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [inspection, setInspection] = useState<LocationInspection | null>(null);

  const errorText = (code: string) => {
    const key = `errors.${code}`;
    return t.has(key) ? t(key) : t("errors.internal_error");
  };

  function edit(region?: AdminRegionRow) {
    // serverCount rides along in the form state; the zod schema strips it on save.
    setForm(region ?? { ...EMPTY, sortOrder: regions.length });
    setInspection(null);
    setOpen(true);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await upsertRegionAction(form);
      if (!result.ok) {
        toast.error(errorText(result.error));
        return;
      }
      toast.success(t("saved"));
      setOpen(false);
      router.refresh();
    });
  }

  function inspect() {
    const locationId = form.pterodactylLocationId;
    if (!locationId) return;
    startInspect(async () => {
      const result = await inspectLocationAction(locationId);
      if (!result.ok) {
        setInspection(null);
        toast.error(errorText(result.error));
        return;
      }
      setInspection(result.data);
    });
  }

  const text = (key: "code" | "name" | "country" | "flag", label: string, extra?: Partial<React.ComponentProps<"input">>) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        {...extra}
      />
    </div>
  );

  const number = (key: "priceMultiplier" | "sortOrder", label: string, step = 1) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        type="number"
        min={0}
        step={step}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
      />
    </div>
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
        <Button onClick={() => edit()}>
          <Plus data-icon="inline-start" /> {t("add")}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/5 bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("code")}</TableHead>
              <TableHead>{t("multiplier")}</TableHead>
              <TableHead>{t("servers")}</TableHead>
              <TableHead>{t("active")}</TableHead>
              <TableHead>{t("locationId")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {regions.map((region) => (
              <TableRow key={region.id}>
                <TableCell>
                  <p className="font-medium">
                    {region.flag} {region.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{region.country}</p>
                </TableCell>
                <TableCell className="font-mono text-xs">{region.code}</TableCell>
                <TableCell className="tabular-nums">×{region.priceMultiplier.toFixed(2)}</TableCell>
                <TableCell className="tabular-nums">{region.serverCount}</TableCell>
                <TableCell>
                  <Badge variant={region.active ? "default" : "outline"}>
                    {region.active ? tc("yes") : tc("no")}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {region.pterodactylLocationId ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon-sm" variant="ghost" onClick={() => edit(region)} aria-label={t("edit")}>
                    <Pencil />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={save}>
            <DialogHeader>
              <DialogTitle>{form.id ? t("edit") : t("add")}</DialogTitle>
            </DialogHeader>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {text("name", t("name"), { required: true })}
              {text("country", t("country"), { required: true })}
              {text("code", t("code"), { required: true, pattern: "[a-z0-9-]+" })}
              {text("flag", t("flag"), { required: true })}
              {number("priceMultiplier", t("multiplier"), 0.01)}
              {number("sortOrder", t("sortOrder"))}
              <div className="flex items-center gap-3 sm:col-span-2">
                <Switch
                  id="active"
                  checked={form.active}
                  onCheckedChange={(checked) => setForm({ ...form, active: checked })}
                />
                <Label htmlFor="active">{t("active")}</Label>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="pterodactylLocationId">{t("locationId")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="pterodactylLocationId"
                    type="number"
                    min={1}
                    value={form.pterodactylLocationId ?? ""}
                    onChange={(e) => {
                      setForm({
                        ...form,
                        pterodactylLocationId: e.target.value === "" ? null : Number(e.target.value),
                      });
                      setInspection(null);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={inspect}
                    disabled={inspecting || !form.pterodactylLocationId}
                  >
                    {inspecting ? <Loader2 className="animate-spin" /> : <Search data-icon="inline-start" />}
                    {t("inspect")}
                  </Button>
                </div>
                {inspection ? (
                  <div className="mt-2 space-y-1 rounded-xl border border-success/30 bg-success/5 p-3 text-xs">
                    <p className="flex items-center gap-1.5 font-semibold text-success">
                      <CheckCircle2 className="size-4" /> {inspection.long ?? inspection.short} ·{" "}
                      {t("nodes", { count: inspection.nodes.length })}
                    </p>
                    <ul className="space-y-0.5 font-mono">
                      {inspection.nodes.map((node) => (
                        <li key={node.id}>
                          {node.name} ({node.fqdn}) · {node.allocatedMb ?? "?"} / {node.memoryMb} MB
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
