"use client";

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
import { deleteRegionAction, upsertRegionAction } from "@/server/actions/admin";

export type AdminRegionRow = {
  id: string;
  code: string;
  name: string;
  country: string;
  flag: string;
  priceMultiplier: number;
  active: boolean;
  sortOrder: number;
};

type FormState = Omit<AdminRegionRow, "id"> & { id?: string };

const EMPTY: FormState = {
  code: "",
  name: "",
  country: "",
  flag: "🌍",
  priceMultiplier: 1,
  active: true,
  sortOrder: 0,
};

export function RegionsManager({ regions }: { regions: AdminRegionRow[] }) {
  const t = useTranslations("admin.regions");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  function edit(region?: AdminRegionRow) {
    setForm(region ? { ...region } : { ...EMPTY, sortOrder: regions.length });
    setOpen(true);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await upsertRegionAction(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t("saved"));
      setOpen(false);
      router.refresh();
    });
  }

  function remove(region: AdminRegionRow) {
    if (!window.confirm(t("deleteConfirm"))) return;
    startTransition(async () => {
      const result = await deleteRegionAction(region.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

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
              <TableHead>{t("code")}</TableHead>
              <TableHead>{t("country")}</TableHead>
              <TableHead>{t("priceMultiplier")}</TableHead>
              <TableHead>{t("active")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {regions.map((region) => (
              <TableRow key={region.id}>
                <TableCell className="font-medium">
                  <span className="mr-2">{region.flag}</span>
                  {region.name}
                </TableCell>
                <TableCell className="font-mono text-xs">{region.code}</TableCell>
                <TableCell>{region.country}</TableCell>
                <TableCell className="tabular-nums">×{region.priceMultiplier.toFixed(2)}</TableCell>
                <TableCell>
                  <Badge variant={region.active ? "default" : "outline"}>
                    {region.active ? tc("yes") : tc("no")}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => edit(region)}
                      aria-label={t("edit")}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => remove(region)}
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
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={save}>
            <DialogHeader>
              <DialogTitle>{form.id ? t("edit") : t("add")}</DialogTitle>
            </DialogHeader>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">{t("name")}</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="code">{t("code")}</Label>
                <Input
                  id="code"
                  value={form.code}
                  pattern="[a-z0-9-]+"
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="country">{t("country")}</Label>
                <Input
                  id="country"
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="flag">{t("flag")}</Label>
                <Input
                  id="flag"
                  value={form.flag}
                  maxLength={8}
                  onChange={(e) => setForm({ ...form, flag: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="priceMultiplier">{t("priceMultiplier")}</Label>
                <Input
                  id="priceMultiplier"
                  type="number"
                  step={0.01}
                  min={0.1}
                  max={5}
                  value={form.priceMultiplier}
                  onChange={(e) =>
                    setForm({ ...form, priceMultiplier: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sortOrder">{t("sortOrder")}</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  min={0}
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-center gap-3 sm:col-span-2">
                <Switch
                  id="active"
                  checked={form.active}
                  onCheckedChange={(checked) => setForm({ ...form, active: checked })}
                />
                <Label htmlFor="active">{t("active")}</Label>
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
