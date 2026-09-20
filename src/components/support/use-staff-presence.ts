"use client";

import { useEffect, useState } from "react";
import { PRESENCE_INTERVAL_MS } from "@/lib/ticket-status";

/** Whether support staff is online; null until the first answer arrives. */
export function useStaffPresence(): boolean | null {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/support/presence", { cache: "no-store" });
        if (!cancelled && res.ok) {
          const data = (await res.json()) as { staffOnline: boolean };
          setOnline(data.staffOnline);
        }
      } catch {
        // Keep the last known value.
      }
    }

    void check();
    const id = setInterval(check, PRESENCE_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return online;
}
