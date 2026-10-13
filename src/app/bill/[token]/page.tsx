import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Prose } from "@/components/portal/prose";
import { BILL_APP_MISSING_PARAM, getBillByToken } from "@/lib/tuition/core";
import { BillScreen } from "./bill-screen";

// 수강료 청구서 링크 — 앱이 없는 학부모가 로그인 없이 청구 내용을 보고 결제한다.
// 주소의 토큰이 곧 인증이다. 그래서 토큰이 밖으로 새지 않게 한다:
//  · referrer 를 끈다 — 결제창(결제사 도메인)으로 넘어갈 때 이 주소가 Referer 로 실려 가지 않게
//  · 검색 색인 차단, 링크 미리보기(OG)에는 학생 이름·금액을 넣지 않는다
//  · 페이지를 여는 것만으로는 아무 것도 바뀌지 않는다 (링크 미리보기 봇이 먼저 연다)

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FFFFFF",
};

export const metadata: Metadata = {
  title: { absolute: "수강료 청구서 · 강한선배" },
  description: "수강료 청구 내용을 확인하고 결제하는 학부모 전용 페이지입니다.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  openGraph: {
    type: "website",
    siteName: "강한선배",
    title: "수강료 청구서",
    description: "청구 내용을 확인하고 결제해 주세요.",
    locale: "ko_KR",
  },
};

// 포털 셸 밖이라 SEED 토큰·폰트(data-portal)와 BottomCTA 배경(--portal-surface)을 직접 지정 (/meal 과 같은 방식)
const SHELL_STYLE = {
  "--portal-surface": "var(--seed-color-bg-layer-basement)",
  paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
} as CSSProperties;

export default async function BillPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, query, headerList] = await Promise.all([params, searchParams, headers()]);
  const bill = await getBillByToken(token);

  // 없는 토큰은 404 로 답한다 (화면은 not-found.tsx)
  if (!bill) notFound();

  // 화면에 필요한 값만 넘긴다 — 내부 id 는 브라우저로 보내지 않는다 (앱 주소에 든 학생 id 는 앱이 자녀를 고르는 데 쓴다)
  const { invoiceId: _invoiceId, studentId: _studentId, appLink, appIntentLink, guideText, onsiteGuideText, ...view } =
    bill;
  void _invoiceId;
  void _studentId;
  const android = /Android/i.test(headerList.get("user-agent") ?? "");

  return (
    <div data-portal data-seed-color-mode="light-only" className="min-h-[100svh] bg-bg-layer-basement" style={SHELL_STYLE}>
      <header className="bg-bg-layer-basement" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex h-x14 max-w-[480px] items-center gap-x2 px-x5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/portal-icon.svg" alt="" className="size-x7 rounded-r2" />
          <span className="t7-bold text-fg-neutral">강한선배</span>
          <span className="ml-auto truncate t4-medium text-fg-neutral-subtle">{view.studentName} 학생</span>
        </div>
      </header>
      <main className="mx-auto max-w-[480px] px-x4 pb-x4 pt-x1">
        <BillScreen
          token={token}
          bill={view}
          appHref={android ? appIntentLink : appLink}
          appMissing={query[BILL_APP_MISSING_PARAM] === "0"}
          guide={guideText?.trim() ? <Prose source={guideText} size="sm" /> : null}
          onsiteGuide={onsiteGuideText?.trim() ? <Prose source={onsiteGuideText} size="sm" /> : null}
        />
      </main>
    </div>
  );
}
