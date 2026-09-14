"use client";

import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { changePasswordAction, updateAccountAction } from "@/server/actions/account";

export function ProfileForm({ name, locale }: { name: string; locale: string }) {
  const t = useTranslations("account");
  const tc = useTranslations("common");
  const currentLocale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ name, locale });

  const items = [
    { value: "en", label: tc("english") },
    { value: "ro", label: tc("romanian") },
  ];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateAccountAction(form);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as "errors.validation"));
        return;
      }
      toast.success(t("saved"));
      if (form.locale !== currentLocale) {
        router.replace(pathname, { locale: form.locale as AppLocale });
      } else {
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">{t("name")}</Label>
        <Input
          id="name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          minLength={2}
          maxLength={60}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="locale">{t("language")}</Label>
        <Select
          items={items}
          value={form.locale}
          onValueChange={(v) => setForm({ ...form, locale: (v as string) ?? "en" })}
        >
          <SelectTrigger id="locale" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        {t("save")}
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const t = useTranslations("account");
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await changePasswordAction(form);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as "errors.validation"));
        return;
      }
      toast.success(t("passwordChanged"));
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="currentPassword">{t("currentPassword")}</Label>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          value={form.currentPassword}
          onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
          minLength={8}
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="newPassword">{t("newPassword")}</Label>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
            minLength={8}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">{t("confirmPassword")}</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            minLength={8}
            required
          />
        </div>
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        {t("changePassword")}
      </Button>
    </form>
  );
}
