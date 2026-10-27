import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson } from "@/lib/mobile-auth";
import { getParentParking, registerParentParking } from "@/lib/mobile-parent-parking";
import { requireParentChildFromBody, requireParentChildFromQuery } from "@/lib/mobile-parent-services";

// 주차장 사이트 로그인·검색·적용에 수 초 걸린다
export const maxDuration = 30;

/** 학부모 주차 등록 — 오늘 등록 내역·한도·마지막 차량 — GET ?studentId= */
export async function GET(request: NextRequest) {
  try {
    const { parent, child } = await requireParentChildFromQuery(request);
    return mobileJson(await getParentParking(parent.authUserId, child));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

/** 주차 등록 — POST { studentId, carNo } */
export async function POST(request: NextRequest) {
  try {
    const { parent, child, body } = await requireParentChildFromBody(request);
    return mobileJson(await registerParentParking(parent.authUserId, child, body));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
