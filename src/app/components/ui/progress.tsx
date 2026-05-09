"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "./utils";

function Progress({
  className,
  value,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const pct = Math.round(Number(value ?? 0));
  const valueText = `${pct} percent`;
  const accessibilityProps = ariaLabelledby
    ? ({ 'aria-labelledby': ariaLabelledby, 'aria-valuetext': valueText } as const)
    : ({
        'aria-label': ariaLabel ?? `Progress, ${pct} percent complete`,
        'aria-valuetext': valueText,
      } as const);
  return (
    <ProgressPrimitive.Root
      {...accessibilityProps}
      data-slot="progress"
      className={cn(
        "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
        className,
      )}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="bg-primary h-full w-full flex-1 transition-transform duration-150 ease-out will-change-transform"
        style={{ transform: `translate3d(-${100 - (value || 0)}%, 0, 0)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
