import type { Metadata } from "next";
import { Logo } from "@/components/layout/logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    <div className="bg-glow relative flex flex-1 flex-col">
      <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden />
      <header className="relative mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <LanguageSwitcher />
      </header>
      <main className="relative flex flex-1 items-center justify-center px-4 pb-16">
        <div className="glass w-full max-w-md rounded-3xl p-8">{children}</div>
      </main>
    </div>
  );
}
