"use client";

import type { InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className">;

/**
 * Accessible circular checkbox: real input (screen-reader + keyboard) + styled peer indicator.
 */
export function CircleCheckbox(props: Props) {
  return (
    <>
      <input {...props} type="checkbox" className="peer sr-only" />
      <span
        aria-hidden
        className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 border-zinc-400 bg-white text-transparent transition-colors peer-checked:border-black peer-checked:bg-black peer-checked:text-white peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-black peer-focus-visible:ring-offset-2 dark:border-zinc-500 dark:bg-zinc-900 dark:peer-checked:border-zinc-100 dark:peer-checked:bg-zinc-100 dark:peer-checked:text-zinc-900 dark:peer-focus-visible:ring-zinc-100 dark:peer-focus-visible:ring-offset-zinc-950 [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100"
      >
        <svg
          className="size-2.5"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2.5 6L5 8.5L9.5 3.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </>
  );
}
