"use client";

import { Loader2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { TICKET_CATEGORIES, TICKET_PRIORITIES } from "@/lib/validation/ticket";
import { createTicketAction } from "@/server/actions/tickets";

type Category = (typeof TICKET_CATEGORIES)[number];
type Priority = (typeof TICKET_PRIORITIES)[number];

const NO_SERVER = "none";

export function NewTicketForm({
  servers,
  defaultServerId,
}: {
  servers: { id: string; name: string }[];
  defaultServerId?: string;
}) {
  const t = useTranslations("support");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    subject: "",
    category: (defaultServerId ? "TECHNICAL" : "GENERAL") as Category,
    priority: "NORMAL" as Priority,
    serverId: defaultServerId ?? NO_SERVER,
    body: "",
  });

  const categoryItems = TICKET_CATEGORIES.map((value) => ({ value, label: t(`categories.${value}`) }));
  const priorityItems = TICKET_PRIORITIES.map((value) => ({ value, label: t(`priorities.${value}`) }));
  const serverItems = [
    { value: NO_SERVER, label: t("noServer") },
    ...servers.map((server) => ({ value: server.id, label: server.name })),
  ];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createTicketAction({
        ...form,
        serverId: form.serverId === NO_SERVER ? null : form.serverId,
      });
      if (!result.ok) {
        const key = `errors.${result.error}`;
        toast.error(t.has(key) ? t(key) : t("errors.internal_error"));
        return;
      }
      toast.success(t("created"));
      router.push(`/dashboard/support/${result.data.ticketId}`);
    });
  }

  const select = (
    id: string,
    label: string,
    items: { value: string; label: string }[],
    value: string,
    onChange: (value: string) => void,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select items={items} value={value} onValueChange={(v) => v && onChange(v as string)}>
        <SelectTrigger id={id} className="w-full">
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
  );

  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border border-white/5 bg-card p-5 sm:p-6">
      <div className="space-y-1.5">
        <Label htmlFor="subject">{t("subject")}</Label>
        <Input
          id="subject"
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
          placeholder={t("subjectPlaceholder")}
          required
          minLength={3}
          maxLength={120}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {select("category", t("category"), categoryItems, form.category, (v) =>
          setForm({ ...form, category: v as Category }),
        )}
        {select("priority", t("priority"), priorityItems, form.priority, (v) =>
          setForm({ ...form, priority: v as Priority }),
        )}
        {select("server", t("server"), serverItems, form.serverId, (v) =>
          setForm({ ...form, serverId: v }),
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="body">{t("message")}</Label>
        <Textarea
          id="body"
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          placeholder={t("messagePlaceholder")}
          required
          maxLength={5000}
          rows={7}
          className="min-h-40"
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Send data-icon="inline-start" />}
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
