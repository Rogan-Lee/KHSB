import type { ReactNode } from "react";
import { PageHeader } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";

/**
 * 가족 톡방 2단 화면 틀 — 학생 메시지(src/app/online/inbox/_components/inbox-frame.tsx)와 같은 치수.
 * 창 높이에 맞춘 카드 안에서 목록·대화가 각자 스크롤한다. 모바일 chat 모드는 대화만 화면 가득.
 */
export function FamilyChatFrame({
  mode,
  list,
  children,
}: {
  mode: "list" | "chat";
  list: ReactNode;
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
        title="가족 톡방"
        description="학생·학부모·운영진이 함께 쓰는 방이에요. 새 메시지는 자동으로 불러와요."
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
          aria-label="톡방 목록"
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
