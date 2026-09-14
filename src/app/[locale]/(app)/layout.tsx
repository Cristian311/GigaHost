import { Navbar } from "@/components/layout/navbar";
import { Sidebar } from "@/components/dashboard/sidebar";
import { requireUser } from "@/server/auth-guard";

export default async function AppLayout({ children }: LayoutProps<"/[locale]">) {
  const user = await requireUser();

  return (
    <>
      <Navbar />
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:gap-10">
        <aside className="md:w-52 md:shrink-0">
          <div className="md:sticky md:top-24">
            <Sidebar isAdmin={user.role === "ADMIN"} />
          </div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </>
  );
}
