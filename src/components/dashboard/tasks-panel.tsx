"use client";

import { CalendarClock, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MAX_COMMAND_LENGTH, MAX_TASKS_PER_SERVER } from "@/lib/constants";

type Action = "RESTART" | "BACKUP" | "COMMAND";
type Frequency = "HOURLY" | "DAILY" | "WEEKLY";

type Task = {
  id: string;
  name: string;
  action: Action;
  payload: string | null;
  frequency: Frequency;
  everyHours: number;
  minuteOfDayUtc: number;
  dayOfWeekUtc: number;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastStatus: string | null;
};

/** What the form edits: the schedule in the customer's own time zone. */
type FormState = {
  id?: string;
  name: string;
  action: Action;
  payload: string;
  frequency: Frequency;
  everyHours: number;
  localTime: string; // "HH:MM"
  localDay: number; // 0 = Sunday
  enabled: boolean;
};

const EMPTY: FormState = {
  name: "",
  action: "RESTART",
  payload: "",
  frequency: "DAILY",
  everyHours: 6,
  localTime: "05:00",
  localDay: 0,
  enabled: true,
};

// 2026-03-15 is a Sunday; any known Sunday works as an anchor for weekday maths.
const SUNDAY_UTC = Date.UTC(2026, 2, 15);
const pad = (value: number) => String(value).padStart(2, "0");

/**
 * The server stores schedules in UTC. A local "Sunday 01:00" can be Saturday
 * 22:00 UTC, so the day has to travel with the time in both directions.
 */
function toUtc(localDay: number, localTime: string) {
  const [hours, minutes] = localTime.split(":").map(Number);
  const date = new Date();
  date.setDate(date.getDate() + ((localDay - date.getDay() + 7) % 7));
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return {
    minuteOfDayUtc: date.getUTCHours() * 60 + date.getUTCMinutes(),
    dayOfWeekUtc: date.getUTCDay(),
  };
}

function toLocal(dayOfWeekUtc: number, minuteOfDayUtc: number) {
  const date = new Date(SUNDAY_UTC + dayOfWeekUtc * 86_400_000 + minuteOfDayUtc * 60_000);
  return { localDay: date.getDay(), localTime: `${pad(date.getHours())}:${pad(date.getMinutes())}` };
}

