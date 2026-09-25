import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { loadLunchFormData } from "@/lib/lunch-data";
import { LunchOrderForm } from "@/components/lunch/lunch-order-form";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "점심 도시락 신청 · 강한선배 | KHSB",
  description: "자녀의 점심 도시락을 신청하는 학부모 전용 페이지입니다.",
};

export default async function ParentLunchPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await loadLunchFormData(token);
  if (!data) redirect("/s/expired");

  // 포털 셸 밖이라 SEED 토큰·폰트(data-portal)와 BottomCTA 배경(--portal-surface)을 직접 지정
  return (
    <div
      data-portal
      data-seed-color-mode="light-only"
      className="min-h-[100svh] bg-bg-layer-basement"
      style={
        {
          "--portal-surface": "var(--seed-color-bg-layer-basement)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
        } as CSSProperties
      }
    >
      <header className="bg-bg-layer-basement" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex h-x14 max-w-[480px] items-center gap-x2 px-x5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/portal-icon.svg" alt="" className="size-x7 rounded-r2" />
          <span className="t7-bold text-fg-neutral">강한선배</span>
          <span className="ml-auto truncate t4-medium text-fg-neutral-subtle">
            {data.studentName} 학생
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-[480px] px-x4 pb-x4 pt-x1">
        <LunchOrderForm {...data.form} />
      </main>
    </div>
  );
}
