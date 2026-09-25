"use client";

// 내 일정 / 등원 스케줄 — 헤더 아래 sticky SEED Tabs (클라이언트 상태).
// TabsContent 는 lazyMount/unmountOnExit 없이 쓰면 비활성 패널도 마운트된 채 display:none 으로만 숨겨진다
// → 작성 중인 입력값이 탭 전환에도 유지된다.

import { useState, type ReactNode } from "react";
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from "seed-design/ui/tabs";

type TabKey = "my" | "submit";

const TABS: { key: TabKey; label: string }[] = [
  { key: "my", label: "내 일정" },
  { key: "submit", label: "등원 스케줄" },
];

export function ScheduleTabs({
  mySchedule,
  submit,
}: {
  mySchedule: ReactNode;
  submit: ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("my");

  function select(next: TabKey) {
    if (next === tab) return;
    setTab(next);
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
  }

  return (
    <TabsRoot
      value={tab}
      onValueChange={(v) => select(v as TabKey)}
      triggerLayout="fill"
      size="medium"
    >
      <div className="sticky top-[calc(env(safe-area-inset-top)+56px)] z-20 -mx-4 mb-x3 bg-[var(--portal-surface,var(--seed-color-bg-layer-basement))]">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <TabsContent value="my">{mySchedule}</TabsContent>
      <TabsContent value="submit">{submit}</TabsContent>
    </TabsRoot>
  );
}
