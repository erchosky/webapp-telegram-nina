import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-borderSoft bg-panel/88 p-4 shadow-soft backdrop-blur",
        className
      )}
      {...props}
    />
  );
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-1 text-xs font-semibold uppercase tracking-normal text-tg-hint">
      {children}
    </h2>
  );
}

export function SectionHeader({
  title,
  description,
  action
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-ink">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
