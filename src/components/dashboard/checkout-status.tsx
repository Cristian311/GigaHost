"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";

type State = "pending" | "paid" | "failed" | "slow";

const POLL_MS = 2000;
/** After this long the page stops spinning and points at the billing page. */
const GIVE_UP_MS = 60_000;

/**
 * Waits for the payment webhook. The gateway redirects the customer back the
 * moment they pay, usually a second or two before the order is fulfilled.
 */
export function CheckoutStatus({ orderId }: { orderId: string }) {
  const t = useTranslations("checkout");
  const router = useRouter();
  const [state, setState] = useState<State>("pending");

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const res = await fetch(`/api/orders/${orderId}/checkout`, { cache: "no-store" });
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as { status: State; serverId?: string };
          if (data.status === "paid" && data.serverId) {
            setState("paid");
            router.replace(`/dashboard/servers/${data.serverId}`);
            return;
          }
          if (data.status === "failed") {
            setState("failed");
            return;
          }
        } else if (res.status === 404) {
          setState("failed");
          return;
        }
      } catch {
        // a dropped request is retried on the next tick
      }
      if (cancelled) return;
      if (Date.now() - startedAt > GIVE_UP_MS) {
        setState("slow");
        return;
      }
      timer = setTimeout(poll, POLL_MS);
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderId, router]);

  const Icon = state === "failed" ? XCircle : state === "paid" ? CheckCircle2 : Loader2;

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-white/5 bg-card p-8 text-center">
      <Icon
        className={
          state === "failed"
            ? "mx-auto size-12 text-destructive"
            : state === "paid"
              ? "mx-auto size-12 text-success"
              : "mx-auto size-12 animate-spin text-primary"
        }
      />
      <h1 className="mt-5 font-heading text-xl font-semibold">{t(`${state}.title`)}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t(`${state}.body`)}</p>

      {state === "failed" ? (
        <Button className="mt-6" render={<Link href="/configure" />}>
          {t("tryAgain")}
        </Button>
      ) : null}
      {state === "slow" ? (
        <Button className="mt-6" variant="outline" render={<Link href="/dashboard/billing" />}>
          {t("goToBilling")}
        </Button>
      ) : null}
    </div>
  );
}