export function TasksPanel({ serverId }: { serverId: string }) {
  const t = useTranslations("dashboard.tasks");
  const tc = useTranslations("common");
  const format = useFormatter();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);

  const base = `/api/servers/${serverId}/tasks`;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(base, { cache: "no-store" });
        if (!cancelled) setTasks(res.ok ? ((await res.json()) as Task[]) : []);
      } catch {
        if (!cancelled) setTasks([]);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [base, refreshKey]);

  const days = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    value: String(day),
    // 2026-03-15 is a Sunday, so day N is that date plus N days.
    label: format.dateTime(new Date(2026, 2, 15 + day), { weekday: "long" }),
  }));
  const actionItems = (["RESTART", "BACKUP", "COMMAND"] as const).map((value) => ({
    value,
    label: t(`actions.${value}`),
  }));
  const frequencyItems = (["HOURLY", "DAILY", "WEEKLY"] as const).map((value) => ({
    value,
    label: t(`frequencies.${value}`),
  }));

  function describe(task: Task): string {
    if (task.frequency === "HOURLY") return t("everyHours", { hours: task.everyHours });
    const { localDay, localTime } = toLocal(task.dayOfWeekUtc, task.minuteOfDayUtc);
    return task.frequency === "DAILY"
      ? t("dailyAt", { time: localTime })
      : t("weeklyAt", { day: days[localDay].label, time: localTime });
  }

  function edit(task?: Task) {
    if (!task) return setForm({ ...EMPTY });
    setForm({
      id: task.id,
      name: task.name,
      action: task.action,
      payload: task.payload ?? "",
      frequency: task.frequency,
      everyHours: task.everyHours,
      enabled: task.enabled,
      ...toLocal(task.dayOfWeekUtc, task.minuteOfDayUtc),
    });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      const res = await fetch(form.id ? `${base}/${form.id}` : base, {
        method: form.id ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          action: form.action,
          payload: form.action === "COMMAND" ? form.payload : null,
          frequency: form.frequency,
          everyHours: form.everyHours,
          enabled: form.enabled,
          ...toUtc(form.localDay, form.localTime),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        const key = `errors.${body?.error ?? "internal_error"}` as const;
        toast.error(t.has(key) ? t(key) : t("errors.internal_error"));
        return;
      }
      toast.success(t("saved"));
      setForm(null);
      setRefreshKey((key) => key + 1);
    } catch {
      toast.error(t("errors.internal_error"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(task: Task) {
    if (!window.confirm(t("confirmDelete", { name: task.name }))) return;
    setBusy(true);
    try {
      const res = await fetch(`${base}/${task.id}`, { method: "DELETE" });
      if (!res.ok) toast.error(t("errors.internal_error"));
      setRefreshKey((key) => key + 1);
    } finally {
      setBusy(false);
    }
  }

  const atLimit = (tasks?.length ?? 0) >= MAX_TASKS_PER_SERVER;

  return (
    <section className="rounded-2xl border border-white/5 bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
            <CalendarClock className="size-4" /> {t("title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button onClick={() => edit()} disabled={atLimit}>
          <Plus data-icon="inline-start" /> {t("add")}
        </Button>
      </div>

      <div className="mt-5">
        {tasks === null ? (
          <div className="h-24 animate-pulse rounded-xl bg-white/[0.04]" />
        ) : tasks.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {tasks.map((task) => (
              <li key={task.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {task.name}
                    <Badge variant="outline">{t(`actions.${task.action}`)}</Badge>
                    {task.enabled ? null : <Badge variant="secondary">{t("disabled")}</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {describe(task)}
                    {task.payload ? (
                      <>
                        {" · "}
                        <code className="font-mono">{task.payload}</code>
                      </>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {task.enabled
                      ? t("nextRun", {
                          when: format.dateTime(new Date(task.nextRunAt), {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }),
                        })
                      : null}
                    {task.lastStatus ? ` · ${t("lastRun", { status: task.lastStatus })}` : null}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon-sm" variant="ghost" aria-label={t("edit")} onClick={() => edit(task)}>
                    <Pencil />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("delete")}
                    disabled={busy}
                    onClick={() => remove(task)}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={form !== null} onOpenChange={(next) => (next ? null : setForm(null))}>
        <DialogContent className="sm:max-w-lg">
          {form ? (
            <form onSubmit={save}>
              <DialogHeader>
                <DialogTitle>{form.id ? t("edit") : t("add")}</DialogTitle>
                <DialogDescription>{t("timezoneHint")}</DialogDescription>
              </DialogHeader>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="task-name">{t("name")}</Label>
                  <Input
                    id="task-name"
                    value={form.name}
                    maxLength={60}
                    placeholder={t("namePlaceholder")}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="task-action">{t("action")}</Label>
                  <Select
                    items={actionItems}
                    value={form.action}
                    onValueChange={(value) => setForm({ ...form, action: value as Action })}
                  >
                    <SelectTrigger id="task-action" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {actionItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="task-frequency">{t("frequency")}</Label>
                  <Select
                    items={frequencyItems}
                    value={form.frequency}
                    onValueChange={(value) => setForm({ ...form, frequency: value as Frequency })}
                  >
                    <SelectTrigger id="task-frequency" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {frequencyItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {form.action === "COMMAND" ? (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="task-payload">{t("command")}</Label>
                    <Input
                      id="task-payload"
                      value={form.payload}
                      maxLength={MAX_COMMAND_LENGTH}
                      placeholder="say Server restarts in 5 minutes"
                      className="font-mono"
                      onChange={(e) => setForm({ ...form, payload: e.target.value })}
                      required
                    />
                  </div>
                ) : null}

                {form.frequency === "HOURLY" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="task-hours">{t("everyHoursLabel")}</Label>
                    <Input
                      id="task-hours"
                      type="number"
                      min={1}
                      max={24}
                      value={form.everyHours}
                      onChange={(e) => setForm({ ...form, everyHours: Number(e.target.value) })}
                      required
                    />
                  </div>
                ) : (
                  <>
                    {form.frequency === "WEEKLY" ? (
                      <div className="space-y-1.5">
                        <Label htmlFor="task-day">{t("day")}</Label>
                        <Select
                          items={days}
                          value={String(form.localDay)}
                          onValueChange={(value) => setForm({ ...form, localDay: Number(value) })}
                        >
                          <SelectTrigger id="task-day" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {days.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    <div className="space-y-1.5">
                      <Label htmlFor="task-time">{t("time")}</Label>
                      <Input
                        id="task-time"
                        type="time"
                        value={form.localTime}
                        onChange={(e) => setForm({ ...form, localTime: e.target.value })}
                        required
                      />
                    </div>
                  </>
                )}

                <div className="flex items-center gap-3 sm:col-span-2">
                  <Switch
                    id="task-enabled"
                    checked={form.enabled}
                    onCheckedChange={(checked) => setForm({ ...form, enabled: checked })}
                  />
                  <Label htmlFor="task-enabled">{t("enabled")}</Label>
                </div>
              </div>
              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={() => setForm(null)}>
                  {tc("cancel")}
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  {tc("save")}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
