import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { PageHeader } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";

interface Crumb {
  label: string;
  href?: string;
}

interface PageHeadProps {
  crumbs?: Crumb[];
  /** @deprecated 단축키 힌트 — 새 셸(⌘K)에서는 표시하지 않는다 */
  kbd?: string;              // e.g. "G then D"
  title: string;
  subline?: React.ReactNode; // e.g. "현재 재실 <b>72명</b> · 입실 마감까지 1시간 26분"
  actions?: React.ReactNode;
  className?: string;
}

// 레거시 페이지 머리 — backoffice PageHeader 로 그린다(제목 t8→t10 bold, 설명 한 줄, 우측 버튼).
// crumbs 는 제목 위 작은 경로 줄(t3)로 보여 준다. 새 코드는 PageHeader 를 직접 쓴다.
export function PageHead({ crumbs, title, subline, actions, className }: PageHeadProps) {
  return (
    <div className={className}>
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="경로" className="mb-x3 flex flex-wrap items-center gap-x1 t3-medium text-fg-neutral-subtle">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <Fragment key={i}>
                {i > 0 && <ChevronRight className="size-3.5 text-fg-placeholder" aria-hidden />}
                {c.href && !last ? (
                  <Link href={c.href} className="rounded-r1 transition-colors hover:text-fg-neutral">
                    {c.label}
                  </Link>
                ) : (
                  <span className={cn(last && "text-fg-neutral-muted")} aria-current={last ? "page" : undefined}>
                    {c.label}
                  </span>
                )}
              </Fragment>
            );
          })}
        </nav>
      )}
      <PageHeader title={title} description={subline} actions={actions} />
    </div>
  );
}
