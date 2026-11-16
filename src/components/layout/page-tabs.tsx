"use client";

import { useLayoutEffect, useRef } from "react";
import { NotificationBadge } from "@seed-design/react";
import { LinkTabs } from "@/components/backoffice/ui";
import type { NavTab } from "./nav-config";

/**
 * 여러 화면을 묶은 메뉴의 머리 — 메뉴 제목 → 탭 → (각 화면의 설명·버튼·내용) 순서.
 * 각 화면의 PageHeader 제목은 탭 이름과 겹치므로 셸이 [data-page-tabs] 로 숨긴다.
 * 창 높이에 맞춘 화면(학생 메시지 등)이 이 블록 높이만큼 빼서 계산하도록 --page-tabs-h 를 <main> 에 적는다
 * (글자 크기가 SEED 배율에 따라 달라져 재서 쓴다. 첫 그리기 전 값은 셸의 어림값).
 */
export function PageTabs({
  title,
  tabs,
  current,
  badges,
}: {
  title: string;
  tabs: NavTab[];
  current: string;
  badges?: Record<string, number>;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const set = () =>
      host.style.setProperty(
        "--page-tabs-h",
        `${el.offsetHeight + parseFloat(getComputedStyle(el).marginBottom)}px`,
      );
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      host.style.removeProperty("--page-tabs-h");
    };
  }, []);

  return (
    <div ref={ref} className="mb-x5 md:mb-x6">
      <h1 className="t8-bold text-fg-neutral md:t10-bold">{title}</h1>
      <LinkTabs
        className="mb-0 mt-x3 md:mt-x4"
        size="lg"
        current={current}
        items={tabs.map((t) => {
          const count = badges?.[t.href] ?? 0;
          return {
            value: t.href,
            href: t.href,
            label: (
              <>
                {t.label}
                {count > 0 && (
                  <NotificationBadge size="large" aria-label={`미확인 ${count}건`}>
                    {count > 99 ? "99+" : count}
                  </NotificationBadge>
                )}
              </>
            ),
          };
        })}
      />
    </div>
  );
}
