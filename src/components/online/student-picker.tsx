// 온라인 관리 "학생 선택 → 상세" 2단 화면 공용 뼈대 (학생·화상 세션·일일 보고 패널).
// 훅이 없어 서버/클라이언트 어디서든 import 가능. 색·글자는 SEED 시맨틱 유틸만 쓴다.

import type { ReactNode } from "react";
import { MousePointerClick, SearchX } from "lucide-react";
import { EmptyState } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";

/** 좌측 목록 + 우측 상세 — 모바일은 위아래로 쌓인다 */
export function MasterDetail({ list, detail }: { list: ReactNode; detail: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-x4 lg:grid-cols-[320px_minmax(0,1fr)]">
      {list}
      {detail}
    </div>
  );
}

/** 좌측 학생 목록 카드 */
export function PickerList({
  header,
  isEmpty,
  emptyTitle = "조건에 맞는 학생이 없어요",
  emptyDescription = "검색어나 필터를 바꿔 보세요",
  children,
}: {
  header?: ReactNode;
  isEmpty?: boolean;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <aside className="flex flex-col overflow-hidden rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default lg:sticky lg:top-20">
      {header != null && (
        <div className="flex min-h-12 items-center justify-between gap-x2 border-b border-stroke-neutral-muted px-x4 py-x2 t3-regular text-fg-neutral-subtle">
          {header}
        </div>
      )}
      {isEmpty ? (
        <EmptyState compact icon={SearchX} title={emptyTitle} description={emptyDescription} />
      ) : (
        <ul className="max-h-80 divide-y divide-stroke-neutral-muted overflow-y-auto lg:max-h-[calc(100dvh-220px)]">
          {children}
        </ul>
      )}
    </aside>
  );
}

/** 좌측 목록 행 — 선택되면 회색 채움 */
export function PickerItem({
  active,
  onClick,
  name,
  grade,
  muted = false,
  badges,
  description,
  extra,
}: {
  active: boolean;
  onClick: () => void;
  name: ReactNode;
  grade?: ReactNode;
  /** 퇴원 등 비활성 학생 */
  muted?: boolean;
  /** 이름 줄 오른쪽 배지 */
  badges?: ReactNode;
  /** 둘째 줄 보조 정보 */
  description?: ReactNode;
  /** 셋째 줄(다음 세션 등) */
  extra?: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "true" : undefined}
        className={cn(
          "block w-full px-x4 py-x3 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stroke-focus-ring",
          active ? "bg-bg-neutral-weak" : "hover:bg-bg-layer-default-pressed",
        )}
      >
        <div className="flex items-center gap-x2">
          <span
            className={cn(
              "truncate",
              active ? "t4-bold" : "t4-medium",
              muted ? "text-fg-neutral-subtle line-through" : "text-fg-neutral",
            )}
          >
            {name}
          </span>
          {grade != null && <span className="shrink-0 t3-regular text-fg-neutral-subtle">{grade}</span>}
          {badges != null && <span className="ml-auto inline-flex shrink-0 items-center gap-x1">{badges}</span>}
        </div>
        {description != null && (
          <div className="mt-x1 flex flex-wrap items-center gap-x-x1_5 gap-y-x0_5 t3-regular text-fg-neutral-subtle">
            {description}
          </div>
        )}
        {extra != null && <div className="mt-x1 t3-regular text-fg-neutral-muted">{extra}</div>}
      </button>
    </li>
  );
}

/** 우측 상세 카드 */
export function DetailPane({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "flex min-h-[480px] min-w-0 flex-col rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** 상세 카드 머리 — 학생 이름 + 보조 정보 + 버튼 */
export function DetailPaneHeader({
  title,
  meta,
  description,
  actions,
}: {
  title: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-x3 border-b border-stroke-neutral-muted px-x5 py-x4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x2">
          <h2 className="t7-bold text-fg-neutral">{title}</h2>
          {meta}
        </div>
        {description != null && (
          <p className="mt-x1 flex flex-wrap items-center gap-x-x1_5 t3-regular text-fg-neutral-subtle">{description}</p>
        )}
      </div>
      {actions != null && <div className="flex shrink-0 flex-wrap items-center gap-x2">{actions}</div>}
    </header>
  );
}

/** 상세 카드 안 구획 — 카드 중첩 대신 구분선으로 나눈다 */
export function PaneSection({
  title,
  description,
  count,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-stroke-neutral-muted px-x5 py-x5 first:border-t-0 [header+&]:border-t-0">
      <div className="mb-x4 flex flex-wrap items-center justify-between gap-x2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-x1_5 t5-bold text-fg-neutral">
            {title}
            {count != null && count > 0 && <span className="tabular-nums text-fg-brand">{count}</span>}
          </h3>
          {description != null && <p className="mt-x0_5 t3-regular text-fg-neutral-subtle">{description}</p>}
        </div>
        {actions != null && <div className="flex shrink-0 flex-wrap items-center gap-x2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** 상세 카드가 비었을 때 */
export function DetailPaneEmpty({ title = "왼쪽에서 학생을 선택하세요" }: { title?: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <EmptyState compact icon={MousePointerClick} title={title} />
    </div>
  );
}

/** 목록 헤더에 쓰는 "n / 전체" 카운트 */
export function PickerCount({ shown, total }: { shown: number; total: number }) {
  return (
    <span className="tabular-nums">
      <span className="t3-bold text-fg-neutral">{shown}</span>
      {shown !== total && <span> / {total}</span>}명
    </span>
  );
}
