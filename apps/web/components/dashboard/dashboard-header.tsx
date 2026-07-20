"use client";

import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";

import { getDashboardNavItem } from "@/components/dashboard/nav-items";
import { Stat } from "@/components/dashboard/shared";
import { Badge } from "@/components/ui/badge";

export function DashboardHeader({
  kbCount,
  docCount,
  turnCount,
}: {
  kbCount: number;
  docCount: number;
  turnCount: number;
}) {
  const pathname = usePathname();
  const current = getDashboardNavItem(pathname);

  return (
    <header className="relative flex flex-col gap-4 border-4 border-double border-primary/70 bg-card/90 p-4 shadow-[10px_10px_0_rgba(67,45,27,0.16)] backdrop-blur sm:p-5 md:flex-row md:items-end md:justify-between">
      <div className="absolute right-5 top-5 hidden rotate-6 border-2 border-primary/60 px-3 py-1 font-mono text-xs uppercase tracking-[0.28em] text-primary/80 md:block">
        {current.eyebrow}
      </div>
      <div className="space-y-2 sm:space-y-3">
        <Badge variant="secondary" className="w-fit gap-1.5 rounded-none border border-primary/40 bg-secondary px-3 py-1 font-mono uppercase tracking-[0.22em]">
          <Sparkles className="size-3.5" /> DustyKB
        </Badge>
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl md:text-5xl">
            {current.label}
          </h1>
          <p className="mt-2 hidden max-w-2xl border-l-4 border-primary/40 pl-3 text-sm leading-6 text-muted-foreground sm:block md:text-base">
            {current.description}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-center sm:gap-2 md:min-w-72">
        <Stat label="文库" value={kbCount} />
        <Stat label="资料" value={docCount} />
        <Stat label="本轮问答" value={turnCount} />
      </div>
    </header>
  );
}
