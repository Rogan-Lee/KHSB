"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ShieldCheck } from "lucide-react";

type HeaderConfig = {
  title: string;
  showBack: boolean;
  backHref?: string;
};

function resolveHeader(pathname: string, token: string): HeaderConfig {
  const root = `/s/${token}`;
  if (pathname === root) {
    return { title: "내 포털", showBack: false };
  }
  if (pathname === `${root}/tasks`) {
    return { title: "수행평가", showBack: true, backHref: root };
  }
  if (pathname.startsWith(`${root}/tasks/`)) {
    return { title: "과제 상세", showBack: true, backHref: `${root}/tasks` };
  }
  if (pathname === `${root}/survey` || pathname.startsWith(`${root}/survey/`)) {
    return { title: "초기 설문", showBack: true, backHref: root };
  }
  if (pathname.startsWith(`${root}/feedback`)) {
    return { title: "피드백", showBack: true, backHref: root };
  }
  return { title: "내 포털", showBack: false };
}

export function StudentAppHeader({
  token,
  studentName,
  daysLeft,
}: {
  token: string;
  studentName: string;
  daysLeft: number;
}) {
  const pathname = usePathname() ?? `/s/${token}`;
  const router = useRouter();
  const { title, showBack, backHref } = resolveHeader(pathname, token);

  return (
    <header
      className="sticky top-0 z-30 border-b border-line bg-panel/85 backdrop-blur-md"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex h-12 max-w-[480px] items-center gap-2 px-3">
        {showBack ? (
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) router.back();
              else if (backHref) router.push(backHref);
            }}
            aria-label="뒤로"
            className="-ml-1.5 inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 active:bg-canvas-2"
          >
            <ChevronLeft className="h-[22px] w-[22px]" />
          </button>
        ) : (
          <Link
            href={`/s/${token}`}
            aria-label="홈"
            className="-ml-1 flex h-9 items-center gap-1.5 rounded-full px-1.5 text-ink-2"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand/12 text-brand">
              <ShieldCheck className="h-4 w-4" strokeWidth={2.4} />
            </span>
            <span className="text-[12px] font-semibold tracking-[-0.01em] text-ink-3">
              {studentName}
            </span>
          </Link>
        )}

        <h1 className="flex-1 truncate text-center text-[14.5px] font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h1>

        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold tabular-nums ${
            daysLeft <= 3
              ? "bg-bad-soft text-bad-ink"
              : daysLeft <= 7
                ? "bg-warn-soft text-warn-ink"
                : "bg-canvas-2 text-ink-4"
          }`}
          aria-label={`매직링크 만료까지 ${daysLeft}일`}
        >
          D-{daysLeft}
        </span>
      </div>
    </header>
  );
}
