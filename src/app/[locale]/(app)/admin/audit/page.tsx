import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAuditLogs } from "@/server/services/audit-service";
import { requireAdmin } from "@/server/auth-guard";

export default async function AdminAuditPage({ params }: PageProps<"/[locale]/admin/audit">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  const [t, format, entries] = await Promise.all([
    getTranslations("admin.audit"),
    getFormatter(),
    listAuditLogs(200),
  ]);

  if (entries.length === 0) {
    return (
      <p className="rounded-2xl border border-white/5 bg-card px-5 py-10 text-center text-sm text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/5 bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("date")}</TableHead>
            <TableHead>{t("actor")}</TableHead>
            <TableHead>{t("action")}</TableHead>
            <TableHead>{t("target")}</TableHead>
            <TableHead>{t("details")}</TableHead>
            <TableHead>{t("ip")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {format.dateTime(entry.createdAt, { dateStyle: "medium", timeStyle: "short" })}
              </TableCell>
              <TableCell>{entry.actor?.email ?? t("deletedUser")}</TableCell>
              <TableCell>
                {t.has(`actions.${entry.action}`) ? t(`actions.${entry.action}`) : entry.action}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {entry.targetType ? `${entry.targetType}${entry.targetId ? ` ${entry.targetId}` : ""}` : "—"}
              </TableCell>
              <TableCell className="max-w-xs truncate font-mono text-xs text-muted-foreground">
                {entry.meta ? JSON.stringify(entry.meta) : "—"}
              </TableCell>
              <TableCell className="font-mono text-xs">{entry.ip ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
