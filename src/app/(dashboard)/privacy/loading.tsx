import { Skeleton } from "@/components/backoffice/ui";

export default function Loading() {
  return (
    <div className="flex flex-col gap-x6" role="status" aria-label="불러오는 중">
      <Skeleton className="h-16" />
      <Skeleton className="h-28" />
      <Skeleton className="h-72" />
    </div>
  );
}
