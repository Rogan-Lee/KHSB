"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CountBadge } from "@/components/backoffice/ui";

export function StudentDetailTabs({
  defaultTab,
  children,
  tabItems,
}: {
  defaultTab: string;
  children: React.ReactNode;
  tabItems: { value: string; label: string; badge?: number }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") || defaultTab;

  function handleTabChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <Tabs value={currentTab} onValueChange={handleTabChange}>
      <TabsList aria-label="원생 상세 메뉴">
        {tabItems.map((item) => (
          <TabsTrigger key={item.value} value={item.value}>
            {item.label}
            {/* 미완료 과제·미확인 요청 등 처리할 건수 */}
            {item.badge != null && item.badge > 0 && <CountBadge count={item.badge} />}
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </Tabs>
  );
}
