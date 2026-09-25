import type { ReactNode } from "react";
import { PageHeader } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";

/**
 * 학생 메시지 2단 화면 틀 — 창 높이에 맞춘 카드 안에서 목록·대화가 각자 스크롤한다(페이지 스크롤 없음).
 *
 * 셸 기준값: 상단 바 56px(h-14) · <main> 패딩 모바일 pt 20px / pb 64px, 데스크톱(md) pt 32px / pb 64px.
 *  - list: 페이지 머리 + 카드. 높이 = 100dvh − 56 − pt − 아래 여백(모바일 16 · 데스크톱 32),
 *          남는 main pb 는 음수 margin 으로 상쇄해 창 높이를 넘지 않게 한다.
 *  - chat: 모바일은 셸 패딩을 모두 상쇄해 대화만 화면 가득(앱 대화방처럼), 데스크톱은 list 와 같은 틀.
 */
export function InboxFrame({
  mode,
  list,
  children,
}: {
  mode: "list" | "chat";
  /** 왼쪽 대화 목록 */
  list: ReactNode;
  /** 오른쪽 대화 영역 (list 모드에선 데스크톱 안내 화면) */
  children: ReactNode;
}) {
  const chat = mode === "chat";
  return (
    <div
      className={cn(
        "flex flex-col",
        chat ? "-mx-4 -mt-5 -mb-16 h-[calc(100dvh-3.5rem)]" : "-mb-12 h-[calc(100dvh-5.75rem)]",
        "md:mx-0 md:mt-0 md:-mb-8 md:h-[calc(100dvh-7.5rem)]",
      )}
    >
      <PageHeader
        title="학생 메시지"
        description="담당 학생과 1:1로 대화해요. 새 메시지는 자동으로 불러와요."
        className={cn("mb-x4 shrink-0 md:mb-x6", chat && "hidden md:block")}
      />
      <div
        className={cn(
          "flex min-h-0 flex-1 overflow-hidden bg-bg-layer-default",
          chat
            ? "md:rounded-r4 md:border md:border-stroke-neutral-muted"
            : "rounded-r4 border border-stroke-neutral-muted",
        )}
      >
        <aside
          aria-label="대화 목록"
          className={cn(
            "min-h-0 w-full shrink-0 flex-col md:flex md:w-80 md:border-r md:border-stroke-neutral-muted lg:w-[360px]",
            chat ? "hidden" : "flex",
          )}
        >
          {list}
        </aside>
        <section className={cn("min-h-0 min-w-0 flex-1 flex-col", chat ? "flex" : "hidden md:flex")}>
          {children}
        </section>
      </div>
    </div>
  );
}
