import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson } from "@/lib/mobile-auth";
import { requireParentChildFromBody } from "@/lib/mobile-parent-services";
import { startParentTuitionCheckout } from "@/lib/mobile-parent-tuition";

// next dev·next start 의 request.nextUrl.origin 은 접속한 주소가 아니라 서버가 뜬 주소(localhost)다.
// 모의 결제 페이지를 실기기·에뮬레이터에서도 열 수 있게, 운영이 아닐 때는 접속한 Host 로 주소를 만든다.
// 운영은 결제사 링크를 그대로 쓰므로 이 값이 쓰이지 않는다 (Host 헤더를 믿는 것은 개발 환경뿐).
function checkoutBaseUrl(request: NextRequest): string {
  if (process.env.NODE_ENV === "production") return request.nextUrl.origin;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host || !/^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host)) return request.nextUrl.origin;
  const https =
    request.headers.get("x-forwarded-proto")?.includes("https") ?? request.nextUrl.protocol === "https:";
  return `${https ? "https" : "http"}://${host}`;
}

/** 결제하기 — 결제 링크 발급(이미 있으면 같은 링크) — POST { studentId, invoiceId } */
export async function POST(request: NextRequest) {
  try {
    const { parent, child, body } = await requireParentChildFromBody(request);
    return mobileJson(
      await startParentTuitionCheckout(parent.authUserId, child, body, checkoutBaseUrl(request)),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
