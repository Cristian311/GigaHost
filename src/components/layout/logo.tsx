import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn("group flex items-center gap-2 font-heading text-lg font-bold", className)}
    >
      <span className="glow-primary flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform group-hover:scale-105">
        <Zap className="size-4" strokeWidth={2.5} />
      </span>
      <span>
        Giga<span className="text-gradient">Host</span>
      </span>
    </Link>
  );
}
