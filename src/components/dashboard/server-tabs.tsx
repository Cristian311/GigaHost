"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = ["overview", "files", "players", "addons", "tasks", "backups", "activity"] as const;
export type ServerTab = (typeof TABS)[number];

/**
 * Client shell around server-rendered panels. The panels arrive as props, so
 * the activity log stays a Server Component while the tab strip is interactive.
 */
export function ServerTabs({ panels }: { panels: Record<ServerTab, ReactNode> }) {
  const t = useTranslations("dashboard.tabs");

  return (
    <Tabs defaultValue="overview" className="mt-6">
      {/* Seven tabs do not fit a phone; the strip scrolls rather than wraps. */}
      <div className="scrollbar-thin overflow-x-auto">
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {t(tab)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {TABS.map((tab) => (
        <TabsContent key={tab} value={tab} className="pt-4">
          {panels[tab]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
