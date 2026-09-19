"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Client shell around server-rendered panels. The panels arrive as props, so
 * the activity log stays a Server Component while the tab strip is interactive.
 */
export function ServerTabs({
  overview,
  backups,
  activity,
}: {
  overview: ReactNode;
  backups: ReactNode;
  activity: ReactNode;
}) {
  const t = useTranslations("dashboard.tabs");

  return (
    <Tabs defaultValue="overview" className="mt-6">
      <TabsList>
        <TabsTrigger value="overview">{t("overview")}</TabsTrigger>
        <TabsTrigger value="backups">{t("backups")}</TabsTrigger>
        <TabsTrigger value="activity">{t("activity")}</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="pt-4">
        {overview}
      </TabsContent>
      <TabsContent value="backups" className="pt-4">
        {backups}
      </TabsContent>
      <TabsContent value="activity" className="pt-4">
        {activity}
      </TabsContent>
    </Tabs>
  );
}
