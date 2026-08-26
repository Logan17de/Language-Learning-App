"use client";

import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";

/**
 * A native <select> restyled to match the rest of the form controls.
 *
 * The browser's default select chrome does not follow the design system: the
 * control keeps the platform arrow, its own font metrics and its own height,
 * so next to an <input class="form-input"> it reads as a different family of
 * control. The element itself stays native so keyboard behaviour, mobile
 * pickers and accessibility come for free; only the presentation changes.
 *
 * appearance-none removes the platform arrow, and a single chevron is drawn in
 * the trailing slot with pointer-events-none so clicks still reach the select.
 */
export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...props}
        className={`form-input cursor-pointer appearance-none bg-none pr-11 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted"
      />
    </div>
  );
}
