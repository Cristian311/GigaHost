"use client";

import { ChevronRight, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { MAX_COMMAND_LENGTH } from "@/lib/constants";

/** Command line under the console. Arrow keys walk through what was sent before. */
export function ConsoleInput({
  serverId,
  disabled,
  onSent,
}: {
  serverId: string;
  disabled: boolean;
  onSent: () => void;
}) {
  const t = useTranslations("dashboard.console");
  const router = useRouter();
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const history = useRef<string[]>([]);
  const cursor = useRef(-1);

  async function send() {
    const command = value.trim();
    if (!command || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/command`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        const key = `errors.${body?.error ?? "internal_error"}` as const;
        toast.error(t.has(key) ? t(key) : t("errors.internal_error"));
        return;
      }
      history.current = [command, ...history.current.filter((entry) => entry !== command)].slice(0, 50);
      cursor.current = -1;
      setValue("");
      const body = (await res.json()) as { handledAs: string };
      // "stop" and "restart" change the server's state, not just the console.
      if (body.handledAs !== "command") router.refresh();
      onSent();
    } catch {
      toast.error(t("errors.internal_error"));
    } finally {
      setSending(false);
    }
  }

  function recall(direction: 1 | -1) {
    const next = cursor.current + direction;
    if (next < -1 || next >= history.current.length) return;
    cursor.current = next;
    setValue(next === -1 ? "" : history.current[next]);
  }

  return (
    <div className="mt-3 flex items-center gap-2 rounded-xl bg-black/50 px-3 font-mono text-xs">
      {sending ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <ChevronRight className="size-3.5 shrink-0 text-success" />
      )}
      <Input
        value={value}
        disabled={disabled}
        maxLength={MAX_COMMAND_LENGTH}
        placeholder={disabled ? t("offline") : t("placeholder")}
        aria-label={t("placeholder")}
        autoComplete="off"
        spellCheck={false}
        className="h-9 border-0 bg-transparent px-0 font-mono text-xs shadow-none focus-visible:ring-0"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void send();
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            recall(1);
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            recall(-1);
          }
        }}
      />
    </div>
  );
}
