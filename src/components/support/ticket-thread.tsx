"use client";

import { Loader2, SendHorizontal, ShieldCheck, StickyNote } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { TicketStatus } from "@/generated/prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { MessagesPayload, ThreadMessage } from "./types";

const POLL_MS = { chat: 3000, ticket: 10000 } as const;
/** Auto-scroll only while the reader is this close to the bottom. */
const STICK_THRESHOLD_PX = 80;

type Props = {
  ticketId: string;
  initialMessages: ThreadMessage[];
  /** Server-rendered status; refreshed via router.refresh when polling sees a change. */
  status: TicketStatus;
  viewerId: string;
  mode: "ticket" | "chat";
  /** Staff view: internal notes and the internal-note switch. */
  staffView?: boolean;
  initialStaffOnline?: boolean;
  /** Fallback label for customer messages when the customer has no name. */
  customerName?: string;
};

function byTime(a: ThreadMessage, b: ThreadMessage) {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

/**
 * One conversation, used for tickets and live chat on both sides. New
 * messages are polled (3 s in chat, 10 s for tickets) with an inclusive
 * `after` cursor and merged by id; sending goes through the API so the page
 * is not re-rendered mid-conversation.
 */
export function TicketThread({
  ticketId,
  initialMessages,
  status,
  viewerId,
  mode,
  staffView = false,
  initialStaffOnline = false,
  customerName,
}: Props) {
  const t = useTranslations("support");
  const format = useFormatter();
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [polledStatus, setPolledStatus] = useState<TicketStatus | null>(null);
  const [staffOnline, setStaffOnline] = useState(initialStaffOnline);
  const [draft, setDraft] = useState("");
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const cursorRef = useRef(initialMessages.at(-1)?.createdAt);
  const statusRef = useRef(status);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const customerChat = mode === "chat" && !staffView;

  const merge = useCallback((incoming: ThreadMessage[]) => {
    if (incoming.length === 0) return;
    for (const message of incoming) {
      if (!cursorRef.current || message.createdAt > cursorRef.current) {
        cursorRef.current = message.createdAt;
      }
    }
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      return fresh.length === 0 ? prev : [...prev, ...fresh].sort(byTime);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (document.hidden) return;
      try {
        const after = cursorRef.current;
        const query = after ? `?after=${encodeURIComponent(after)}` : "";
        const res = await fetch(`/api/tickets/${ticketId}/messages${query}`, { cache: "no-store" });
        if (cancelled || !res.ok) return;
        const data = (await res.json()) as MessagesPayload;
        if (cancelled) return;
        merge(data.messages);
        setStaffOnline(data.staffOnline);
        setPolledStatus(data.ticket.status);
        // Changed elsewhere (the other side or another admin): refresh the
        // header and controls. A customer's ended chat is handled in place,
        // because reloading the chat page would open a fresh chat.
        if (data.ticket.status !== statusRef.current && !customerChat) router.refresh();
      } catch {
        // Network hiccup: keep what we have and try again on the next tick.
      }
    }

    const id = setInterval(tick, POLL_MS[mode]);
    const onVisible = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ticketId, mode, merge, router, customerChat]);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
  }

  const closed = status === "CLOSED" || polledStatus === "CLOSED";
  const canWrite = staffView || !closed;

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, isInternal: staffView && internal }),
      });
      const data = (await res.json().catch(() => null)) as
        | { message?: ThreadMessage; error?: string }
        | null;
      if (!res.ok || !data?.message) {
        const key = `errors.${data?.error ?? "internal_error"}`;
        toast.error(t.has(key) ? t(key) : t("errors.internal_error"));
        return;
      }
      setDraft("");
      setInternal(false);
      stickRef.current = true;
      merge([data.message]);
    } catch {
      toast.error(t("errors.internal_error"));
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    const submit = mode === "chat" ? !e.shiftKey : e.ctrlKey || e.metaKey;
    if (submit) {
      e.preventDefault();
      void send();
    }
  }

  function authorLabel(message: ThreadMessage) {
    if (message.author.id === viewerId) return t("you");
    if (message.isStaff) {
      return staffView ? (message.author.name ?? t("staff")) : (message.author.name ?? t("supportTeam"));
    }
    return message.author.name ?? customerName ?? t("customer");
  }

  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-white/5 bg-card">
      {customerChat ? (
        <div className="flex items-center gap-2 border-b border-white/5 px-5 py-3 text-sm">
          <span
            className={cn("size-2 rounded-full", staffOnline ? "bg-success" : "bg-muted-foreground/50")}
          />
          <span className={staffOnline ? "text-success" : "text-muted-foreground"}>
            {staffOnline ? t("staffOnline") : t("staffOffline")}
          </span>
        </div>
      ) : null}

      <div
        ref={listRef}
        onScroll={onScroll}
        aria-live="polite"
        className={cn(
          "scrollbar-thin flex flex-col gap-4 overflow-y-auto px-5 py-5",
          mode === "chat" ? "h-[55vh] min-h-72" : "max-h-[65vh]",
        )}
      >
        {messages.length === 0 ? (
          <p className="m-auto max-w-xs text-center text-sm text-muted-foreground">{t("chatWelcome")}</p>
        ) : (
          messages.map((message) => {
            // Customers see their own messages on the right; staff see every staff message there.
            const mine = staffView ? message.isStaff : message.author.id === viewerId;
            return (
              <div
                key={message.id}
                className={cn(
                  "flex max-w-[85%] flex-col gap-1",
                  mine ? "items-end self-end" : "items-start self-start",
                )}
              >
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/80">{authorLabel(message)}</span>
                  {message.isStaff ? (
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                      <ShieldCheck /> {t("staff")}
                    </Badge>
                  ) : null}
                  {message.isInternal ? (
                    <Badge variant="outline" className="h-4 border-warning/40 px-1.5 text-[10px] text-warning">
                      <StickyNote /> {t("internalNote")}
                    </Badge>
                  ) : null}
                  <time dateTime={message.createdAt}>
                    {format.dateTime(new Date(message.createdAt), { dateStyle: "short", timeStyle: "short" })}
                  </time>
                </div>
                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap",
                    message.isInternal
                      ? "border border-warning/30 bg-warning/10"
                      : mine
                        ? "bg-primary/15"
                        : "bg-white/[0.05]",
                  )}
                >
                  {message.body}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-white/5 p-4">
        {canWrite ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="space-y-3"
          >
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={mode === "chat" ? t("chatPlaceholder") : t("replyPlaceholder")}
              aria-label={t("message")}
              maxLength={5000}
              rows={mode === "chat" ? 1 : 3}
              className="max-h-48"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              {staffView ? (
                <div className="flex items-center gap-2">
                  <Switch
                    id={`internal-${ticketId}`}
                    checked={internal}
                    onCheckedChange={(checked) => setInternal(checked)}
                  />
                  <Label htmlFor={`internal-${ticketId}`} className="text-xs text-muted-foreground">
                    {t("internalNote")} · {t("internalNoteHint")}
                  </Label>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {mode === "chat" ? t("sendHintChat") : t("sendHintTicket")}
                </p>
              )}
              <Button type="submit" disabled={sending || !draft.trim()}>
                {sending ? <Loader2 className="animate-spin" /> : <SendHorizontal data-icon="inline-start" />}
                {t("send")}
              </Button>
            </div>
          </form>
        ) : customerChat ? (
          <div className="flex flex-col items-center gap-3 py-1 text-sm text-muted-foreground">
            <p>{t("chatEnded")}</p>
            <Button variant="outline" size="sm" onClick={() => router.refresh()}>
              {t("newChat")}
            </Button>
          </div>
        ) : (
          <p className="py-1 text-center text-sm text-muted-foreground">{t("closedNotice")}</p>
        )}
      </div>
    </section>
  );
}
