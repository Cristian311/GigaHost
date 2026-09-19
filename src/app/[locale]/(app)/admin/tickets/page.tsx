import { Search } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { TicketStatus } from "@/generated/prisma/client";
import { AdminTicketsTable } from "@/components/admin/tickets-table";
import { AdminSupportPulse } from "@/components/support/admin-support-pulse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/server/auth-guard";
import { countTicketsNeedingReply, listAllTickets } from "@/server/services/ticket-service";

const STATUS_FILTERS: TicketStatus[] = ["OPEN", "PENDING", "RESOLVED", "CLOSED"];
type Filter = TicketStatus | "needs" | "chat";

const LIST_LIMIT = 200;
/** New tickets and replies show up without a manual reload. */
const REFRESH_MS = 15_000;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function filterHref(filter: Filter | undefined, q: string) {
  const query = new URLSearchParams();
  if (filter) query.set("filter", filter);
  if (q) query.set("q", q);
  const search = query.toString();
  return search ? `/admin/tickets?${search}` : "/admin/tickets";
}

export default async function AdminTicketsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/tickets">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();

  const query = await searchParams;
  const q = first(query.q)?.trim() ?? "";
  const raw = first(query.filter);
  const status = STATUS_FILTERS.find((s) => s === raw);
  const filter: Filter | undefined = status ?? (raw === "needs" || raw === "chat" ? raw : undefined);

  const [t, tickets, needsReply] = await Promise.all([
    getTranslations("support"),
    listAllTickets({
      status,
      needsReply: filter === "needs",
      kind: filter === "chat" ? "CHAT" : undefined,
      q,
    }),
    countTicketsNeedingReply(),
  ]);

  const chip = (value: Filter | undefined, label: string) => (
    <Link
      key={value ?? "all"}
      href={filterHref(value, q)}
      className={cn(
        "shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
        filter === value
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );

  return (
    <>
      <AdminSupportPulse refreshMs={REFRESH_MS} />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/5 bg-card/60 p-1">
          {chip(undefined, t("admin.all"))}
          {chip("needs", needsReply > 0 ? `${t("admin.needsReply")} (${needsReply})` : t("admin.needsReply"))}
          {chip("chat", t("admin.chats"))}
          {STATUS_FILTERS.map((s) => chip(s, t(`admin.statuses.${s}`)))}
        </div>
        {/* Plain GET form: submits to the current URL, keeping the filter. */}
        <form className="flex gap-2 lg:w-96">
          {filter ? <input type="hidden" name="filter" value={filter} /> : null}
          <Input
            name="q"
            defaultValue={q}
            placeholder={t("admin.searchPlaceholder")}
            aria-label={t("admin.search")}
          />
          <Button type="submit" variant="outline">
            <Search data-icon="inline-start" /> {t("admin.search")}
          </Button>
        </form>
      </div>

      <AdminTicketsTable
        tickets={tickets.map((ticket) => ({
          id: ticket.id,
          kind: ticket.kind,
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
          awaitingStaff: ticket.awaitingStaff,
          customer: ticket.user.name ?? ticket.user.email,
          customerEmail: ticket.user.email,
          assignee: ticket.assignee ? (ticket.assignee.name ?? ticket.assignee.email) : null,
          lastMessageAt: ticket.lastMessageAt,
        }))}
      />

      {tickets.length >= LIST_LIMIT ? (
        <p className="mt-3 text-xs text-muted-foreground">{t("admin.limitNotice")}</p>
      ) : null}
    </>
  );
}
