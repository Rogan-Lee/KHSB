import { Skeleton } from "@/components/backoffice/ui";

// 온라인 관리 공통 로딩 — 셸(사이드바·상단 바)은 그대로 두고 본문 자리만 뼈대로 보여 준다.
export default function OnlineLoading() {
  return (
    <div aria-busy="true" aria-label="불러오는 중">
      <div className="mb-x8 flex flex-col gap-x2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-72" />
      </div>
      <div className="grid grid-cols-2 gap-x3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] w-full rounded-r4" />
        ))}
      </div>
      <Skeleton className="mt-x6 h-[360px] w-full rounded-r4" />
    </div>
  );
}
