"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { PRESENCE_INTERVAL_MS } from "@/lib/ticket-status";

/**
 * Marks the admin as online for the live chat while a support page is
 * visible, and optionally refreshes the page so new tickets show up.
 */
export function AdminSupportPulse({ refreshMs }: { refreshMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    function beat() {
      if (document.hidden) return;
      void fetch("/api/support/presence", { method: "POST" }).catch(() => undefined);
    }
    beat();
    const id = setInterval(beat, PRESENCE_INTERVAL_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);

  useEffect(() => {
    if (!refreshMs) return;
    const id = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, refreshMs);
    return () => clearInterval(id);
  }, [refreshMs, router]);

  return null;
}
