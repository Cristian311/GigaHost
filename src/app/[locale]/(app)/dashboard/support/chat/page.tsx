import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { CloseTicketButton } from "@/components/support/close-ticket-button";
import { TicketThread } from "@/components/support/ticket-thread";
import { toThreadMessages } from "@/components/support/types";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth-guard";
import {
  getOrCreateChat,
  isStaffOnline,
  listMessages,
} from "@/server/services/ticket-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("support");
  return { title: t("liveChat") };
}

export default async function LiveChatPage({ params }: PageProps<"/[locale]/dashboard/support/chat">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();

  const chat = await getOrCreateChat(user.id);
  const [t, thread, staffOnline] = await Promise.all([
    getTranslations("support"),
    listMessages(chat.id, user),
    isStaffOnline(),
  ]);

  return (
    <>
      <Link
        href="/dashboard/support"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("backToSupport")}
      </Link>

      <PageHeader title={t("liveChat")} subtitle={t("liveChatSubtitle")}>
        <CloseTicketButton
          ticketId={chat.id}
          label={t("endChat")}
          confirmText={t("endChatConfirm")}
          redirectTo="/dashboard/support"
        />
      </PageHeader>

      {/* Keyed by chat id so starting a new chat after one ends resets the thread. */}
      <TicketThread
        key={chat.id}
        ticketId={chat.id}
        initialMessages={toThreadMessages(thread.messages)}
        status={chat.status}
        viewerId={user.id}
        mode="chat"
        initialStaffOnline={staffOnline}
      />
    </>
  );
}
