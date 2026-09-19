"use client";

import { Loader2, PauseCircle, PlayCircle } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ServerStatusBadge } from "@/components/dashboard/server-status-badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import type { ServerStatus } from "@/generated/prisma/client";
import { suspendServerAction, unsuspendServerAction } from "@/server/actions/admin";

export type AdminServerRow = {
  id: string;
  name: string;
  status: ServerStatus;
  ramGb: number;
  vcpu: number;
  storageGb: number;
  createdAt: Date;
  owner: { id: string; name: string | null; email: string };
  game: { name: string; slug: string };
  region: { name: string; flag: string; code: string };
};

export function AdminServersTable({ servers }: { servers: AdminServerRow[] }) {
  const t = useTranslations("admin.servers");
  const tc = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<AdminServerRow | null>(null);
  const [reason, setReason] = useState("");

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error ?? tc("error"));
        return;
      }
      setTarget(null);
      setReason("");
      router.refresh();
    });
  }

  if (servers.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-white/10 px-6 py-16 text-center text-sm text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-white/5 bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("owner")}</TableHead>
              <TableHead>{t("game")}</TableHead>
              <TableHead>{t("region")}</TableHead>
              <TableHead>{t("resources")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead>{t("created")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {servers.map((server) => (
              <TableRow key={server.id}>
                <TableCell className="font-medium">{server.name}</TableCell>
                <TableCell>
                  <p>{server.owner.name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{server.owner.email}</p>
                </TableCell>
                <TableCell>{server.game.name}</TableCell>
                <TableCell>
                  {server.region.flag} {server.region.name}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  {server.ramGb} GB · {server.vcpu} vCPU · {server.storageGb} GB
                </TableCell>
                <TableCell>
                  <ServerStatusBadge status={server.status} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {format.dateTime(server.createdAt, { dateStyle: "medium" })}
                </TableCell>
                <TableCell className="text-right">
                  {server.status === "SUSPENDED" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => run(() => unsuspendServerAction(server.id))}
                    >
                      <PlayCircle data-icon="inline-start" />
                      {t("unsuspend")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => setTarget(server)}
                    >
                      <PauseCircle data-icon="inline-start" />
                      {t("suspend")}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("suspendTitle")}</DialogTitle>
            <DialogDescription>{t("suspendDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">{t("reason")}</Label>
            <Input
              id="reason"
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              {tc("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                target &&
                run(() =>
                  suspendServerAction({
                    serverId: target.id,
                    reason: reason.trim() || undefined,
                  }),
                )
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : null}
              {t("suspend")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
