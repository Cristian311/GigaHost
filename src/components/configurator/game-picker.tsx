"use client";

import Image from "next/image";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConfiguratorGame } from "./use-configurator";

export function GamePicker({
  games,
  value,
  onChange,
}: {
  games: ConfiguratorGame[];
  value: string;
  onChange: (slug: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {games.map((game) => {
        const selected = game.slug === value;
        return (
          <button
            key={game.slug}
            type="button"
            onClick={() => onChange(game.slug)}
            aria-pressed={selected}
            className={cn(
              "group relative overflow-hidden rounded-xl border text-left transition-all",
              selected
                ? "border-primary shadow-[0_0_0_1px_var(--primary)]"
                : "border-white/5 hover:border-white/20",
            )}
          >
            <div className="relative aspect-[16/10]">
              <Image
                src={game.image}
                alt={game.name}
                fill
                unoptimized
                sizes="200px"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <p className="absolute right-2 bottom-2 left-2 text-xs font-semibold leading-tight text-white">
                {game.name}
              </p>
              {selected ? (
                <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3" strokeWidth={3} />
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
