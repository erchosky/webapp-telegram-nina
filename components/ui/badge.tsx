import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "neutral"
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "success" | "danger" | "warning";
}) {
  const tones = {
    neutral: "border-borderSoft bg-panelSoft text-muted",
    accent: "border-accent/30 bg-accent/10 text-accent",
    success: "border-success/30 bg-success/10 text-success",
    danger: "border-danger/30 bg-danger/10 text-danger",
    warning: "border-amber-400/30 bg-amber-400/10 text-amber-300"
  };

  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs", tones[tone])}>
      {children}
    </span>
  );
}
