"use client";

import { Eye } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type AdminEmailRow = {
  id: string;
  to: string;
  subject: string;
  template: string;
  status: "LOGGED" | "SENT" | "FAILED";
  error: string | null;
  html: string;
  text: string;
  createdAt: string;
};

/** Links found in the plain-text part, so an admin can follow them in development. */
function linksIn(text: string): string[] {
  return [...new Set(text.match(/https?:\/\/[^\s<>"]+/g) ?? [])];
}

const STATUS_VARIANT = {
  SENT: "default",
  LOGGED: "secondary",
  FAILED: "destructive",
} as const;

export function EmailsTable({ emails }: { emails: AdminEmailRow[] }) {
  const t = useTranslations("admin.emails");
  const format = useFormatter();
  const [open, setOpen] = useState<AdminEmailRow | null>(null);

  if (emails.length === 0) {
    return (
      <p className="rounded-2xl border border-white/5 bg-card px-5 py-10 text-center text-sm text-muted-foreground">
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
              <TableHead>{t("date")}</TableHead>
              <TableHead>{t("to")}</TableHead>
              <TableHead>{t("subject")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {emails.map((email) => (
              <TableRow key={email.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {format.dateTime(new Date(email.createdAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </TableCell>
                <TableCell>{email.to}</TableCell>
                <TableCell>
                  {email.subject}
                  <p className="font-mono text-xs text-muted-foreground">{email.template}</p>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[email.status]} title={email.error ?? undefined}>
                    {t(`statuses.${email.status}`)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("preview")}
                    onClick={() => setOpen(email)}
                  >
                    <Eye />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open !== null} onOpenChange={(next) => (next ? null : setOpen(null))}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{open?.subject}</DialogTitle>
            <DialogDescription>{open?.to}</DialogDescription>
          </DialogHeader>
          {open?.error ? (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {open.error}
            </p>
          ) : null}
          {/* The empty sandbox keeps the message inert: no scripts, no forms, no
              navigation of the admin page. Links are shown but open nothing. */}
          <iframe
            title={open?.subject ?? ""}
            sandbox=""
            srcDoc={open?.html ?? ""}
            className="h-[55vh] w-full rounded-lg border border-white/10 bg-white"
          />
          {open && linksIn(open.text).length > 0 ? (
            <div className="text-xs">
              <p className="mb-1 font-medium text-muted-foreground">{t("links")}</p>
              <ul className="space-y-1">
                {linksIn(open.text).map((href) => (
                  <li key={href}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-primary hover:underline"
                    >
                      {href}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
