import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-tg-hint" role="status">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorState({
  label,
  retryLabel,
  onRetry,
}: {
  label: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center" role="alert">
      <p className="text-sm text-tg-hint">{label}</p>
      <div className="w-40">
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      </div>
    </div>
  );
}
