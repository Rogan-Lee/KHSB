import { Skeleton } from "@/components/portal/ui";

// 화면 전환 시 셸(헤더·탭바)은 유지하고 본문만 스켈레톤으로 즉시 보여준다.
export default function PortalLoading() {
  return (
    <div className="space-y-3 pt-2" aria-busy="true" aria-label="불러오는 중">
      <div className="space-y-2.5 px-1 pb-3">
        <Skeleton className="h-4 w-32 rounded-full" />
        <Skeleton className="h-7 w-56 rounded-full" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-4 rounded-r5 bg-bg-layer-default p-5">
          <Skeleton className="h-5 w-24 rounded-full" />
          <div className="flex items-center gap-3.5">
            <Skeleton className="h-10 w-10 shrink-0 rounded-r3" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4 rounded-full" />
              <Skeleton className="h-3.5 w-1/2 rounded-full" />
            </div>
          </div>
          <div className="flex items-center gap-3.5">
            <Skeleton className="h-10 w-10 shrink-0 rounded-r3" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3 rounded-full" />
              <Skeleton className="h-3.5 w-1/3 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
