import { Card } from "@/components/ui/Card";

function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-full bg-borderSoft/70 ${className}`} />;
}

function SkeletonCard() {
  return (
    <Card>
      <SkeletonLine className="h-4 w-32" />
      <SkeletonLine className="mt-4 h-8 w-20" />
      <SkeletonLine className="mt-3 h-3 w-48" />
    </Card>
  );
}

export default function Loading() {
  return (
    <div aria-label="Cargando sección del dashboard" aria-busy="true">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SkeletonLine className="h-7 w-56" />
          <SkeletonLine className="mt-3 h-4 w-72 max-w-full" />
        </div>
        <SkeletonLine className="h-10 w-36 rounded-md" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <Card>
          <SkeletonLine className="h-5 w-40" />
          <div className="mt-5 space-y-4">
            <SkeletonLine className="h-14 w-full rounded-lg" />
            <SkeletonLine className="h-14 w-full rounded-lg" />
            <SkeletonLine className="h-14 w-5/6 rounded-lg" />
          </div>
        </Card>
        <Card>
          <SkeletonLine className="h-5 w-36" />
          <div className="mt-5 space-y-4">
            <SkeletonLine className="h-12 w-full rounded-lg" />
            <SkeletonLine className="h-12 w-full rounded-lg" />
            <SkeletonLine className="h-12 w-4/5 rounded-lg" />
          </div>
        </Card>
      </div>
    </div>
  );
}
