"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors.generic");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-2 max-w-md text-muted-foreground">{t("desc")}</p>
      <Button className="mt-8" onClick={reset}>
        {t("retry")}
      </Button>
    </main>
  );
}
