import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("errors.notFound");
  return (
    <main className="bg-glow flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <p className="text-gradient font-heading text-7xl font-bold">404</p>
      <h1 className="mt-4 text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-2 max-w-md text-muted-foreground">{t("desc")}</p>
      <Button className="mt-8" size="lg" render={<Link href="/" />}>
        {t("cta")}
      </Button>
    </main>
  );
}
