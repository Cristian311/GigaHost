"use client";

import { Ban, PlayCircle, RefreshCw, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import type { ServerStatus } from "@/generated/prisma/client";
import { ServerStatusBadge } from "@/components/dashboard/server-status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import {
  adminDeleteServerAction,
  retryProvisioningAction,
  suspendServerAction,
  unsuspendServerAction,
} from "@/server/actions/admin";
import type { ActionResult } from "@/server/actions/servers";

export type AdminServerRow = {
  id: string;
  name: string;
  status: ServerStatus;
  lastError: string | null;
  ownerEmail: string;
  gameName: string;
  regionFlag: string;
  regionName: string;
  ramGb: number;
  vcpu: number;
  storageGb: number;
  address: string | null;
  createdAt: Date;
};

export function AdminServersTable({ servers }: { servers: AdminServerRow[] }) {
  const t = useTranslations("admin.servers");
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(
    server: AdminServerRow,
    action: (id: string) => Promise<ActionResult>,
    successMessage: string,
    confirmMessage?: string,
  ) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    startTransition(async () => {
      const result = await action(server.id);
      if (!result.ok) {
        const key = `errors.${result.error}`;
        toast.error(t.has(key) ? t(key) : t("errors.internal_error"));
        return;
      }
      toast.success(successMessage);
      router.refresh();
    });
  }

  /**
   * Suspending asks for a reason instead of a plain confirmation: it is shown
   * in the server's activity log and recorded in the audit trail. An empty
   * answer still suspends; cancelling aborts.
   */
  function suspend(server: AdminServerRow) {
    const reason = window.prompt(t("suspendConfirm"), "");
    if (reason === null) return;
    run(
      server,
      (id) => suspendServerAction({ serverId: id, reason: reason.trim() || undefined }),
      t("suspended"),
    );
  }

  if (servers.length === 0) {
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
            <TableHead>{t("server")}</TableHead>
            <TableHead>{t("owner")}</TableHead>
            <TableHead>{t("region")}</TableHead>
            <TableHead>{t("resources")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead>{t("address")}</TableHead>
            <TableHead>{t("created")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {servers.map((server) => {
            const suspended = server.status === "SUSPENDED";
            return (
              <TableRow key={server.id}>
                <TableCell>
                  <p className="font-medium">{server.name}</p>
                  <p className="text-xs text-muted-foreground">{server.gameName}</p>
                </TableCell>
                <TableCell>{server.ownerEmail}</TableCell>
                <TableCell>
                  {server.regionFlag} {server.regionName}
                </TableCell>
                <TableCell className="text-xs tabular-nums whitespace-nowrap">
                  {server.ramGb} GB · {server.vcpu} vCPU · {server.storageGb} GB
                </TableCell>
                <TableCell>
                  <ServerStatusBadge status={server.status} />
                  {server.lastError && server.status === "ERROR" ? (
                    <p
                      className="mt-1 max-w-56 truncate text-xs text-destructive"
                      title={server.lastError}
                    >
                      {t("lastError")}: {server.lastError}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="font-mono text-xs">{server.address ?? "—"}</TableCell>
                <TableCell>{format.dateTime(server.createdAt, { dateStyle: "medium" })}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {/* A paid order whose server never built. Retrying is the
                        difference between an incident and a refund. */}
                    {server.status === "ERROR" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => run(server, retryProvisioningAction, t("retried"))}
                      >
                        <RefreshCw data-icon="inline-start" /> {t("retry")}
                      </Button>
                    ) : null}
                    {suspended ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => run(server, unsuspendServerAction, t("unsuspended"))}
                      >
                        <PlayCircle data-icon="inline-start" /> {t("unsuspend")}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => suspend(server)}
                      >
                        <Ban data-icon="inline-start" /> {t("suspend")}
                      </Button>
                    )}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={pending}
                      aria-label={t("delete")}
                      onClick={() =>
                        run(server, adminDeleteServerAction, t("deleted"), t("deleteConfirm"))
                      }
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
