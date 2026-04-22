import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { Fragment } from "react";

interface Crumb {
  label: string;
  href?: string;
}

interface PageHeadProps {
  crumbs?: Crumb[];
  kbd?: string;              // e.g. "G then D"
  title: string;
  subline?: React.ReactNode; // e.g. "현재 재실 <b>72명</b> · 입실 마감까지 1시간 26분"
  actions?: React.ReactNode;
  className?: string;
}

// Page header for v4 shell — crumb + kbd hint + big 44px h1 + right actions.
export function PageHead({ crumbs, kbd, title, subline, actions, className }: PageHeadProps) {
  return (
    <div className={cn("px-0 pt-1 pb-0", className)}>
      {(crumbs?.length || kbd) && (
        <div className="flex items-center gap-2 text-[13px] text-ink-3 mb-2">
          {crumbs?.map((c, i) => (
            <Fragment key={i}>
              {i > 0 && <ChevronRight className="h-3 w-3 text-ink-5" />}
              <span className={cn(
                i === (crumbs.length - 1) ? "text-ink-2 font-medium" : "text-ink-3"
              )}>
                {c.label}
              </span>
            </Fragment>
          ))}
          {kbd && (
            <kbd className="ml-1.5 font-mono text-[10.5px] text-ink-4 px-1.5 py-0.5 rounded-[4px] bg-canvas border border-line">
              {kbd}
            </kbd>
          )}
        </div>
      )}
      <div className="flex items-end gap-[18px] flex-wrap mt-1.5">
        <h1 className="text-[44px] font-[650] tracking-[-0.035em] leading-[1.05] text-ink m-0 shrink-0 whitespace-nowrap">
          {title}
        </h1>
        {subline && (
          <div className="flex-1 basis-[200px] min-w-0 text-[14px] text-ink-3 font-[450] mb-1.5 truncate">
            {subline}
          </div>
        )}
        {actions && (
          <div className="ml-auto flex gap-2 mb-1.5 items-center">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
