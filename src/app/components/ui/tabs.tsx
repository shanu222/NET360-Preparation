"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "./utils";

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-auto w-fit items-center justify-center gap-1 rounded-2xl border border-indigo-100/80 bg-gradient-to-r from-white to-indigo-50/65 p-1.5 text-slate-600 shadow-sm dark:border-white/10 dark:bg-gradient-to-r dark:from-slate-900/85 dark:to-indigo-950/50 dark:text-slate-300 dark:shadow-[0_12px_28px_rgba(2,6,23,0.35)]",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex min-h-[2.45rem] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-indigo-200/70 bg-white/85 px-3 py-1.5 text-center text-[13px] font-semibold leading-tight text-slate-700 whitespace-normal break-words transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800 data-[state=active]:-translate-y-0.5 data-[state=active]:border-transparent data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-violet-500 data-[state=active]:text-white data-[state=active]:shadow-[0_10px_22px_rgba(79,70,229,0.28)] dark:border-white/10 dark:bg-slate-900/55 dark:text-slate-300 dark:hover:border-indigo-400/40 dark:hover:bg-slate-800/80 dark:hover:text-white dark:data-[state=active]:from-indigo-500 dark:data-[state=active]:to-violet-500 dark:data-[state=active]:text-white dark:data-[state=active]:shadow-[0_14px_28px_rgba(99,102,241,0.35)] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
