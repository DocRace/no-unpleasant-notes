"use client";

import { IconArrowBack } from "@/components/icons";

export function PortfolioNav() {
  return (
    <a
      href="https://race.li"
      className="absolute left-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-200/60 hover:text-zinc-900 sm:left-6 md:left-8 lg:left-10 xl:left-12 2xl:left-14 dark:text-zinc-400 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-100"
      aria-label="Back to Race Li's personal site"
    >
      <IconArrowBack className="size-5 shrink-0" />
      Back to Race Li&apos;s site
    </a>
  );
}
