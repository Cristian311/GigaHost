"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Props = ComponentProps<"div"> & {
  delay?: number;
};

/**
 * Reveals children with a fade + slide when they scroll into view.
 *
 * Server-rendered as fully visible (no dependency on hydration); on the client,
 * elements that start below the fold are hidden and animated in with CSS when
 * they intersect the viewport.
 */
export function FadeIn({ delay = 0, className, style, children, ...props }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "hidden" | "shown">("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.9) {
      setState("shown");
      return;
    }

    setState("hidden");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState("shown");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -60px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        state === "hidden" && "opacity-0",
        state === "shown" &&
          "animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-700",
        className,
      )}
      style={{ ...style, animationDelay: state === "shown" ? `${delay}s` : undefined }}
      {...props}
    >
      {children}
    </div>
  );
}
