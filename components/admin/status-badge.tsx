import { Badge } from "@/components/ui/badge";
import { accessStatusLabel, accessStatusTone } from "@/lib/dashboard/texts";

export function StatusBadge({ status }: { status?: string | null }) {
  return <Badge tone={accessStatusTone(status)}>{accessStatusLabel(status)}</Badge>;
}
