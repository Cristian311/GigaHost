"use client";

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { formatMoney } from "@/lib/pricing/calculate-price";
import { deleteCouponAction, upsertCouponAction } from "@/server/actions/admin";

export type AdminCouponRow = {
  id: string;
  code: string;
  kind: "PERCENT" | "FIXED";
  value: number;
  maxRedemptions: number | null;
  timesRedeemed: number;
  perUserLimit: number;
  minOrderCents: number;
  /** ISO date (yyyy-mm-dd) or null. */
  expiresAt: string | null;
  active: boolean;
};

type FormState = Omit<AdminCouponRow, "id" | "timesRedeemed"> & { id?: string };

const EMPTY: FormState = {
  code: "",
  kind: "PERCENT",
  value: 10,
  maxRedemptions: null,
  perUserLimit: 1,
  minOrderCents: 0,
  expiresAt: null,
  active: true,
};

export function CouponsManager({
  coupons,
  currency,
}: {
  coupons: AdminCouponRow[];
  currency: string;
}) {
  const t = useTranslations("admin.coupons");
  const tc = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const kindItems = [
    { value: "PERCENT", label: t("kinds.PERCENT") },
    { value: "FIXED", label: t("kinds.FIXED") },
  ];

  function edit(coupon?: AdminCouponRow) {
    setForm(coupon ? { ...coupon } : { ...EMPTY });
    setOpen(true);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      // A date picker yields a bare day; the coupon should stay valid through it.
      const result = await upsertCouponAction({
        ...form,
        expiresAt: form.expiresAt ? `${form.expiresAt}T23:59:59.999Z` : null,
      });
      if (!result.ok) {
        const key = `errors.${result.error}` as const;
        toast.error(t.has(key) ? t(key) : t("errors.internal_error"));
        return;
      }
      toast.success(t("saved"));
      setOpen(false);
      router.refresh();
    });
  }

  function remove(coupon: AdminCouponRow) {
    if (!window.confirm(t("deleteConfirm"))) return;
    startTransition(async () => {
      const result = await deleteCouponAction(coupon.id);
      if (!result.ok) {
        toast.error(t("errors.internal_error"));
        return;
      }
      router.refresh();
    });
  }

  const describeValue = (coupon: AdminCouponRow) =>
    coupon.kind === "PERCENT" ? `${coupon.value}%` : formatMoney(coupon.value, currency);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => edit()}>
          <Plus data-icon="inline-start" /> {t("add")}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/5 bg-card">
        {coupons.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("code")}</TableHead>
                <TableHead>{t("value")}</TableHead>
                <TableHead>{t("redemptions")}</TableHead>
                <TableHead>{t("expiresAt")}</TableHead>
                <TableHead>{t("active")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {coupons.map((coupon) => (
                <TableRow key={coupon.id}>
                  <TableCell className="font-mono font-medium">{coupon.code}</TableCell>
                  <TableCell className="tabular-nums">{describeValue(coupon)}</TableCell>
                  <TableCell className="tabular-nums">
                    {coupon.timesRedeemed} / {coupon.maxRedemptions ?? t("unlimited")}
                  </TableCell>
                  <TableCell>
                    {coupon.expiresAt
                      ? format.dateTime(new Date(coupon.expiresAt), { dateStyle: "medium" })
                      : t("never")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={coupon.active ? "default" : "outline"}>
                      {coupon.active ? tc("yes") : tc("no")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => edit(coupon)}
                        aria-label={t("edit")}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => remove(coupon)}
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
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={save}>
            <DialogHeader>
              <DialogTitle>{form.id ? t("edit") : t("add")}</DialogTitle>
            </DialogHeader>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="code">{t("code")}</Label>
                <Input
                  id="code"
                  value={form.code}
                  pattern="[A-Za-z0-9_-]+"
                  minLength={3}
                  maxLength={32}
                  className="font-mono uppercase"
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kind">{t("kind")}</Label>
                <Select
                  items={kindItems}
                  value={form.kind}
                  onValueChange={(v) => setForm({ ...form, kind: v as FormState["kind"] })}
                >
                  <SelectTrigger id="kind" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {kindItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="value">
                  {form.kind === "PERCENT" ? t("valuePercent") : t("valueFixed")}
                </Label>
                <Input
                  id="value"
                  type="number"
                  min={1}
                  max={form.kind === "PERCENT" ? 100 : 1_000_000}
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maxRedemptions">{t("maxRedemptions")}</Label>
                <Input
                  id="maxRedemptions"
                  type="number"
                  min={1}
                  value={form.maxRedemptions ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      maxRedemptions: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="perUserLimit">{t("perUserLimit")}</Label>
                <Input
                  id="perUserLimit"
                  type="number"
                  min={1}
                  value={form.perUserLimit}
                  onChange={(e) => setForm({ ...form, perUserLimit: Number(e.target.value) })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="minOrderCents">{t("minOrder")}</Label>
                <Input
                  id="minOrderCents"
                  type="number"
                  min={0}
                  value={form.minOrderCents}
                  onChange={(e) => setForm({ ...form, minOrderCents: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expiresAt">{t("expiresAt")}</Label>
                <Input
                  id="expiresAt"
                  type="date"
                  value={form.expiresAt ?? ""}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value || null })}
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
